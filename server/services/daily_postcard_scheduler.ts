import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { generateDailyPostcard, getTodaysDestination } from './daily_postcard';
import { storage } from '../storage';

// Configuration
const DAILY_POST_HOUR = 9; // 9 AM
const DAILY_POST_MINUTE = 0;
const TIMEZONE = 'America/Chicago'; // Central Time
const LOG_FILE = path.join(process.cwd(), 'scheduler.log');

let isSchedulerRunning = false;

/**
 * Log to both console and file for persistent tracking
 */
function logScheduler(message: string) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    console.log(logLine);
    try {
        fs.appendFileSync(LOG_FILE, logLine + '\n');
    } catch (e) {
        // Ignore file write errors
    }
}

/**
 * Start the daily postcard scheduler
 * Posts a new travel postcard every day at the configured time
 */
export function startDailyPostcardScheduler() {
    if (isSchedulerRunning) {
        console.log('📅 Daily Postcard Scheduler already running');
        return;
    }

    // Cron format: minute hour day month weekday
    const cronExpression = `${DAILY_POST_MINUTE} ${DAILY_POST_HOUR} * * *`;

    console.log(`📅 Daily Postcard Scheduler started`);
    console.log(`   ⏰ Scheduled for: ${DAILY_POST_HOUR}:${DAILY_POST_MINUTE.toString().padStart(2, '0')} ${TIMEZONE}`);
    console.log(`   📍 Destinations: Cycles through 25 photogenic locations`);

    cron.schedule(cronExpression, async () => {
        logScheduler('🌅 Daily Postcard: Scheduled post TRIGGERED');

        try {
            const result = await generateDailyPostcard(true); // autoPost = true

            if (result.success && result.tweetId) {
                logScheduler(`✅ Daily Postcard SUCCESS - ${result.destination} - Tweet: ${result.tweetId}`);

                // Create Post History entry
                await storage.createPost({
                    userId: 'system',
                    content: result.caption,
                    platforms: ['twitter'],
                    status: 'published',
                    publishedAt: new Date(),
                    platformData: {
                        twitter: {
                            tweetId: result.tweetId,
                            url: `https://twitter.com/MaxTruth_Seeker/status/${result.tweetId}`,
                            destination: result.destination,
                            type: 'daily_postcard'
                        }
                    }
                } as any);

                logScheduler(`   📊 Added to Post History`);
            } else {
                logScheduler(`❌ Daily Postcard FAILED: ${result.error}`);
            }
        } catch (error) {
            logScheduler(`❌ Daily Postcard ERROR: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, {
        timezone: TIMEZONE
    });

    isSchedulerRunning = true;
}

/**
 * Manually trigger a daily postcard (for testing)
 */
export async function triggerDailyPostcardNow(): Promise<{ success: boolean; message: string; tweetId?: string }> {
    logScheduler('🔧 Manual Daily Postcard trigger initiated');

    try {
        const result = await generateDailyPostcard(true);

        if (result.success && result.tweetId) {
            logScheduler(`✅ Manual trigger SUCCESS - ${result.destination} - Tweet: ${result.tweetId}`);

            await storage.createPost({
                userId: 'system',
                content: result.caption,
                platforms: ['twitter'],
                status: 'published',
                publishedAt: new Date(),
                platformData: {
                    twitter: {
                        tweetId: result.tweetId,
                        url: `https://twitter.com/MaxTruth_Seeker/status/${result.tweetId}`,
                        destination: result.destination,
                        type: 'daily_postcard'
                    }
                }
            } as any);

            return {
                success: true,
                message: `Posted daily postcard for ${result.destination}`,
                tweetId: result.tweetId
            };
        } else {
            logScheduler(`❌ Manual trigger FAILED: ${result.error}`);
            return { success: false, message: result.error || 'Unknown error' };
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logScheduler(`❌ Manual trigger ERROR: ${msg}`);
        return { success: false, message: msg };
    }
}

/**
 * Stop the scheduler (for cleanup)
 */
export function stopDailyPostcardScheduler() {
    isSchedulerRunning = false;
    console.log('📅 Daily Postcard Scheduler stopped');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
    return {
        isRunning: isSchedulerRunning,
        scheduledTime: `${DAILY_POST_HOUR}:${DAILY_POST_MINUTE.toString().padStart(2, '0')}`,
        timezone: TIMEZONE,
        nextDestination: getTodaysDestination()
    };
}
