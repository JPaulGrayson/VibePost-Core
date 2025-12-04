import "dotenv/config";
import { TwitterApi } from "twitter-api-v2";

async function testSearch() {
    console.log("🔑 Testing Twitter Search with credentials...");

    const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
    });

    try {
        const user = await client.v2.me();
        console.log(`✅ Authenticated as @${user.data.username}`);

        console.log("🔍 Attempting v2 search for 'travel'...");
        const result = await client.v2.search("travel", { max_results: 10 });

        console.log("✅ Search successful!");
        console.log(`Found ${result.data.meta.result_count} tweets.`);
        if (result.data.data.length > 0) {
            console.log("Sample tweet:", result.data.data[0].text);
        }

    } catch (error: any) {
        console.error("❌ Search Failed!");
        console.error("Error Message:", error.message);
        console.error("Full Error Object:", JSON.stringify(error, null, 2));

        if (error.data) {
            console.error("API Error Data:", JSON.stringify(error.data, null, 2));
        }
    }
}

testSearch();
