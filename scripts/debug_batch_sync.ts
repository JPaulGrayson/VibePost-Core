
import { storage } from '../server/storage';
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';

// Mock storage if we can't load the real one easily, or try to use real storage
// For this test script, we'll try to replicate the logic from routes.ts to debug the flow

async function testBatchSync() {
    console.log("🔍 Starting Batch Sync Debug Test...");

    try {
        console.log("1. Fetching published posts from DB...");
        const posts = await storage.getPostsByStatus("published");
        console.log(`   Found ${posts.length} published posts.`);

        if (posts.length === 0) {
            console.log("   ⚠️ No posts found. Is the DB connected?");
            return;
        }

        // 2. Simulate ID extraction
        console.log("2. Extracting Twitter IDs...");
        const postsToUpdate = posts.filter(p => {
            const hasData = !!p.platformData;
            const hasTwitter = hasData && (p.platformData as any).twitter;
            const hasId = hasTwitter && (p.platformData as any).twitter.tweetId;

            // Debug the first failed one
            if (!hasId && posts.indexOf(p) < 3) {
                console.log(`   [Debug] Post ${p.id} skipped. PlatformData:`, JSON.stringify(p.platformData));
            }
            return hasId;
        });

        const twitterIds = postsToUpdate.map(p => (p.platformData as any).twitter.tweetId);
        console.log(`   Found ${twitterIds.length} valid Twitter IDs to sync.`);

        if (twitterIds.length > 0) {
            console.log(`   IDs: ${twitterIds.join(", ")}`);

            // 3. Test API Call (using batch)
            console.log("3. Testing Twitter API Batch Request...");

            // Use credentials direct from ENV for this test to rule out DB cred issues
            const appKey = process.env.TWITTER_API_KEY;
            const appSecret = process.env.TWITTER_API_SECRET;
            const accessToken = process.env.TWITTER_ACCESS_TOKEN;
            const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

            if (!appKey) {
                console.warn("   ⚠️ Missing Env Vars for Twitter. Skipping API test.");
            } else {
                const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });

                console.log(`   [API] Requesting metrics for ${twitterIds.length} tweets...`);

                // Chunk into 100 just to be safe (though user has <100)
                const chunks = [];
                for (let i = 0; i < twitterIds.length; i += 100) {
                    chunks.push(twitterIds.slice(i, i + 100));
                }

                for (const chunk of chunks) {
                    const result = await client.v2.tweets(chunk, {
                        'tweet.fields': ['public_metrics', 'created_at']
                    });

                    console.log(`   [API] Response received!`);
                    if (result.errors) {
                        console.error("   [API] Errors:", JSON.stringify(result.errors, null, 2));
                    }
                    if (result.data) {
                        console.log(`   [API] Success! Received data for ${result.data.length} tweets.`);
                        console.log(`   [Sample] First tweet metrics:`, JSON.stringify(result.data[0].public_metrics));
                    } else {
                        console.warn("   [API] Warning: No data returned.");
                    }
                }
            }
        } else {
            console.warn("   ⚠️ No Twitter IDs found in published posts. Structure mismatch?");
        }

    } catch (error) {
        console.error("❌ Test Failed:", error);
    }
}

testBatchSync();
