
import { db } from "../db";
import { postcardDrafts } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { PostcardDrafter } from "../services/postcard_drafter";

async function forceRegenerateDrafts() {
    console.log("🧙‍♂️ Force Regenerating Drafts for the Graysons...");

    // 1. Find the drafts for your sons (James and Alex)
    // Adjust handles if needed: @Jamesth3grayson and @4lexgrayson
    const drafts = await db.select().from(postcardDrafts).where(
        inArray(postcardDrafts.originalAuthorHandle, ["Jamesth3grayson", "4lexgrayson"])
    );

    if (drafts.length === 0) {
        console.log("❌ No drafts found for Jamesth3grayson or 4lexgrayson.");
        process.exit(1);
    }

    const drafter = new PostcardDrafter();

    for (const draft of drafts) {
        console.log(`\nFound draft ${draft.id} for @${draft.originalAuthorHandle}`);
        console.log(`Current Text: "${draft.draftReplyText}"`);

        // 2. Regenerate Text (This will now include the "Check bio" CTA automatically)
        console.log("Regenerating text...");
        const newText = await drafter.regenerateReplyText(draft.id);
        console.log(`✅ New Text: "${newText}"`);

        // 3. (Optional) Regenerate Image - Skipping to avoid timeout, text is the priority
        // console.log("Regenerating image...");
        // await drafter.regenerateImage(draft.id);
    }

    console.log("\n✨ All done! Refresh your browser to see the changes.");
    process.exit(0);
}

forceRegenerateDrafts().catch(console.error);
