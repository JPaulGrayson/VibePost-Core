
import "dotenv/config";
import { TwitterApi } from "twitter-api-v2";

async function checkUserTweets() {
    const appKey = process.env.TWITTER_API_KEY!;
    const appSecret = process.env.TWITTER_API_SECRET!;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN!;
    const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET!;

    const client = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
    });

    try {
        const user = await client.v2.userByUsername("4lexgrayson");
        console.log("User found:", user.data);

        const tweets = await client.v2.userTimeline(user.data.id, {
            max_results: 5,
            "tweet.fields": ["created_at", "text"]
        });

        console.log("Recent tweets:");
        for (const tweet of tweets.data.data) {
            console.log(`- [${tweet.created_at}] ${tweet.text}`);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

checkUserTweets();
