
import "dotenv/config";
import { storage } from "../server/storage";

async function seedCredentials() {
    console.log("🌱 Seeding Twitter Credentials to Database...");

    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        console.error("❌ Error: One or more Twitter API keys are missing from environment variables.");
        console.error("   Please check your .env file or Replit Secrets.");
        console.error("   Required: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET");
        process.exit(1);
    }

    console.log("✅ Found credentials in environment variables.");

    try {
        const result = await storage.updatePlatformConnection("twitter", {
            isConnected: true,
            credentials: {
                apiKey,
                apiSecret,
                accessToken,
                accessTokenSecret: accessSecret
            }
        });

        console.log("✅ Successfully saved credentials to database!");
        console.log("   Platform: Twitter");
        console.log("   ID:", result?.id);
        console.log("   Connected:", result?.isConnected);

    } catch (error) {
        console.error("❌ Failed to save credentials:", error);
        process.exit(1);
    }
}

seedCredentials();
