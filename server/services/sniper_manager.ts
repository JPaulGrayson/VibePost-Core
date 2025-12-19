import { keywordSearchEngine } from "../keyword-search";
import { generateDraft } from "./postcard_drafter";
import { storage } from "../storage";

export class SniperManager {
    private isHunting = false;  // Tracks if a hunt is in progress
    private isStarted = false;  // Tracks if the auto-loop has been started
    private checkIntervalMs = 5 * 60 * 1000; // 5 Minutes

    // Travel-focused keywords - kept simple for broad matching
    private keywords = [
        // High-intent travel phrases (catch ANY destination)
        "planning a trip to",
        "traveling to",
        "flying to",
        "driving to",
        "road trip to",
        "visiting",
        "headed to",
        "going to",
        "vacation in",
        "holiday in",

        // Questions & recommendations (high engagement)
        "travel recommendations",
        "where should I stay",
        "any tips for",
        "first time visiting",
        "itinerary help",
        "food recommendations",
        "restaurant suggestions",
        "things to do in",
        "what to see in",
        "places to visit",

        // US Destinations (balanced representation)
        "New York",
        "Las Vegas",
        "Miami",
        "Los Angeles",
        "Chicago",
        "Hawaii",
        "San Francisco",
        "Orlando",
        "Nashville",
        "Austin",

        // International Destinations
        "Paris",
        "London",
        "Tokyo",
        "Rome",
        "Barcelona",
        "Bali",
        "Thailand",
    ];

    private dailyLimit = 500;
    private draftsGeneratedToday = 0;
    private lastResetDate = new Date().getDate();

    async startHunting() {
        if (this.isStarted) return;
        this.isStarted = true;
        console.log("🎯 Sniper Manager Started (Hunting every 5 mins)");

        // Initial Run after 10 seconds (give server time to breathe)
        setTimeout(() => this.hunt(), 10000);

        // Loop
        setInterval(() => this.hunt(), this.checkIntervalMs);
    }

    async forceHunt() {
        if (this.isHunting) {
            console.log("⚠️ Sniper is already hunting. Skipping manual trigger.");
            return { draftsGenerated: 0, message: "Sniper is already running" };
        }
        console.log("🎯 Manual Sniper Hunt Triggered");
        const stats = await this.hunt();
        return {
            draftsGenerated: this.draftsGeneratedToday,
            stats
        };
    }

    // Expose state for health checks
    get isRunning(): boolean {
        return this.isHunting;
    }

    get todaysDrafts(): number {
        return this.draftsGeneratedToday;
    }

    get dailyDraftLimit(): number {
        return this.dailyLimit;
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
            errors: 0,
            lastError: "" as string | undefined
        };

        if (this.isHunting) {
            console.log("⚠️ Hunt already in progress, skipping...");
            return stats;
        }
        this.isHunting = true;

        console.log("🦅 Sniper Hunting Cycle Started...");

        try {
            // 0. Run Janitor
            try {
                await storage.cleanupOldDrafts();
            } catch (e) {
                console.error("Janitor failed:", e);
            }

            if (!this.checkDailyLimit()) {
                this.isHunting = false;
                return stats;
            }

            for (const keyword of this.keywords) {
                stats.keywordsSearched++;
                try {
                    // Search for keyword on Twitter
                    const results = await keywordSearchEngine.searchAllPlatforms(keyword, ['twitter']);
                    stats.tweetsFound += results.length;

                    if (results.length === 0) continue;

                    console.log(`   Found ${results.length} posts for "${keyword}"`);

                    for (const result of results) {
                        // Check if processed
                        const existing = await storage.getDraftByOriginalTweetId(result.id);
                        if (existing) {
                            stats.duplicatesSkipped++;
                            continue;
                        }

                        console.log(`   ✨ Generating draft for @${result.author}: "${result.content.substring(0, 40)}..."`);

                        // Adapt result to generic format expected by generateDraft
                        const postObj = {
                            id: result.id,
                            text: result.content,
                            author_id: "unknown"
                        };

                        const created = await generateDraft(postObj, result.author);
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

                // Wait 3 seconds between keywords
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (error) {
            console.error("Sniper hunt failed:", error);
            stats.errors++;
            stats.lastError = error instanceof Error ? error.message : String(error);
        } finally {
            this.isHunting = false;
            console.log("🦅 Sniper Hunting Cycle Complete.", stats);
        }

        return stats;
    }
}

export const sniperManager = new SniperManager();
