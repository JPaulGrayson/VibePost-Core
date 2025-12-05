
import "dotenv/config";
import { TwitterApi } from "twitter-api-v2";

async function testTwitter() {
    console.log("🧪 Testing Twitter API Connection...");

    const appKey = process.env.TWITTER_API_KEY;
    const appSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

    console.log("Environment Variables Check:");
    console.log("TWITTER_API_KEY:", appKey ? "Set" : "Missing");
    console.log("TWITTER_API_SECRET:", appSecret ? "Set" : "Missing");
    console.log("TWITTER_ACCESS_TOKEN:", accessToken ? "Set" : "Missing");
    console.log("TWITTER_ACCESS_TOKEN_SECRET:", accessSecret ? "Set" : "Missing");

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
        console.error("❌ Missing one or more Twitter API keys in environment variables.");
        return;
    }

    const client = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
    });

    try {
        // 1. Test Auth
        console.log("\n1️⃣  Testing Authentication (v2.me)...");
        const me = await client.v2.me();
        console.log(`✅ Authenticated as: @${me.data.username} (ID: ${me.data.id})`);

        // 2. Test Search
        console.log("\n2️⃣  Testing Search (v2.search)...");
        const query = "travel -is:retweet lang:en";
        console.log(`   Query: "${query}"`);

        const search = await client.v2.search(query, {
            max_results: 10,
            "tweet.fields": ["created_at", "public_metrics", "author_id"]
        });

        console.log(`✅ Search successful! Found ${search.meta.result_count} tweets.`);

        if (search.data.data.length > 0) {
            const firstTweet = search.data.data[0];
            console.log(`   Sample tweet (ID: ${firstTweet.id}):`);
            console.log(`   "${firstTweet.text.substring(0, 100)}..."`);
        } else {
            console.warn("⚠️ Search returned 0 results. This is unexpected for a generic query.");
        }

    } catch (error: any) {
        console.error("\n❌ API Test Failed!");

        if (error.data) {
            console.error("API Error Data:", JSON.stringify(error.data, null, 2));
        } else {
            console.error("Error Details:", error);
        }

        if (error.code === 403) {
            console.error("\n👉 403 Forbidden: This usually means your App permissions are wrong in the Dev Portal.");
            console.error("   Check: Is 'Read and Write' enabled? Is it a 'Web App'?");
            console.error("   Also: Basic/Free tier does NOT support v2 search endpoint. You need Basic ($100/mo) or Pro.");
        } else if (error.code === 429) {
            console.error("\n👉 429 Too Many Requests: You are rate limited.");
        }
    }
}

testTwitter();
