import { keywordSearchEngine } from "../keyword-search";
import { generateDraft } from "./postcard_drafter";
import { storage } from "../storage";
import { replyTimingOptimizer } from "./reply_timing_optimizer";
import { dmFollowUpService } from "./dm_follow_up";
import { getKeywordsForCampaign, CampaignType } from "../campaign-config";

export class SniperManager {
    private isHunting = false;  // Tracks if a hunt is in progress
    private isStarted = false;  // Tracks if the auto-loop has been started
    private isPaused = false;   // AUTO-RESUME on startup - sniper runs automatically
    private checkIntervalMs = 3 * 60 * 1000; // 3 Minutes (increased from 5 for more aggressive hunting)
    private replyToRepliesEnabled = true;  // Enable reply-to-replies feature
    private minScoreForReplyChain = 90;    // Only fetch replies for high-quality tweets (≥90%, 97.3% publish rate)
    private dmFollowUpEnabled = true;      // Enable DM follow-ups after replies

    // Get keywords dynamically based on active campaign
    private getActiveKeywords(): string[] {
        const campaignType = ((global as any).currentSniperCampaign || 'turai') as CampaignType;
        return getKeywordsForCampaign(campaignType);
    }

    // Get active campaign type
    private getActiveCampaign(): CampaignType {
        return ((global as any).currentSniperCampaign || 'turai') as CampaignType;
    }

    private dailyLimit = 500;
    private draftsGeneratedToday = 0;
    private lastResetDate = new Date().getDate();

    async startHunting() {
        if (this.isStarted) return;
        this.isStarted = true;
        console.log("🎯 Sniper Manager Started (Hunting every 3 mins - AGGRESSIVE MODE)");
        console.log("   ⏰ Reply timing optimizer: ENABLED (2-3h delay)");
        console.log("   📬 DM follow-ups: ENABLED (2h after reply)");

        // Start supporting services
        replyTimingOptimizer.start();
        dmFollowUpService.start();

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

    // Pause/Resume controls
    pause() {
        this.isPaused = true;
        console.log("⏸️ Sniper Manager PAUSED - No new drafts will be generated");
    }

    resume() {
        this.isPaused = false;
        console.log("▶️ Sniper Manager RESUMED - Hunting enabled");
    }

    get paused(): boolean {
        return this.isPaused;
    }

    // Expose state for health checks
    get isRunning(): boolean {
        // Return true if sniper service is started and not paused (actively hunting or ready to hunt)
        return this.isStarted && !this.isPaused;
    }
    
    get isActivelyHunting(): boolean {
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
            replyChainDrafts: 0,
            errors: 0,
            lastError: "" as string | undefined
        };

        // Check if paused first
        if (this.isPaused) {
            console.log("⏸️ Sniper is PAUSED - skipping hunt cycle");
            return stats;
        }

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

            const activeKeywords = this.getActiveKeywords();
            const activeCampaign = this.getActiveCampaign();
            console.log(`   🎯 Campaign: ${activeCampaign} | Keywords: ${activeKeywords.length}`);
            
            for (const keyword of activeKeywords) {
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

                        const created = await generateDraft(postObj, result.author, activeCampaign);
                        if (created) {
                            this.draftsGeneratedToday++;
                            stats.draftsCreated++;
                        }

                        // Reply-to-Replies: Schedule delayed fetch for better quality replies
                        if (this.replyToRepliesEnabled && (result.score || 0) >= this.minScoreForReplyChain) {
                            // Schedule reply fetch for 2-3 hours later (optimal engagement window)
                            replyTimingOptimizer.scheduleReplyFetch(
                                result.id,
                                result.author,
                                result.score || 0
                            );
                        }

                        // DM Follow-up: Schedule DM after reply is published
                        if (this.dmFollowUpEnabled && created) {
                            // Extract destination from content
                            const destination = this.extractDestination(result.content);

                            // Note: We'll schedule the DM when the draft is actually published
                            // This is handled in the auto_publisher after successful publish
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

    /**
     * Extract destination from tweet content
     */
    private extractDestination(content: string): string {
        // Simple extraction - look for common patterns
        const lowerContent = content.toLowerCase();

        // Check for "to [destination]" pattern
        const toMatch = content.match(/to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (toMatch) return toMatch[1];

        // Check for "in [destination]" pattern
        const inMatch = content.match(/in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (inMatch) return inMatch[1];

        // Default to "your destination"
        return "your destination";
    }
}

export const sniperManager = new SniperManager();
