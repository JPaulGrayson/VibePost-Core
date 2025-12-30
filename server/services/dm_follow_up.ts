/**
 * DM Follow-up Service
 * Automatically sends follow-up DMs after public replies
 * 
 * Strategy:
 * 1. After publishing a reply, schedule a follow-up DM
 * 2. Wait 2 hours (gives them time to see the reply)
 * 3. Send personalized DM pointing to the reply
 * 4. Track responses and conversions
 */

import { TwitterApi } from 'twitter-api-v2';
import { storage } from '../storage';

interface ScheduledDM {
    tweetId: string;
    recipientUsername: string;
    recipientId: string;
    replyTweetId: string;
    destination: string;
    scheduledFor: Date;
    sent: boolean;
    response?: boolean;
}

export class DMFollowUpService {
    private client: TwitterApi;
    private pendingDMs: Map<string, ScheduledDM> = new Map();
    private isRunning = false;
    private checkIntervalMs = 10 * 60 * 1000; // Check every 10 minutes
    private delayHours = 2; // Wait 2 hours after reply

    constructor() {
        this.client = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY!,
            appSecret: process.env.TWITTER_API_SECRET!,
            accessToken: process.env.TWITTER_ACCESS_TOKEN!,
            accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
        });
    }

    /**
     * Schedule a follow-up DM after publishing a reply
     */
    scheduleFollowUp(
        originalTweetId: string,
        recipientUsername: string,
        recipientId: string,
        replyTweetId: string,
        destination: string
    ) {
        const now = new Date();
        const scheduledFor = new Date(now.getTime() + this.delayHours * 60 * 60 * 1000);

        const dm: ScheduledDM = {
            tweetId: originalTweetId,
            recipientUsername,
            recipientId,
            replyTweetId,
            destination,
            scheduledFor,
            sent: false,
        };

        this.pendingDMs.set(originalTweetId, dm);

        console.log(`   📬 Scheduled DM follow-up for @${recipientUsername} at ${scheduledFor.toLocaleTimeString()}`);
    }

    /**
     * Start the DM follow-up service
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('📬 DM Follow-up Service started');
        console.log(`   Checking every ${this.checkIntervalMs / 60000} minutes`);
        console.log(`   Delay: ${this.delayHours} hours after reply`);

        // Check immediately
        this.processPendingDMs();

        // Then check periodically
        setInterval(() => this.processPendingDMs(), this.checkIntervalMs);
    }

    /**
     * Process DMs that are ready to send
     */
    private async processPendingDMs() {
        const now = new Date();
        const ready: ScheduledDM[] = [];

        // Find DMs ready to send
        for (const [tweetId, dm] of this.pendingDMs.entries()) {
            if (!dm.sent && dm.scheduledFor <= now) {
                ready.push(dm);
            }
        }

        if (ready.length === 0) {
            const pending = Array.from(this.pendingDMs.values()).filter(dm => !dm.sent).length;
            if (pending > 0) {
                console.log(`📬 No DMs ready to send (${pending} pending)`);
            }
            return;
        }

        console.log(`📬 Sending ${ready.length} follow-up DMs...`);

        for (const dm of ready) {
            try {
                await this.sendFollowUpDM(dm);
                dm.sent = true;

                // Clean up after 24 hours
                setTimeout(() => {
                    this.pendingDMs.delete(dm.tweetId);
                }, 24 * 60 * 60 * 1000);
            } catch (error) {
                console.error(`   ❌ Failed to send DM to @${dm.recipientUsername}:`, error);
            }
        }
    }

    /**
     * Send a follow-up DM
     */
    private async sendFollowUpDM(dm: ScheduledDM) {
        console.log(`   📨 Sending DM to @${dm.recipientUsername}...`);

        const message = this.generateDMMessage(dm);

        try {
            // Send DM using Twitter API v2
            await this.client.v2.sendDmToParticipant(dm.recipientId, {
                text: message,
            });

            console.log(`   ✅ DM sent to @${dm.recipientUsername}`);
        } catch (error: any) {
            // Handle common errors
            if (error.code === 349) {
                console.log(`   ⚠️ @${dm.recipientUsername} doesn't accept DMs`);
            } else if (error.code === 150) {
                console.log(`   ⚠️ Can't send DM to @${dm.recipientUsername} (blocked or doesn't follow)`);
            } else {
                throw error;
            }
        }
    }

    /**
     * Generate personalized DM message
     */
    private generateDMMessage(dm: ScheduledDM): string {
        const templates = [
            `Hi @${dm.recipientUsername}! 👋

I replied to your ${dm.destination} question with a personalized tour. Check it out and let me know if you'd like any adjustments! 🌍

https://twitter.com/i/web/status/${dm.replyTweetId}`,

            `Hey @${dm.recipientUsername}! 

Just wanted to make sure you saw my reply about ${dm.destination}. I created a custom tour that might be helpful for your trip! ✈️

https://twitter.com/i/web/status/${dm.replyTweetId}`,

            `Hi there! 👋

I saw your ${dm.destination} question and created a personalized tour for you. Take a look and feel free to ask if you need any changes! 🗺️

https://twitter.com/i/web/status/${dm.replyTweetId}`,
        ];

        // Rotate through templates
        const index = Math.floor(Math.random() * templates.length);
        return templates[index];
    }

    /**
     * Get status for monitoring
     */
    getStatus() {
        const pending = Array.from(this.pendingDMs.values()).filter(dm => !dm.sent);
        const sent = Array.from(this.pendingDMs.values()).filter(dm => dm.sent);

        return {
            isRunning: this.isRunning,
            pendingCount: pending.length,
            sentCount: sent.length,
            nextDM: pending.length > 0
                ? pending.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0].scheduledFor
                : null,
        };
    }
}

export const dmFollowUpService = new DMFollowUpService();
