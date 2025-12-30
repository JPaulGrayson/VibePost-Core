/**
 * Auto Publisher Service
 * Automatically publishes high-quality leads (score 90+) with rate limiting
 */

import { storage } from "../storage";
import { publishDraft, publishDraftWithVideo } from "./twitter_publisher";
import { generateReplyVideo, generatePersonalizedReplyText } from "./reply_video_generator";

// Configuration
const AUTO_PUBLISH_THRESHOLD = 90; // Only auto-publish 90+ scored leads (97.3% publish rate)
const MAX_DAILY_AUTO_POSTS = 144;   // Capacity for one post every 10 mins
const MIN_INTERVAL_MINUTES = 8;     // Reduced from 10 to clear queue faster

class AutoPublisher {
    private isRunning = false;
    private isPublishing = false; // Lock to prevent concurrent publishing
    private checkIntervalMs = 2 * 60 * 1000; // Check every 2 minutes
    private lastPostTime: Date | null = null;
    private postsToday = 0;
    private lastResetDate = new Date().getDate();
    private enabled = true; // Toggle auto-publishing

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log(`🤖 Auto Publisher started`);
        console.log(`   📊 Threshold: ${AUTO_PUBLISH_THRESHOLD}+ score`);
        console.log(`   ⏱️ Min interval: ${MIN_INTERVAL_MINUTES} minutes`);
        console.log(`   📈 Daily limit: ${MAX_DAILY_AUTO_POSTS} posts`);

        // Check periodically
        setInterval(() => this.checkAndPublish(), this.checkIntervalMs);

        // Initial check
        await this.checkAndPublish();
    }

    enable() {
        this.enabled = true;
        console.log("🤖 Auto Publisher ENABLED");
    }

    disable() {
        this.enabled = false;
        console.log("🤖 Auto Publisher DISABLED");
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    getStatus() {
        return {
            enabled: this.enabled,
            lastPostTime: this.lastPostTime,
            postsToday: this.postsToday,
            threshold: AUTO_PUBLISH_THRESHOLD,
            intervalMinutes: MIN_INTERVAL_MINUTES,
            dailyLimit: MAX_DAILY_AUTO_POSTS,
            nextEligibleTime: this.lastPostTime
                ? new Date(this.lastPostTime.getTime() + MIN_INTERVAL_MINUTES * 60 * 1000)
                : new Date()
        };
    }

    private checkDailyReset() {
        const today = new Date().getDate();
        if (today !== this.lastResetDate) {
            this.postsToday = 0;
            this.lastResetDate = today;
            console.log("🤖 Auto Publisher: Daily counter reset");
        }
    }

    private canPublishNow(): { allowed: boolean; reason?: string } {
        if (!this.enabled) {
            return { allowed: false, reason: "Auto-publish is disabled" };
        }

        this.checkDailyReset();

        if (this.postsToday >= MAX_DAILY_AUTO_POSTS) {
            return { allowed: false, reason: `Daily limit reached (${MAX_DAILY_AUTO_POSTS})` };
        }

        if (this.lastPostTime) {
            const minutesSinceLastPost = (Date.now() - this.lastPostTime.getTime()) / 60000;
            if (minutesSinceLastPost < MIN_INTERVAL_MINUTES) {
                const waitMinutes = Math.ceil(MIN_INTERVAL_MINUTES - minutesSinceLastPost);
                return { allowed: false, reason: `Rate limit: ${waitMinutes} min until next auto-post` };
            }
        }

        return { allowed: true };
    }

    private async checkAndPublish() {
        // Prevent concurrent publishing
        if (this.isPublishing) {
            return;
        }

        const { allowed, reason } = this.canPublishNow();

        if (!allowed) {
            // Silent - don't spam logs with rate limit messages
            return;
        }

        this.isPublishing = true;

        try {
            // Use optimized query that filters at DB level (much faster than fetching all drafts)
            // This returns only pending_review drafts with score >= 80 and valid Twitter IDs
            const eligibleDrafts = await storage.getTopEligibleDrafts({
                minScore: AUTO_PUBLISH_THRESHOLD,
                maxResults: 50,
                status: 'pending_review'
            });

            if (eligibleDrafts.length === 0) {
                return; // No eligible drafts
            }

            // Already sorted by score DESC from the database query
            const draft = eligibleDrafts[0];

            console.log(`🤖 Auto-publishing: ${draft.detectedLocation} (Score: ${draft.score}) by @${draft.originalAuthorHandle}`);

            // Generate personalized video reply based on user's tweet
            // Now with Grok TTS voice personalization!
            console.log(`   🎬 Generating personalized video for @${draft.originalAuthorHandle}...`);
            const videoResult = await generateReplyVideo(
                draft.originalTweetText || "",
                draft.detectedLocation || "",
                draft.originalAuthorHandle || "",  // For voice personalization
                draft.originalAuthorHandle || ""   // Handle used as fallback for name
            );

            let result: { success: boolean; tweetId?: string; error?: string };

            if (videoResult.success && videoResult.videoPath) {
                // Great! We have a video - use it
                const interests = videoResult.interests.map(i => `${i.emoji} ${i.theme}`).join(" • ");
                console.log(`   ✅ Video ready with themes: ${interests}`);

                // Generate AI-personalized reply text that directly addresses their question
                console.log(`   ✍️ Generating personalized reply text...`);
                const replyText = await generatePersonalizedReplyText(
                    draft.originalTweetText || "",
                    draft.originalAuthorHandle || "traveler",
                    draft.detectedLocation || "",
                    videoResult.interests
                );
                console.log(`   📝 Reply: ${replyText.substring(0, 50)}...`);

                // Publish with video as a reply
                result = await publishDraftWithVideo(
                    videoResult.videoPath,
                    replyText,
                    draft.originalTweetId && /^\d+$/.test(draft.originalTweetId) ? draft.originalTweetId : undefined
                );

                // Clean up video file after publishing
                try {
                    const fs = await import('fs');
                    fs.unlinkSync(videoResult.videoPath);
                } catch (e) {
                    // Ignore cleanup errors
                }
            } else {
                // Video generation failed - fall back to static image
                console.log(`   ⚠️ Video generation failed, falling back to image: ${videoResult.error}`);
                result = await publishDraft(draft);
            }

            if (result.success) {
                await storage.updatePostcardDraft(draft.id, {
                    status: "published",
                    publishedAt: new Date(),
                });

                // Create a record in posts table
                await storage.createPost({
                    userId: "system",
                    content: draft.draftReplyText || "",
                    platforms: ["twitter"],
                    status: "published",
                    publishedAt: new Date(),
                    platformData: {
                        twitter: {
                            url: `https://twitter.com/user/status/${result.tweetId}`,
                            tweetId: result.tweetId,
                            replyingTo: draft.originalAuthorHandle,
                            autoPublished: true,
                            videoReply: videoResult.success // Track if it was a video reply
                        }
                    } as any
                } as any);

                this.lastPostTime = new Date();
                this.postsToday++;

                const replyType = videoResult.success ? "🎬 video" : "🖼️ image";
                console.log(`✅ Auto-published ${replyType} reply! Tweet ID: ${result.tweetId} (${this.postsToday}/${MAX_DAILY_AUTO_POSTS} today)`);

            } else {
                // Mark draft as failed so we don't keep retrying it
                console.error(`❌ Auto-publish failed for ${draft.detectedLocation}:`, result.error);

                // Track failures - if image download fails, mark as failed and move on
                const isImageError = result.error?.includes('Image') || result.error?.includes('0 bytes');
                const isRateLimit = result.error?.includes('429') || result.error?.includes('rate limit');

                if (isRateLimit) {
                    console.log("⏳ Rate limited by Twitter - pausing auto-publisher for 15 min");
                    // Extend wait time on rate limit
                    this.lastPostTime = new Date();
                } else if (isImageError) {
                    // Image download failed - mark as failed and skip to next
                    console.log(`⏭️ Skipping draft ${draft.id} due to image error - marking as failed`);
                    await storage.updatePostcardDraft(draft.id, {
                        status: "failed",
                        lastError: result.error
                    });
                } else {
                    // Other error - mark with retry status
                    await storage.updatePostcardDraft(draft.id, {
                        status: "pending_retry",
                        lastError: result.error
                    });
                }
            }

        } catch (error) {
            console.error("Auto-publish check failed:", error);
        } finally {
            this.isPublishing = false; // Release lock
        }
    }
}

export const autoPublisher = new AutoPublisher();
