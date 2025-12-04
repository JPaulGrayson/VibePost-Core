import { TwitterApi } from "twitter-api-v2";
import { storage } from "../storage"; // Your DB storage interface
import { generateDraft } from "./postcard_drafter";
import { analyzeTweetIntent } from "./intent_parser";
import { processTourRequest } from "./tour_generator";

// Initialize Client (User Context required for reading mentions)
// Ensure token is present or handle gracefully
const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY || "",
    appSecret: process.env.TWITTER_API_SECRET || "",
    accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
});

export class TwitterListenerService {
    private isRunning = false;
    private checkIntervalMs = 60 * 1000; // 1 Minute (For Testing)

    async startPolling() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("🟢 Sniper Listener Started (Polling every 60s)");

        // Initial Run
        await this.checkMentions();

        // Loop
        setInterval(() => this.checkMentions(), this.checkIntervalMs);
    }

    private async checkMentions() {
        try {
            // 1. Fetch Mentions (Only new ones)
            const userId = process.env.BOT_USER_ID;
            if (!userId) {
                console.warn("BOT_USER_ID not set. Skipping mention check.");
                return;
            }

            console.log(`🔍 Checking mentions for user ${userId}...`);

            const mentions = await client.v2.userMentionTimeline(userId, {
                "tweet.fields": ["author_id", "text", "created_at"],
                "expansions": ["author_id"],
                "user.fields": ["public_metrics", "username"]
            });

            if (!mentions.data.data) {
                console.log("   No new mentions found.");
                return;
            }

            console.log(`   Found ${mentions.data.data.length} mentions.`);

            for (const tweet of mentions.data.data) {
                // 2. Filter: Have we processed this?
                const existing = await storage.getDraftByOriginalTweetId(tweet.id);
                if (existing) {
                    // console.log(`   Skipping processed tweet ${tweet.id}`);
                    continue;
                }

                // 3. Filter: Spam/Low Quality Check
                const author = mentions.includes?.users?.find(u => u.id === tweet.author_id);

                // DISABLED FOR TESTING: Follower count check
                /*
                if (author) {
                    const followers = author.public_metrics?.followers_count || 0;
                    if (followers < 25) {
                        console.log(`Skipping low-quality user: ${author.username}`);
                        continue;
                    }
                }
                */

                // 4. Check Intent
                console.log(`🎯 Valid mention found from @${author?.username}`);
                const analysis = await analyzeTweetIntent(tweet.text, author?.username || "unknown");

                if (analysis.isRequest) {
                    // Path A: It's a Tour Request -> Generate Link
                    await processTourRequest(analysis, tweet);
                } else {
                    // Path B: It's just a mention -> Generate Postcard (Existing Logic)
                    await generateDraft(tweet, author?.username || "unknown");
                }
            }
        } catch (error) {
            console.error("Listener Error:", error);
        }
    }
}

export const twitterListener = new TwitterListenerService();
