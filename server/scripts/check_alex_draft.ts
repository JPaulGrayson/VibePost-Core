
import "dotenv/config";
import { db } from "../db";
import { postcardDrafts } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";

async function checkAlexDraft() {
    try {
        console.log("Checking for drafts from @4lexgrayson...");

        const drafts = await db.select().from(postcardDrafts)
            .where(eq(postcardDrafts.originalAuthorHandle, "4lexgrayson"))
            .orderBy(desc(postcardDrafts.createdAt));

        if (drafts.length === 0) {
            console.log("No drafts found for @4lexgrayson yet.");
        } else {
            console.log(`Found ${drafts.length} drafts.`);
            drafts.forEach(d => {
                console.log("------------------------------------------------");
                console.log(`ID: ${d.id}`);
                console.log(`Status: ${d.status}`);
                console.log(`Text: ${d.originalTweetText}`);
                console.log(`Created At: ${d.createdAt}`);
            });
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

checkAlexDraft();
