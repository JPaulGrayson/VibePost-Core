/**
 * Daily Video Scheduler
 * Posts a video slideshow to the profile daily at 9:00 AM Central
 * Replaces both Daily Postcard and Thread Tour schedulers
 */

import cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import { generateVideoPost, generateVideoCaption } from './video_post_generator';
import { publishDraftWithVideo } from './twitter_publisher';

// Configuration
const DAILY_POST_HOUR = 9;     // 9 AM
const DAILY_POST_MINUTE = 0;   // On the hour
const TIMEZONE = 'America/Chicago';
const LOG_FILE = path.join(process.cwd(), 'daily_video.log');

// Featured destinations queue
const DESTINATION_QUEUE = [
    { destination: "Paris, France", topic: "hidden cafes and local spots" },
    { destination: "Tokyo, Japan", topic: "traditional temples and modern culture" },
    { destination: "Rome, Italy", topic: "ancient ruins and authentic trattorias" },
    { destination: "Barcelona, Spain", topic: "Gaudi architecture and beach vibes" },
    { destination: "Bali, Indonesia", topic: "rice terraces and spiritual temples" },
    { destination: "Santorini, Greece", topic: "sunset views and blue domes" },
    { destination: "Kyoto, Japan", topic: "geisha districts and zen gardens" },
    { destination: "Amsterdam, Netherlands", topic: "canals and art museums" },
    { destination: "Lisbon, Portugal", topic: "tram rides and pastel de nata" },
    { destination: "Prague, Czech Republic", topic: "medieval charm and beer culture" },
    { destination: "Vienna, Austria", topic: "classical music and coffee houses" },
    { destination: "Marrakech, Morocco", topic: "souks and riads" },
    { destination: "Dubai, UAE", topic: "desert adventures and modern marvels" },
    { destination: "Sydney, Australia", topic: "harbor views and beach culture" },
    { destination: "Cape Town, South Africa", topic: "Table Mountain and wine country" }
];

// State
let schedulerActive = false;
let lastPostedIndex = -1;
let customNextDestination: { destination: string; topic?: string } | null = null;

function log(message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${message}`;
    console.log(`📹 Daily Video: ${message}`);

    try {
        fs.appendFileSync(LOG_FILE, logEntry + '\n');
    } catch (e) {
        // Ignore logging errors
    }
}

/**
 * Get next destination from queue
 */
function getNextDestination(): { destination: string; topic?: string } {
    if (customNextDestination) {
        const next = customNextDestination;
        customNextDestination = null; // Use once
        return next;
    }

    lastPostedIndex = (lastPostedIndex + 1) % DESTINATION_QUEUE.length;
    return DESTINATION_QUEUE[lastPostedIndex];
}

/**
 * Generate and post daily video
 */
async function postDailyVideo() {
    log('Starting daily video generation...');

    const { destination, topic } = getNextDestination();
    log(`Destination: ${destination}${topic ? ` (${topic})` : ''}`);

    try {
        // Generate video
        const result = await generateVideoPost({
            destination,
            topic,
            maxStops: 5,
            secondsPerStop: 12,
            theme: 'hidden_gems'
        });

        if (!result.success || !result.videoPath) {
            log(`ERROR: Video generation failed - ${result.error}`);
            return;
        }

        log(`Video created: ${result.videoPath}`);

        // Generate caption
        const caption = await generateVideoCaption(destination, topic);
        log(`Caption: ${caption.substring(0, 50)}...`);

        // Publish to X
        const publishResult = await publishDraftWithVideo(result.videoPath, caption);

        if (publishResult.success) {
            log(`SUCCESS: Posted to X! Tweet ID: ${publishResult.tweetId}`);
        } else {
            log(`ERROR: Publish failed - ${publishResult.error}`);
        }

    } catch (error) {
        log(`ERROR: ${String(error)}`);
    }
}

/**
 * Start the daily video scheduler
 */
export function startDailyVideoScheduler() {
    if (schedulerActive) {
        console.log('📹 Daily video scheduler already running');
        return;
    }

    console.log('📹 Starting daily video scheduler...');
    console.log(`   ⏰ Scheduled for: ${DAILY_POST_HOUR}:${DAILY_POST_MINUTE.toString().padStart(2, '0')} ${TIMEZONE}`);

    const cronExpression = `${DAILY_POST_MINUTE} ${DAILY_POST_HOUR} * * *`;

    cron.schedule(cronExpression, async () => {
        console.log('📹 Daily video triggered by scheduler');
        await postDailyVideo();
    }, {
        timezone: TIMEZONE
    });

    schedulerActive = true;
    log('Scheduler started');
}

/**
 * Get scheduler status
 */
export function getDailyVideoSchedulerStatus() {
    const nextDest = customNextDestination || DESTINATION_QUEUE[(lastPostedIndex + 1) % DESTINATION_QUEUE.length];

    return {
        active: schedulerActive,
        scheduledTime: `${DAILY_POST_HOUR}:${DAILY_POST_MINUTE.toString().padStart(2, '0')}`,
        timezone: TIMEZONE,
        nextDestination: nextDest.destination,
        nextTopic: nextDest.topic,
        queuePosition: lastPostedIndex + 1,
        queueTotal: DESTINATION_QUEUE.length,
        isCustomNext: !!customNextDestination
    };
}

/**
 * Set custom next destination
 */
export function setNextVideoDestination(destination: string, topic?: string) {
    customNextDestination = { destination, topic };
    log(`Set custom next: ${destination}${topic ? ` (${topic})` : ''}`);
}

/**
 * Clear custom next destination
 */
export function clearNextVideoDestination() {
    customNextDestination = null;
    log('Cleared custom next destination');
}

/**
 * Trigger daily video immediately (for testing)
 */
export async function triggerDailyVideoNow() {
    log('Manual trigger');
    await postDailyVideo();
}

/**
 * Get destination queue
 */
export function getVideoDestinationQueue() {
    return DESTINATION_QUEUE.map((item, idx) => ({
        ...item,
        isCurrent: idx === lastPostedIndex,
        isNext: customNextDestination ? false : idx === ((lastPostedIndex + 1) % DESTINATION_QUEUE.length)
    }));
}
