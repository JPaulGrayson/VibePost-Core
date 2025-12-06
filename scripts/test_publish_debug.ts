
import "dotenv/config";
import { TwitterApi } from "twitter-api-v2";

async function testPublish() {
    console.log("🧪 Testing Twitter Publish Logic (Local Simulation)...");

    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        console.error("❌ Missing Twitter Credentials in .env");
        process.exit(1);
    }

    const client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken: accessToken,
        accessSecret: accessSecret,
    });

    try {
        const me = await client.v2.me();
        console.log(`✅ Authenticated as @${me.data.username}`);

        // 1. Mock a Draft with an Image
        // We'll use a public image URL that we know works
        const imageUrl = "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80";
        const text = `Test post from VibePost debugger at ${new Date().toLocaleTimeString()} 🧪`;

        console.log(`\n📸 Fetching test image...`);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`   Image size: ${buffer.length} bytes`);

        // 2. Upload Media
        console.log(`\n📤 Uploading media to Twitter...`);
        const mediaId = await client.v1.uploadMedia(buffer, { mimeType: 'image/jpeg' });
        console.log(`   Media ID: ${mediaId}`);

        // 3. Post Tweet
        console.log(`\n🐦 Posting tweet...`);
        const payload = {
            text: text,
            media: { media_ids: [mediaId] }
        };

        const result = await client.v2.tweet(payload);
        console.log(`✅ Tweet published! ID: ${result.data.id}`);
        console.log(`   URL: https://twitter.com/user/status/${result.data.id}`);

    } catch (error: any) {
        console.error("\n❌ Publish Failed!");
        console.error("Error Message:", error.message);
        if (error.data) {
            console.error("API Error Data:", JSON.stringify(error.data, null, 2));
        }
    }
}

testPublish();
