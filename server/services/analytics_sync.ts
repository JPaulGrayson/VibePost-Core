import { TwitterApi } from 'twitter-api-v2';
import { storage } from '../storage';
import { db } from '../db';
import { postAnalytics, posts } from '@shared/schema';
import { eq, gte, and, inArray } from 'drizzle-orm';
import * as fs from 'fs';

export class AnalyticsSyncService {
    private isSyncing = false;
    private checkIntervalMs = 2 * 60 * 60 * 1000; // 2 Hours (optimized for quota conservation)

    async start() {
        console.log("📈 Analytics Sync Service Started (Syncing every 2 hours)");

        // Initial sync
        this.sync().catch(err => console.error("Initial Analytics Sync failed:", err));

        // Loop
        setInterval(() => this.sync(), this.checkIntervalMs);
    }

    private async getTwitterClient(): Promise<TwitterApi | null> {
        try {
            const twitterConnection = await storage.getPlatformConnection("twitter");
            const credentials = twitterConnection?.credentials;

            const apiKey = process.env.TWITTER_API_KEY || credentials?.apiKey;
            const apiSecret = process.env.TWITTER_API_SECRET || credentials?.apiSecret;
            const accessToken = process.env.TWITTER_ACCESS_TOKEN || credentials?.accessToken;
            const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET || credentials?.accessTokenSecret;

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
            fs.appendFileSync('analytics_sync.log', `[${new Date().toISOString()}] ${msg}\n`);
        };

        try {
            log("Starting analytics sync cycle...");
            const twitterClient = await this.getTwitterClient();
            if (!twitterClient) {
                log("Twitter client not available. Skipping sync.");
                this.isSyncing = false;
                return;
            }

            // 1. Fetch recently published posts (last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const publishedPosts = await db.select()
                .from(posts)
                .where(
                    and(
                        eq(posts.status, 'published'),
                        gte(posts.publishedAt, sevenDaysAgo)
                    )
                );

            log(`Found ${publishedPosts.length} published posts to check.`);

            const twitterPosts = publishedPosts.filter(p => {
                const data = p.platformData as any;
                return data?.twitter?.tweetId;
            });

            log(`Filtering to ${twitterPosts.length} Twitter posts.`);

            if (twitterPosts.length === 0) {
                this.isSyncing = false;
                return;
            }

            // 2. Fetch metrics from Twitter in batches (max 100 per request)
            const tweetIds = twitterPosts.map(p => (p.platformData as any).twitter.tweetId);

            // Batch by 100 as per Twitter API limits
            const BATCH_SIZE = 100;
            for (let i = 0; i < tweetIds.length; i += BATCH_SIZE) {
                const batch = tweetIds.slice(i, i + BATCH_SIZE);
                log(`Fetching batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(tweetIds.length / BATCH_SIZE)} (${batch.length} IDs)...`);

                try {
                    const tweetData = await twitterClient.v2.tweets(batch, {
                        "tweet.fields": ["public_metrics"]
                    });

                    if (!tweetData.data) {
                        log(`   No data returned for batch.`);
                        continue;
                    }

                    log(`   Fetched data for ${tweetData.data.length} tweets.`);

                    for (const tweet of tweetData.data) {
                        const metrics = tweet.public_metrics;
                        if (!metrics) continue;

                        // Find our local post record
                        const post = twitterPosts.find(p => (p.platformData as any).twitter.tweetId === tweet.id);
                        if (!post) continue;

                        log(`   Updating stats for post ${post.id} (Tweet ${tweet.id}): Likes: ${metrics.like_count}, Views: ${metrics.impression_count || 0}`);

                        // 3. Update or Insert analytics record
                        const existing = await db.select()
                            .from(postAnalytics)
                            .where(
                                and(
                                    eq(postAnalytics.postId, post.id),
                                    eq(postAnalytics.platform, 'twitter')
                                )
                            );

                        if (existing.length > 0) {
                            await db.update(postAnalytics)
                                .set({
                                    likes: metrics.like_count,
                                    comments: metrics.reply_count,
                                    shares: metrics.retweet_count,
                                    views: metrics.impression_count || 0,
                                    updatedAt: new Date()
                                })
                                .where(eq(postAnalytics.id, existing[0].id));
                        } else {
                            await db.insert(postAnalytics).values({
                                postId: post.id,
                                platform: 'twitter',
                                likes: metrics.like_count,
                                comments: metrics.reply_count,
                                shares: metrics.retweet_count,
                                views: metrics.impression_count || 0,
                            });
                        }
                    }
                } catch (batchError) {
                    log(`   Batch failed: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
                }
            }

            log("Analytics sync cycle complete.");
        } catch (error) {
            log(`Error in analytics sync: ${error instanceof Error ? error.message : String(error)}`);
            console.error("Analytics sync failed:", error);
        } finally {
            this.isSyncing = false;
        }
    }
}

export const analyticsSync = new AnalyticsSyncService();
