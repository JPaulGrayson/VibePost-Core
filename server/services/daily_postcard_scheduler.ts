import cron from 'node-cron';
import { generateDailyPostcard } from './daily_postcard';
import { storage } from '../storage';

// Configuration
const DAILY_POST_HOUR = 9; // 9 AM
const DAILY_POST_MINUTE = 0;
const TIMEZONE = 'America/Chicago'; // Central Time

let isSchedulerRunning = false;

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
        console.log('🌅 Daily Postcard: Scheduled post triggered');

        try {
            const result = await generateDailyPostcard(true); // autoPost = true

            if (result.success && result.tweetId) {
                console.log(`✅ Daily Postcard posted successfully!`);
                console.log(`   📍 Destination: ${result.destination}`);
                console.log(`   🐦 Tweet ID: ${result.tweetId}`);

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

                console.log(`   📊 Added to Post History`);
            } else {
                console.error(`❌ Daily Postcard failed: ${result.error}`);
            }
        } catch (error) {
            console.error('❌ Daily Postcard scheduler error:', error);
        }
    }, {
        timezone: TIMEZONE
    });

    isSchedulerRunning = true;
}

/**
 * Stop the scheduler (for cleanup)
 */
export function stopDailyPostcardScheduler() {
    // node-cron doesn't have a direct stop method for individual tasks
    // This is mainly for documentation purposes
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
        nextDestination: getNextDestination()
    };
}

// Helper to peek at next destination (uses same logic as daily_postcard.ts)
function getNextDestination(): string {
    const FEATURED_DESTINATIONS = [
        "Kyoto, Japan", "Santorini, Greece", "Machu Picchu, Peru", "Paris, France",
        "Bali, Indonesia", "Cinque Terre, Italy", "Banff, Canada", "Iceland Northern Lights",
        "Chefchaouen, Morocco", "Hallstatt, Austria", "Dubrovnik, Croatia", "Petra, Jordan",
        "Cappadocia, Turkey", "Plitvice Lakes, Croatia", "Faroe Islands", "Queenstown, New Zealand",
        "Swiss Alps", "Patagonia, Argentina", "Norwegian Fjords", "Scottish Highlands",
        "Okinawa, Japan", "Albanian Riviera", "Tbilisi, Georgia", "Bogotá, Colombia",
        "Raja Ampat, Indonesia"
    ];

    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    return FEATURED_DESTINATIONS[dayOfYear % FEATURED_DESTINATIONS.length];
}
