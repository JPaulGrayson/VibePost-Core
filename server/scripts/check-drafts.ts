
import "dotenv/config";
import { db } from "../db";
import { postcardDrafts } from "../../shared/schema";
import { eq, desc, inArray } from "drizzle-orm";

async function checkDrafts() {
    const drafts = await db.select().from(postcardDrafts)
        .where(eq(postcardDrafts.id, 655));

    console.log("Found Drafts:");
    for (const draft of drafts) {
        console.log(`[START]`);
        console.log(`ID: ${draft.id}`);
        console.log(`Author: ${draft.originalAuthorHandle}`);
        console.log(`Text: ${draft.originalTweetText}`);
        console.log(`Image URL Prefix: ${draft.turaiImageUrl?.substring(0, 50)}...`);
        console.log(`Image URL Length: ${draft.turaiImageUrl?.length}`);
        console.log(`Created At: ${draft.createdAt}`);
        console.log(`Status: ${draft.status}`);
        console.log(`[END]`);
    }
}

checkDrafts();
