
import "dotenv/config";
import { db } from "../db";
import { postcardDrafts } from "../../shared/schema";
import { eq } from "drizzle-orm";

async function checkDraftDetails() {
    try {
        const draftId = 656;
        const draft = await db.query.postcardDrafts.findFirst({
            where: eq(postcardDrafts.id, draftId)
        });

        if (draft) {
            console.log("Draft Details:");
            console.log("ID:", draft.id);
            console.log("Status:", draft.status);
            console.log("Image URL:", draft.turaiImageUrl);
            console.log("Text:", draft.draftReplyText);
        } else {
            console.log("Draft not found.");
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

checkDraftDetails();
