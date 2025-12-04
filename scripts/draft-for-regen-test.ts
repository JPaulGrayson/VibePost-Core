import "dotenv/config";
import { TwitterApi } from "twitter-api-v2";
import { db } from "../server/db";
import { postcardDrafts } from "../shared/schema";
import { storage } from "../server/storage";

async function createRealDraft() {
    console.log("🕵️‍♀️ Fetching latest tweet from @MaxTruth_Seeker...");

    try {
        // 1. Get Credentials
        const connection = await storage.getPlatformConnection("twitter");
        if (!connection?.credentials) throw new Error("No Twitter credentials found in DB");

        const client = new TwitterApi({
            appKey: connection.credentials.apiKey,
            appSecret: connection.credentials.apiSecret,
            accessToken: connection.credentials.accessToken,
            accessSecret: connection.credentials.accessTokenSecret,
        });

        // 2. Get User ID
        const me = await client.v2.me();
        console.log(`👤 Authenticated as: @${me.data.username}`);

        // 3. Get User's Latest Tweet
        const timeline = await client.v2.userTimeline(me.data.id, { max_results: 5 });
        const latestTweet = timeline.data.data[0];

        if (!latestTweet) {
            console.error("❌ No tweets found for this user to reply to!");
            process.exit(1);
        }

        console.log(`🐦 Found latest tweet: "${latestTweet.text}" (ID: ${latestTweet.id})`);

        // 4. Manually Insert Draft (Bypassing AI location check for reliability)
        console.log("📝 Creating draft in Sniper Queue...");

        // Generate a unique draft text to avoid duplicate content errors if re-running
        const uniqueId = Math.floor(Math.random() * 1000);

        await db.insert(postcardDrafts).values({
            originalTweetId: latestTweet.id,
            originalAuthorHandle: me.data.username,
            detectedLocation: "Regen City, Testland",
            status: "pending_review",
            draftText: `Hey @${me.data.username}, testing the regenerate buttons! 🔄 [Test ID: ${uniqueId}]`,
            turaiImageUrl: "https://turai.com/mock-image/Regen%20City",
        });

        console.log("✅ Draft created! Go to http://localhost:5002/review-queue to test regeneration.");

    } catch (error) {
        console.error("❌ Error:", error);
    }

    process.exit(0);
}

createRealDraft();
