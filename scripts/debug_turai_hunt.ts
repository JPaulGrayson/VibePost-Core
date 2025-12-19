
import { sniperManager } from "../server/services/sniper_manager";
import { storage } from "../server/storage";

async function runDebugHunt() {
    console.log("🔍 STARTING DEBUG HUNT FOR TURAI...");

    // Force set campaign to Turai
    sniperManager.setCampaign('turai');

    // Run the hunt
    const result = await sniperManager.forceHunt('turai');

    console.log("--------------------------------");
    console.log("📊 HUNT RESULT:", JSON.stringify(result, null, 2));

    // Check if any drafts exist in DB now
    const drafts = await storage.getPostcardDrafts();
    const turaiDrafts = drafts.filter(d => d.campaignId === 1 || !d.campaignType || d.campaignType === 'turai');

    console.log(`\n📝 Total Drafts in DB: ${drafts.length}`);
    console.log(`✈️ Turai Drafts: ${turaiDrafts.filter(d => d.status === 'pending_review').length} pending review`);

    process.exit(0);
}

runDebugHunt().catch(console.error);
