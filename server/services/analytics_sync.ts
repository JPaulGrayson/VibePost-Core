import { TwitterApi } from 'twitter-api-v2';
import { storage } from '../storage';
import { db } from '../db';
import { postAnalytics, posts, postcardDrafts } from '@shared/schema';
import { eq, gte, and, inArray } from 'drizzle-orm';
import * as fs from 'fs';

export class AnalyticsSyncService {
    private isSyncing = false;
    private checkIntervalMs = 30 * 60 * 1000; // 30 minutes for fresher data

    async start() {
        console.log("📈 Analytics Sync Service Started (Syncing every 30 minutes)");

        // Initial sync after 10 seconds (let server settle)
        setTimeout(() => {
            this.sync().catch(err => console.error("Initial Analytics Sync failed:", err));
        }, 10000);

        // Loop
        setInterval(() => this.sync(), this.checkIntervalMs);
    }

    private async getTwitterClient(): Promise<TwitterApi | null> {
        try {
            const twitterConnection = await storage.getPlatformConnection("twitter");
            const credentials = twitterConnection?.credentials;

            const apiKey = credentials?.apiKey || process.env.TWITTER_API_KEY;
            const apiSecret = credentials?.apiSecret || process.env.TWITTER_API_SECRET;
            const accessToken = credentials?.accessToken || process.env.TWITTER_ACCESS_TOKEN;
            const accessSecret = credentials?.accessTokenSecret || process.env.TWITTER_ACCESS_TOKEN_SECRET;

            if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
                return null;
            }

            return new TwitterApi({
                appKey: apiKey,
                appSecret: apiSecret,
                accessToken: accessToken,
                accessSecret: accessSecret,
            });
        } catch (error) {
            console.error('Failed to get Twitter client for analytics:', error);
            return null;
        }
    }

    async sync() {
        if (this.isSyncing) return;
        this.isSyncing = true;

        const log = (msg: string) => {
            console.log(`[Analytics] ${msg}`);
        };

        try {
            log("Starting analytics sync cycle...");
            const twitterClient = await this.getTwitterClient();
            if (!twitterClient) {
                log("Twitter client not available. Skipping sync.");
                this.isSyncing = false;
                return;
            }

            // Collect all tweet IDs from both posts AND postcard_drafts
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // 1. Get published posts from main posts table
            const publishedPosts = await db.select()
                .from(posts)
                .where(
                    and(
                        eq(posts.status, 'published'),
                        gte(posts.publishedAt, sevenDaysAgo)
                    )
                );

            // 2. Get published drafts from postcard_drafts table (sniper posts)
            const publishedDrafts = await db.select()
                .from(postcardDrafts)
                .where(
                    and(
                        eq(postcardDrafts.status, 'published'),
                        gte(postcardDrafts.publishedAt, sevenDaysAgo)
                    )
                );

            log(`Found ${publishedPosts.length} posts + ${publishedDrafts.length} sniper drafts`);

            // Build a unified list of tweet IDs with their source
            interface TweetSource {
                tweetId: string;
                type: 'post' | 'draft';
                id: number;
                platformData: any;
            }

            const tweetSources: TweetSource[] = [];

            // Add posts with twitter tweetId
            for (const post of publishedPosts) {
                const data = post.platformData as any;
                const tweetId = data?.twitter?.tweetId || data?.twitter?.id;
                if (tweetId && /^\d+$/.test(tweetId)) {
                    tweetSources.push({
                        tweetId,
                        type: 'post',
                        id: post.id,
                        platformData: data
                    });
                }
            }

            // Add drafts with tweetId
            for (const draft of publishedDrafts) {
                const tweetId = draft.tweetId;
                if (tweetId && /^\d+$/.test(tweetId)) {
                    tweetSources.push({
                        tweetId,
                        type: 'draft',
                        id: draft.id,
                        platformData: {}
                    });
                }
            }

            log(`Syncing metrics for ${tweetSources.length} tweets`);

            if (tweetSources.length === 0) {
                log("No tweets to sync.");
                this.isSyncing = false;
                return;
            }

            // Batch fetch metrics from Twitter (max 100 per request)
            const BATCH_SIZE = 100;
            let updatedCount = 0;
            let totalLikes = 0;
            let totalViews = 0;

            for (let i = 0; i < tweetSources.length; i += BATCH_SIZE) {
                const batch = tweetSources.slice(i, i + BATCH_SIZE);
                const batchIds = batch.map(t => t.tweetId);

                try {
                    const tweetData = await twitterClient.v2.tweets(batchIds, {
                        "tweet.fields": ["public_metrics"]
                    });

                    if (!tweetData.data) {
                        log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}: No data returned`);
                        continue;
                    }

                    for (const tweet of tweetData.data) {
                        const metrics = tweet.public_metrics;
                        if (!metrics) continue;

                        const source = batch.find(t => t.tweetId === tweet.id);
                        if (!source) continue;

                        totalLikes += metrics.like_count || 0;
                        totalViews += metrics.impression_count || 0;

                        // Update the source record with metrics
                        if (source.type === 'post') {
                            // Update posts.platformData.twitter with metrics
                            const currentData = source.platformData || {};
                            await db.update(posts)
                                .set({
                                    platformData: {
                                        ...currentData,
                                        twitter: {
                                            ...(currentData.twitter || {}),
                                            tweetId: tweet.id,
                                            likes: metrics.like_count || 0,
                                            replies: metrics.reply_count || 0,
                                            retweets: metrics.retweet_count || 0,
                                            quotes: metrics.quote_count || 0,
                                            impressions: metrics.impression_count || 0,
                                            bookmarks: metrics.bookmark_count || 0,
                                            lastSyncedAt: new Date().toISOString()
                                        }
                                    }
                                })
                                .where(eq(posts.id, source.id));
                            updatedCount++;
                        } else {
                            // Update postcard_drafts with metrics (for sniper posts)
                            await db.update(postcardDrafts)
                                .set({
                                    likes: metrics.like_count || 0,
                                    retweets: metrics.retweet_count || 0,
                                    replies: metrics.reply_count || 0,
                                    impressions: metrics.impression_count || 0
                                })
                                .where(eq(postcardDrafts.id, source.id));
                            updatedCount++;
                        }
                    }
                } catch (batchError: any) {
                    // Handle rate limiting gracefully
                    if (batchError.code === 429) {
                        log(`   Rate limited - will retry next cycle`);
                        break;
                    }
                    log(`   Batch error: ${batchError.message || batchError}`);
                }

                // Small delay between batches to avoid rate limits
                await new Promise(r => setTimeout(r, 500));
            }

            log(`Sync complete: ${updatedCount} records updated (Total: ${totalLikes} likes, ${totalViews} views)`);

        } catch (error) {
            log(`Error: ${error instanceof Error ? error.message : String(error)}`);
            console.error("Analytics sync failed:", error);
        } finally {
            this.isSyncing = false;
        }
    }
}

export const analyticsSync = new AnalyticsSyncService();
