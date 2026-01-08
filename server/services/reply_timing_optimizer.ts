/**
 * Reply Timing Optimizer
 * 
 * Problem: Fetching replies immediately misses the best engagement window
 * Solution: Wait for optimal reply accumulation period
 * 
 * Strategy:
 * 1. When we find a high-quality tweet (≥90%), create draft for original tweet
 * 2. Mark it for "delayed reply fetch" (e.g., 2-4 hours later)
 * 3. Separate process checks for tweets ready for reply fetching
 * 4. Fetch replies when tweet has had time to accumulate quality responses
 * 
 * Benefits:
 * - More replies to choose from
 * - Better quality replies (thoughtful responses take time)
 * - Avoid early spam/bot replies
 * - Catch the "golden window" of engagement
 */

import { storage } from "../storage";
import { keywordSearchEngine } from "../keyword-search";
import { generateDraft } from "./postcard_drafter";

interface DelayedReplyFetch {
    originalTweetId: string;
    originalAuthor: string;
    tweetScore: number;
    foundAt: Date;
    fetchRepliesAt: Date;
    processed: boolean;
}

export class ReplyTimingOptimizer {
    private pendingFetches: Map<string, DelayedReplyFetch> = new Map();
    private isRunning = false;
    private checkIntervalMs = 15 * 60 * 1000; // Check every 15 minutes

    // Optimal timing based on tweet age
    private getOptimalDelayHours(tweetScore: number): number {
        // Higher quality tweets = wait longer for quality replies
        if (tweetScore >= 95) return 3; // 3 hours for top tweets
        if (tweetScore >= 90) return 2; // 2 hours for high-quality
        return 1; // 1 hour minimum
    }

    /**
     * Schedule a tweet for delayed reply fetching
     */
    scheduleReplyFetch(tweetId: string, author: string, score: number) {
        const now = new Date();
        const delayHours = this.getOptimalDelayHours(score);
        const fetchAt = new Date(now.getTime() + delayHours * 60 * 60 * 1000);

        this.pendingFetches.set(tweetId, {
            originalTweetId: tweetId,
            originalAuthor: author,
            tweetScore: score,
            foundAt: now,
            fetchRepliesAt: fetchAt,
            processed: false,
        });

        console.log(`   ⏰ Scheduled reply fetch for tweet ${tweetId} in ${delayHours} hours (at ${fetchAt.toLocaleTimeString()})`);
    }

    /**
     * Start the optimizer - checks periodically for tweets ready to fetch replies
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log("⏰ Reply Timing Optimizer started");
        console.log(`   Checking every ${this.checkIntervalMs / 60000} minutes`);

        // Check immediately
        this.processReadyFetches();

        // Then check periodically
        setInterval(() => this.processReadyFetches(), this.checkIntervalMs);
    }

    /**
     * Process tweets that are ready for reply fetching
     */
    private async processReadyFetches() {
        const now = new Date();
        const ready: DelayedReplyFetch[] = [];

        // Find tweets ready to fetch
        for (const [tweetId, fetch] of Array.from(this.pendingFetches.entries())) {
            if (!fetch.processed && fetch.fetchRepliesAt <= now) {
                ready.push(fetch);
            }
        }

        if (ready.length === 0) {
            console.log(`⏰ No tweets ready for reply fetching (${this.pendingFetches.size} pending)`);
            return;
        }

        console.log(`⏰ Processing ${ready.length} tweets ready for reply fetching...`);

        for (const fetch of ready) {
            try {
                await this.fetchAndProcessReplies(fetch);
                fetch.processed = true;

                // Clean up after 24 hours
                setTimeout(() => {
                    this.pendingFetches.delete(fetch.originalTweetId);
                }, 24 * 60 * 60 * 1000);
            } catch (error) {
                console.error(`   ❌ Failed to fetch replies for ${fetch.originalTweetId}:`, error);
            }
        }
    }

    /**
     * Fetch and process replies for a tweet
     */
    private async fetchAndProcessReplies(fetch: DelayedReplyFetch) {
        console.log(`   🔗 Fetching replies for tweet ${fetch.originalTweetId} (${fetch.tweetScore} score, ${this.getHoursAgo(fetch.foundAt)}h old)`);

        const replies = await keywordSearchEngine.fetchTweetReplies(fetch.originalTweetId, 10);

        if (replies.length === 0) {
            console.log(`      No replies found`);
            return;
        }

        console.log(`      Found ${replies.length} replies, selecting top 3...`);

        // Take top 3 highest-scored replies
        const topReplies = replies.slice(0, 3);

        let draftsCreated = 0;

        for (const reply of topReplies) {
            // Skip if already processed
            const existing = await storage.getDraftByOriginalTweetId(reply.id);
            if (existing) {
                console.log(`      ⏭️  Skipping @${reply.author} (already processed)`);
                continue;
            }

            console.log(`      💬 Creating draft for @${reply.author} (score: ${reply.score})`);

            const replyPostObj = {
                id: reply.id,
                text: reply.content,
                author_id: "unknown"
            };

            const created = await generateDraft(replyPostObj, reply.author);
            if (created) {
                draftsCreated++;
            }
        }

        console.log(`      ✅ Created ${draftsCreated} reply-chain drafts`);
    }

    /**
     * Get hours since a date
     */
    private getHoursAgo(date: Date): number {
        const now = new Date();
        return Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    }

    /**
     * Get status for monitoring
     */
    getStatus() {
        const pending = Array.from(this.pendingFetches.values()).filter(f => !f.processed);
        const processed = Array.from(this.pendingFetches.values()).filter(f => f.processed);

        return {
            isRunning: this.isRunning,
            pendingCount: pending.length,
            processedCount: processed.length,
            nextFetch: pending.length > 0
                ? pending.sort((a, b) => a.fetchRepliesAt.getTime() - b.fetchRepliesAt.getTime())[0].fetchRepliesAt
                : null,
        };
    }
}

export const replyTimingOptimizer = new ReplyTimingOptimizer();
