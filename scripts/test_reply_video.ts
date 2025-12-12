/**
 * Test script to preview the new video reply format
 * Run: npx tsx scripts/test_reply_video.ts
 */

import { generateReplyVideo } from "../server/services/reply_video_generator";

async function testReplyVideo() {
    console.log("🧪 Testing Reply Video Generator\n");

    // Sample tweet simulating a real travel inquiry
    const testTweet = "Planning a trip to Barcelona next month! Looking for good beaches, amazing tapas spots, and fun nightlife recommendations. Can't wait! 🇪🇸";
    const location = "Barcelona, Spain";

    console.log("📝 Sample Tweet:");
    console.log(`"${testTweet}"\n`);
    console.log(`📍 Location: ${location}\n`);

    console.log("⏳ Generating video (this may take 30-60 seconds)...\n");

    const result = await generateReplyVideo(testTweet, location);

    if (result.success) {
        console.log("\n✅ Video generated successfully!");
        console.log(`📹 Video path: ${result.videoPath}`);
        console.log("\n🎯 Detected Interests:");
        result.interests.forEach((interest, idx) => {
            console.log(`   ${idx + 1}. ${interest.emoji} ${interest.theme}`);
            console.log(`      Keywords: ${interest.keywords}`);
        });
        console.log("\n💡 Open the video file to preview the teaser format!");
    } else {
        console.log("\n❌ Video generation failed:");
        console.log(result.error);
    }
}

testReplyVideo().catch(console.error);
