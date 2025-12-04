
import "dotenv/config";
import { twitterListener } from "../server/services/twitter_listener";

async function main() {
    console.log("Forcing Twitter Listener check...");

    if (!process.env.BOT_USER_ID) {
        console.error("❌ BOT_USER_ID is not set in environment variables!");
        process.exit(1);
    }

    console.log(`Checking mentions for Bot ID: ${process.env.BOT_USER_ID}`);

    // Accessing the private method via 'any' cast or just calling startPolling which calls it immediately
    // Creating a new instance to avoid state issues with the singleton if it was stateful in a way that matters (it's mostly stateless per check)

    // We can't easily access the private method, but startPolling is public and calls checkMentions immediately.
    // However, startPolling sets isRunning=true.

    await (twitterListener as any).checkMentions();

    console.log("Check complete.");
    process.exit(0);
}

main().catch(console.error);
