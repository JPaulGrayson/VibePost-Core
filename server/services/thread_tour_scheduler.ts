import cron from 'node-cron';
import { postThreadTour, getTodaysThreadDestination } from './thread_tour';

let schedulerActive = false;
let nextDestination: string | null = null;

/**
 * Start the Thread Tour scheduler
 * Runs daily at 6 PM Central Time
 */
export function startThreadTourScheduler() {
    // Schedule for 6 PM Central Time (America/Chicago)
    // Cron: minute hour day month weekday
    cron.schedule('0 18 * * *', async () => {
        console.log('🧵 Thread Tour: Scheduled post triggered');

        try {
            const destination = nextDestination || getTodaysThreadDestination();
            console.log(`🧵 Posting thread tour for: ${destination}`);

            const result = await postThreadTour(destination, {
                maxStops: 5,
                theme: 'hidden_gems'
            });

            if (result.success) {
                const postedCount = result.tweets.filter(t => t.status === 'posted').length;
                console.log(`✅ Thread Tour posted! ${postedCount} tweets in thread`);
                console.log(`   Thread ID: ${result.threadId}`);
            } else {
                console.error(`❌ Thread Tour failed: ${result.error}`);
            }

            // Reset next destination after posting
            nextDestination = null;

        } catch (error) {
            console.error('❌ Thread Tour scheduler error:', error);
        }
    }, {
        timezone: "America/Chicago"
    });

    schedulerActive = true;
    nextDestination = getTodaysThreadDestination();

    console.log(`🧵 Thread Tour Scheduler started`);
    console.log(`   ⏰ Scheduled for: 18:00 America/Chicago (6 PM CST)`);
    console.log(`   📍 Next destination: ${nextDestination}`);
}

/**
 * Get scheduler status
 */
export function getThreadTourSchedulerStatus() {
    return {
        active: schedulerActive,
        scheduledTime: '18:00',
        timezone: 'America/Chicago',
        nextDestination: nextDestination || getTodaysThreadDestination()
    };
}

/**
 * Set a custom destination for the next scheduled post
 */
export function setNextThreadDestination(destination: string) {
    nextDestination = destination;
    console.log(`🧵 Next thread destination set to: ${destination}`);
}

/**
 * Clear the custom destination (revert to auto)
 */
export function clearNextThreadDestination() {
    nextDestination = null;
    console.log(`🧵 Next thread destination cleared, reverting to auto`);
}
