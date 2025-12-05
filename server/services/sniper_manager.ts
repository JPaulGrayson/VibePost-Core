import { keywordSearchEngine } from "../keyword-search";
import { generateDraft } from "./postcard_drafter";
import { storage } from "../storage";

export class SniperManager {
    private isRunning = false;
    private checkIntervalMs = 5 * 60 * 1000; // 5 Minutes (Safe Rate Limit for Search)

    // Default keywords to hunt for
    private keywords = [
        "planning a trip to",
        "visiting",
        "travel recommendations",
        "vacation in",
        "holiday in",
        "headed to",
        "going to",
        "Waco"
    ];

    private dailyLimit = 500; // Increased for Ranking Mode
    private draftsGeneratedToday = 0; // Reset for testing
    private lastResetDate = new Date().getDate();

    async startHunting() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("🎯 Sniper Manager Started (Hunting every 5 mins)");

        // Initial Run
        await this.hunt();

        // Loop
        setInterval(() => this.hunt(), this.checkIntervalMs);
    }

    async forceHunt() {
        if (this.isRunning) {
            console.log("⚠️ Sniper is already hunting. Skipping manual trigger.");
            return { draftsGenerated: 0, message: "Sniper is already running" };
        }
        console.log("🎯 Manual Sniper Hunt Triggered");
        await this.hunt();
        return { draftsGenerated: this.draftsGeneratedToday };
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
        if (this.isRunning) return;
        this.isRunning = true;

        console.log("🦅 Sniper Hunting Cycle Started...");

        try {
            // 0. Run Janitor
            try {
                await storage.cleanupOldDrafts();
            } catch (e) {
                console.error("Janitor failed:", e);
            }

            if (!this.checkDailyLimit()) {
                this.isRunning = false;
                return;
            }

            for (const keyword of this.keywords) {
                try {
                    // Search for keyword
                    // Limit to 100 results (Max per request for efficiency)
                    const results = await keywordSearchEngine.searchTwitter(keyword, 100);

                    if (results.length === 0) continue;

                    console.log(`   Found ${results.length} tweets for "${keyword}"`);

                    for (const result of results) {
                        // Check if processed
                        const existing = await storage.getDraftByOriginalTweetId(result.id);
                        if (existing) continue;

                        console.log(`   ✨ Generating draft for @${result.author}: "${result.content.substring(0, 30)}..."`);

                        // Adapt result to tweet format expected by generateDraft
                        const tweetObj = {
                            id: result.id,
                            text: result.content,
                            author_id: "unknown"
                        };

                        await generateDraft(tweetObj, result.author);
                        this.draftsGeneratedToday++;

                        if (!this.checkDailyLimit()) break;
                    }
                } catch (error) {
                    console.error(`❌ Error hunting for "${keyword}":`, error);
                }

                // Wait 5 seconds between keywords to be nice to the API
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (error) {
            console.error("Sniper hunt failed:", error);
        } finally {
            this.isRunning = false;
            console.log("🦅 Sniper Hunting Cycle Complete.");
        }
    }
}

export const sniperManager = new SniperManager();
