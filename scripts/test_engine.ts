
import "dotenv/config";
import { keywordSearchEngine } from "../server/keyword-search";

async function testKeywordSearch() {
    console.log("🧪 Testing KeywordSearchEngine...");

    try {
        // Test 1: Search Twitter
        console.log("\n1️⃣  Testing searchTwitter('travel')...");
        const twitterResults = await keywordSearchEngine.searchTwitter("travel", 5);
        console.log(`✅ Twitter Search returned ${twitterResults.length} results.`);
        if (twitterResults.length > 0) {
            console.log(`   Sample: [${twitterResults[0].platform}] @${twitterResults[0].author}: ${twitterResults[0].content.substring(0, 50)}...`);
        }

        // Test 2: Search All Platforms
        console.log("\n2️⃣  Testing searchAllPlatforms('travel')...");
        const allResults = await keywordSearchEngine.searchAllPlatforms("travel", ['twitter', 'reddit']);
        console.log(`✅ All Platforms Search returned ${allResults.length} results.`);

        const twitterCount = allResults.filter(r => r.platform === 'twitter').length;
        const redditCount = allResults.filter(r => r.platform === 'reddit').length;
        console.log(`   Twitter: ${twitterCount}, Reddit: ${redditCount}`);

    } catch (error) {
        console.error("\n❌ KeywordSearchEngine Test Failed:", error);
    }
}

testKeywordSearch();
