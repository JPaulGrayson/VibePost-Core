import { keywordSearchEngine } from "../keyword-search";
import { generateDraft } from "./postcard_drafter";
import { storage } from "../storage";
import {
    CampaignType,
    CAMPAIGN_CONFIGS,
    hasPositiveIntent,
    calculateCampaignScore
} from "../campaign-config";

export class SniperManager {
    private isRunning = false;
    private checkIntervalMs = 5 * 60 * 1000; // 5 Minutes (Safe Rate Limit for Search)
    private currentCampaign: CampaignType = 'turai'; // Default to Turai

    private dailyLimit = 500; // Increased for Ranking Mode
    private draftsGeneratedToday = 0; // Reset for testing
    private lastResetDate = new Date().getDate();

    // Get keywords based on current campaign
    private get keywords(): string[] {
        return CAMPAIGN_CONFIGS[this.currentCampaign].keywords;
    }

    async startHunting() {
        if (this.isRunning) return;
        console.log("🎯 Sniper Manager Started (Auto-Pilot Active)");

        // Initial hunt after 10 seconds (give server time to breathe)
        setTimeout(() => this.hunt(), 10000);

        // Start the continuous loop
        setInterval(() => this.hunt(), this.checkIntervalMs);
    }

    // Set the active campaign type
    setCampaign(type: CampaignType) {
        this.currentCampaign = type;
        console.log(`🎯 Campaign switched to: ${CAMPAIGN_CONFIGS[type].emoji} ${CAMPAIGN_CONFIGS[type].name}`);
    }

    getCampaign(): CampaignType {
        return this.currentCampaign;
    }

    getCampaignConfig() {
        return CAMPAIGN_CONFIGS[this.currentCampaign];
    }

    async forceHunt(campaignType?: CampaignType) {
        if (this.isRunning) {
            console.log("⚠️ Sniper is already hunting. Skipping manual trigger.");
            return { draftsGenerated: 0, message: "Sniper is already running" };
        }

        // Optionally switch campaign for this hunt
        if (campaignType) {
            this.setCampaign(campaignType);
        }

        console.log(`🎯 Manual Sniper Hunt Triggered for ${CAMPAIGN_CONFIGS[this.currentCampaign].name}`);
        const stats = await this.hunt();
        return {
            draftsGenerated: this.draftsGeneratedToday,
            campaign: this.currentCampaign,
            stats
        };
    }

    private checkDailyLimit(): boolean {
        const today = new Date().getDate();
        if (today !== this.lastResetDate) {
            this.draftsGeneratedToday = 0;
            this.lastResetDate = today;
        }

        if (this.draftsGeneratedToday >= this.dailyLimit) {
            console.log(`🛑 Daily limit reached (${this.dailyLimit}). Pausing hunt until tomorrow.`);
            return false;
        }
        return true;
    }

    private async hunt() {
        const stats = {
            keywordsSearched: 0,
            tweetsFound: 0,
            draftsCreated: 0,
            duplicatesSkipped: 0,
            intentFiltered: 0,
            errors: 0,
            lastError: "" as string | undefined,
            campaign: this.currentCampaign
        };

        if (this.isRunning) return stats;
        this.isRunning = true;

        const config = CAMPAIGN_CONFIGS[this.currentCampaign];
        console.log(`🦅 Sniper Hunting Cycle Started for ${config.emoji} ${config.name}...`);

        try {
            // 0. Run Janitor
            try {
                await storage.cleanupOldDrafts();
            } catch (e) {
                console.error("Janitor failed:", e);
            }

            if (!this.checkDailyLimit()) {
                this.isRunning = false;
                return stats;
            }

            for (const keyword of this.keywords) {
                stats.keywordsSearched++;
                try {
                    // Search for keyword on Twitter ONLY
                    const results = await keywordSearchEngine.searchAllPlatforms(keyword, ['twitter']);
                    stats.tweetsFound += results.length;

                    if (results.length === 0) continue;

                    console.log(`   Found ${results.length} posts for "${keyword}"`);

                    for (const result of results) {
                        // Check campaign-specific intent
                        if (!hasPositiveIntent(result.content, this.currentCampaign)) {
                            console.log(`   ❌ No ${config.name} intent detected. Skipping.`);
                            stats.intentFiltered++;
                            continue;
                        }

                        // Check if processed
                        const existing = await storage.getDraftByOriginalTweetId(result.id);
                        if (existing) {
                            stats.duplicatesSkipped++;
                            continue;
                        }

                        console.log(`   ✨ Generating ${config.emoji} draft for @${result.author}: "${result.content.substring(0, 40)}..."`);

                        // Adapt result to generic format expected by generateDraft
                        const postObj = {
                            id: result.id,
                            text: result.content,
                            author_id: "unknown"
                        };

                        // Pass campaign type to draft generator
                        const created = await generateDraft(postObj, result.author, this.currentCampaign);
                        if (created) {
                            this.draftsGeneratedToday++;
                            stats.draftsCreated++;
                        }

                        if (!this.checkDailyLimit()) break;
                    }
                } catch (error) {
                    console.error(`❌ Error hunting for "${keyword}":`, error);
                    stats.errors++;
                    stats.lastError = error instanceof Error ? error.message : String(error);
                }

                // Wait 5 seconds between keywords to be nice to the API
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (error) {
            console.error("Sniper hunt failed:", error);
            stats.errors++;
            stats.lastError = error instanceof Error ? error.message : String(error);
        } finally {
            this.isRunning = false;
            console.log(`🦅 ${config.name} Hunting Cycle Complete.`, stats);
        }

        return stats;
    }
}

export const sniperManager = new SniperManager();
