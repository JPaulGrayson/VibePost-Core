
import "dotenv/config";
import { TwitterApi } from "twitter-api-v2";

async function realSearch() {
    try {
        console.log("Initializing Twitter Client...");
        const client = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY!,
            appSecret: process.env.TWITTER_API_SECRET!,
            accessToken: process.env.TWITTER_ACCESS_TOKEN!,
            accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
        });

        const query = "from:4lexgrayson";
        console.log(`Searching Twitter for: "${query}"`);

        const result = await client.v2.search(query, {
            "tweet.fields": ["created_at", "text", "author_id"],
            "max_results": 10
        });

        console.log("Search completed.");
        console.log(`Found ${result.meta.result_count} tweets.`);

        for (const tweet of result.data.data || []) {
            console.log("------------------------------------------------");
            console.log(`ID: ${tweet.id}`);
            console.log(`Text: ${tweet.text}`);
            console.log(`Created At: ${tweet.created_at}`);
        }

    } catch (error: any) {
        console.error("Twitter API Error:");
        if (error.code === 429) {
            console.error("RATE LIMIT EXCEEDED. Please wait before trying again.");
            console.error("Reset time (epoch):", error.rateLimit?.reset);
            const resetDate = new Date(error.rateLimit?.reset * 1000);
            console.error("Reset time (local):", resetDate.toLocaleString());
        } else {
            console.error(error);
        }
    } finally {
        process.exit(0);
    }
}

realSearch();
