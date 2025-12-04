
import "dotenv/config";
import { generateDraft } from "../services/postcard_drafter";

async function triggerAlexDraft() {
    try {
        const tweet = {
            id: "1996365300321927581",
            text: "I’m planning a trip to Waco Texas, any suggestions for an itinerary?",
            author_id: "unknown"
        };
        const authorHandle = "4lexgrayson";

        console.log("Triggering draft generation for Alex...");
        await generateDraft(tweet, authorHandle);
        console.log("Draft generation complete.");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

triggerAlexDraft();
