import "dotenv/config";
import { keywordSearchEngine } from "../keyword-search";
import { generateDraft } from "../services/postcard_drafter";
import { storage } from "../storage";

async function runSniper() {
    console.log("🎯 Starting Manual Sniper Run...");

    const keywords = ["planning a trip to Japan", "visiting Paris", "travel recommendations Italy", "headed to NYC", "going to New York"];
    console.log(`Searching for keywords: ${keywords.join(", ")}`);

    for (const keyword of keywords) {
        try {
            console.log(`\n🔍 Searching for: "${keyword}"`);
            const results = await keywordSearchEngine.searchTwitter(keyword, 10); // Limit to 10 per keyword (API min)

            console.log(`   Found ${results.length} tweets.`);

            for (const result of results) {
                // Check if processed
                const existing = await storage.getDraftByOriginalTweetId(result.id);
                if (existing) {
                    console.log(`   ⏭️  Skipping processed tweet ${result.id}`);
                    continue;
                }

                console.log(`   ✨ Generating draft for @${result.author}: "${result.content.substring(0, 50)}..."`);

                // Adapt result to tweet format expected by generateDraft
                const tweetObj = {
                    id: result.id,
                    text: result.content,
                    author_id: "unknown" // We don't have this from search result easily, but drafter might not need it strictly
                };

                await generateDraft(tweetObj, result.author);
            }

        } catch (error) {
            console.error(`❌ Error searching for "${keyword}":`, error);
        }
    }

    console.log("\n✅ Sniper Run Complete!");
    process.exit(0);
}

runSniper();
