
import { postcardDrafter } from "../server/services/postcard_drafter";
import { generateDraft } from "../server/services/postcard_drafter";

async function main() {
    console.log("Simulating VibePost finding a high-intent tweet...");

    const mockTweet = {
        id: "tweet_" + Date.now(),
        text: "Thinking about a trip to New York City. Does anyone have any restaurant or itinerary suggestions?",
        author_id: "mock_user_id"
    };

    const authorHandle = "JPaulGraysonn";

    console.log(`Processing tweet from @${authorHandle}: "${mockTweet.text}"`);

    // Manually trigger the draft generation logic
    await generateDraft(mockTweet, authorHandle);

    console.log("Simulation complete. Check the drafts.");
    process.exit(0);
}

main().catch(console.error);
