
import "dotenv/config";
import { db } from "../db";
import { postcardDrafts } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { publishDraft } from "../services/twitter_publisher";

async function retryPublish() {
    try {
        const draftId = 656;
        console.log(`Retrying publish for draft ${draftId}...`);

        const draft = await db.query.postcardDrafts.findFirst({
            where: eq(postcardDrafts.id, draftId)
        });

        if (!draft) {
            console.error("Draft not found!");
            return;
        }

        console.log("Draft found. Attempting to publish...");

        // Force status back to pending for the attempt (optional, but good for logic)
        // Actually publishDraft doesn't check status, it just takes the object.

        const result = await publishDraft(draft);

        console.log("------------------------------------------------");
        console.log("PUBLISH RESULT:");
        console.log(JSON.stringify(result, null, 2));
        console.log("------------------------------------------------");

    } catch (error) {
        console.error("Critical Error:", error);
    } finally {
        process.exit(0);
    }
}

retryPublish();
