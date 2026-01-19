import { keywordSearchEngine } from "../keyword-search";
import { generateDraft, generateArenaRefereeDraft, generateCodeFlowchartDraft } from "./postcard_drafter";
import { storage } from "../storage";
import { replyTimingOptimizer } from "./reply_timing_optimizer";
import { dmFollowUpService } from "./dm_follow_up";
import { getActiveCampaign } from "../campaign-state";
import { CAMPAIGN_CONFIGS, LOGICART_STRATEGIES, getActiveLogicArtStrategy, setActiveLogicArtStrategy, LogicArtStrategy } from "../campaign-config";

export class SniperManager {
    private isHunting = false;  // Tracks if a hunt is in progress
    private isStarted = false;  // Tracks if the auto-loop has been started
    private huntAllMode = false; // Fast mode for Hunt All (fewer keywords per strategy)
    
    // Independent pause controls per campaign - both PAUSED by default
    private campaignPauseState: Record<string, boolean> = {
        turai: true,      // Turai Travel - PAUSED
        logicart: true    // LogicArt Vibe Coding - PAUSED
    };
    
    private checkIntervalMs = 3 * 60 * 1000; // 3 Minutes (increased from 5 for more aggressive hunting)
    private replyToRepliesEnabled = true;  // Enable reply-to-replies feature
    private minScoreForReplyChain = 95;    // Only fetch replies for highest-quality tweets (≥95%)
    private dmFollowUpEnabled = true;      // Enable DM follow-ups after replies

    // Keywords loaded dynamically from active campaign/strategy config
    private getKeywords(): string[] {
        const campaign = getActiveCampaign();
        
        let allKeywords: string[];
        
        if (campaign === 'logicart') {
            // For LogicArt: use the active strategy's keywords
            const activeStrategy = getActiveLogicArtStrategy();
            const strategyConfig = LOGICART_STRATEGIES[activeStrategy];
            allKeywords = strategyConfig.keywords;
            console.log(`   🎯 Using ${strategyConfig.name} strategy keywords (${allKeywords.length} total)`);
        } else {
            // For other campaigns: use the main campaign keywords
            const config = CAMPAIGN_CONFIGS[campaign];
            allKeywords = config.keywords;
        }
        
        // In Hunt All mode, use only 3 keywords per strategy (faster)
        // In single hunt mode, use 10 keywords for better coverage
        const keywordLimit = this.huntAllMode ? 3 : 10;
        return allKeywords.slice(0, keywordLimit);
    }

    private dailyLimit = 500;
    private draftsGeneratedToday = 0;
    private lastResetDate = new Date().getDate();

    async startHunting() {
        if (this.isStarted) return;
        this.isStarted = true;
        console.log("🎯 Sniper Manager Started (Manual Hunt Mode - Auto-hunting DISABLED)");
        console.log("   ⏰ Reply timing optimizer: ENABLED (2-3h delay)");
        console.log("   📬 DM follow-ups: ENABLED (2h after reply)");
        console.log("   🛑 Auto-hunt: DISABLED - Use Manual Hunt button for testing");

        // Start supporting services
        replyTimingOptimizer.start();
        dmFollowUpService.start();

        // AUTO-HUNTING DISABLED FOR TESTING
        // Uncomment below to re-enable automatic hunting:
        // setTimeout(() => {
        //     if (!this.paused) this.hunt();
        // }, 10000);
        // setInterval(() => {
        //     if (!this.paused) this.hunt();
        // }, this.checkIntervalMs);
    }

    // Pause/Resume controls - per campaign
    pause(campaign?: string) {
        if (campaign && this.campaignPauseState.hasOwnProperty(campaign)) {
            this.campaignPauseState[campaign] = true;
            console.log(`⏸️  ${campaign} campaign PAUSED`);
        } else {
            // Pause all
            Object.keys(this.campaignPauseState).forEach(c => this.campaignPauseState[c] = true);
            console.log("⏸️  All campaigns PAUSED");
        }
    }

    resume(campaign?: string) {
        if (campaign && this.campaignPauseState.hasOwnProperty(campaign)) {
            this.campaignPauseState[campaign] = false;
            console.log(`▶️  ${campaign} campaign RESUMED`);
        } else {
            // Resume all
            Object.keys(this.campaignPauseState).forEach(c => this.campaignPauseState[c] = false);
            console.log("▶️  All campaigns RESUMED");
        }
    }

    get paused(): boolean {
        // Returns true if ALL campaigns are paused
        return Object.values(this.campaignPauseState).every(p => p === true);
    }

    isCampaignPaused(campaign: string): boolean {
        return this.campaignPauseState[campaign] ?? true;
    }

    getCampaignPauseStates(): Record<string, boolean> {
        return { ...this.campaignPauseState };
    }

    async forceHunt(bypassPause: boolean = true, forceReset: boolean = false) {
        if (forceReset) {
            console.log("🔄 Force reset: clearing isHunting flag");
            this.isHunting = false;
        }
        if (this.isHunting) {
            console.log("⚠️ Sniper is already hunting. Skipping manual trigger.");
            return { draftsGenerated: 0, message: "Sniper is already running" };
        }
        console.log("🎯 Manual Sniper Hunt Triggered (bypass pause: " + bypassPause + ")");
        const stats = await this.hunt(bypassPause);
        return {
            draftsGenerated: this.draftsGeneratedToday,
            stats
        };
    }

    // Hunt ALL LogicArt strategies in sequence (fast mode - 2 keywords each)
    async huntAllStrategies(forceReset: boolean = false) {
        if (forceReset) {
            console.log("🔄 Force reset: clearing isHunting flag");
            this.isHunting = false;
        }
        if (this.isHunting) {
            console.log("⚠️ Sniper is already hunting. Skipping hunt all.");
            return { draftsGenerated: 0, message: "Sniper is already running", strategiesHunted: [] };
        }

        const originalStrategy = getActiveLogicArtStrategy();
        const allStrategies = Object.keys(LOGICART_STRATEGIES) as LogicArtStrategy[];
        const strategiesHunted: string[] = [];
        let totalDrafts = 0;

        console.log("🎯 HUNT ALL STRATEGIES (FAST MODE) - 2 keywords per strategy...");

        // Enable fast mode for Hunt All
        this.huntAllMode = true;

        for (const strategy of allStrategies) {
            // Switch to this strategy
            setActiveLogicArtStrategy(strategy);
            const strategyConfig = LOGICART_STRATEGIES[strategy];
            console.log(`\n🔄 Hunting with: ${strategyConfig.emoji} ${strategyConfig.name}`);
            
            try {
                const stats = await this.hunt(true); // bypass pause
                totalDrafts += stats.draftsCreated;
                strategiesHunted.push(`${strategyConfig.emoji} ${strategyConfig.name}: ${stats.draftsCreated} drafts`);
                
                // Brief pause between strategies
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error hunting ${strategy}:`, error);
                strategiesHunted.push(`${strategyConfig.emoji} ${strategyConfig.name}: ERROR`);
            }
        }

        // Disable fast mode
        this.huntAllMode = false;
        
        // Restore original strategy
        setActiveLogicArtStrategy(originalStrategy);
        console.log(`\n✅ HUNT ALL COMPLETE - ${totalDrafts} total drafts across ${allStrategies.length} strategies`);
        console.log(`🔄 Restored active strategy to: ${LOGICART_STRATEGIES[originalStrategy].name}`);

        return {
            draftsGenerated: totalDrafts,
            message: `Hunted all ${allStrategies.length} strategies`,
            strategiesHunted
        };
    }

    // Reset the isHunting flag if stuck
    resetHuntingFlag() {
        console.log("🔄 Resetting isHunting flag (was: " + this.isHunting + ")");
        this.isHunting = false;
    }

    // Expose state for health checks
    get isRunning(): boolean {
        return this.isHunting;
    }
    
    // Check if the sniper service is ready (started and available for manual hunts)
    get isReady(): boolean {
        return this.isStarted;
    }
    
    // Get detailed status for UI display
    get status(): { state: 'stopped' | 'idle' | 'hunting'; message: string } {
        if (!this.isStarted) {
            return { state: 'stopped', message: 'Not initialized' };
        }
        if (this.isHunting) {
            return { state: 'hunting', message: 'Hunt in progress' };
        }
        return { state: 'idle', message: 'Ready (Manual Mode)' };
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

    private async hunt(bypassPause: boolean = false) {
        const stats = {
            keywordsSearched: 0,
            tweetsFound: 0,
            draftsCreated: 0,
            duplicatesSkipped: 0,
            replyChainDrafts: 0,
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

            const currentCampaign = getActiveCampaign();
            
            // Check if this specific campaign is paused (skip check for manual hunts)
            if (!bypassPause && this.isCampaignPaused(currentCampaign)) {
                console.log(`⏸️  ${currentCampaign} campaign is PAUSED, skipping hunt...`);
                this.isHunting = false;
                return stats;
            }
            
            const keywords = this.getKeywords();
            console.log(`   🎯 Hunting for ${currentCampaign} campaign (${keywords.length} keywords)`);

            for (const keyword of keywords) {
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
                            console.log(`   ⏭️ Duplicate skipped: ${result.id}`);
                            continue;
                        }

                        console.log(`   ✨ Generating draft for @${result.author}: "${result.content.substring(0, 60)}..."`);

                        // Adapt result to generic format expected by generateDraft
                        const postObj = {
                            id: result.id,
                            text: result.content,
                            author_id: "unknown"
                        };

                        // Check if we're using a special Quote Tweet strategy
                        const activeStrategy = currentCampaign === 'logicart' ? getActiveLogicArtStrategy() : null;
                        let created = false;
                        
                        if (activeStrategy === 'arena_referee') {
                            // Use Arena Referee special handler (runs through AI Council)
                            created = await generateArenaRefereeDraft(postObj, result.author);
                        } else if (activeStrategy === 'code_flowchart') {
                            // Use Code Flowchart handler (generates flowchart image)
                            created = await generateCodeFlowchartDraft(postObj, result.author);
                        } else {
                            // Standard reply draft generation
                            created = await generateDraft(postObj, result.author, currentCampaign);
                        }
                        
                        if (created) {
                            this.draftsGeneratedToday++;
                            stats.draftsCreated++;
                            console.log(`   ✅ Draft created for @${result.author}`);
                        } else {
                            console.log(`   ❌ Draft NOT created for @${result.author} (filtered by intent/spam check)`);
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
