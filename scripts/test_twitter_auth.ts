import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";

dotenv.config();

async function testTwitter() {
    console.log("Testing Twitter Credentials...");
    console.log("API Key:", process.env.TWITTER_API_KEY?.substring(0, 5) + "...");
    console.log("Access Token:", process.env.TWITTER_ACCESS_TOKEN?.substring(0, 15) + "...");

    const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
    });

    try {
        const me = await client.v2.me();
        console.log("✅ Authentication Successful!");
        console.log("User:", me.data.username);

        console.log("Attempting to post a test tweet...");
        const tweet = await client.v2.tweet(`Test tweet from VibePost dev environment ${new Date().toISOString()}`);
        console.log("✅ Write Permission Verified! Tweet ID:", tweet.data.id);

        // Optional: Delete it immediately
        console.log("Deleting test tweet...");
        await client.v2.deleteTweet(tweet.data.id);
        console.log("✅ Test tweet deleted.");

    } catch (error: any) {
        console.error("❌ Operation Failed:");
        if (error.data) {
            console.error(JSON.stringify(error.data, null, 2));
        } else {
            console.error(error);
        }
    }
}

testTwitter();
