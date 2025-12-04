
import "dotenv/config";
import { db } from "../db";
import { postcardDrafts } from "@shared/schema";
import { postcardDrafter } from "../services/postcard_drafter";
import { like } from "drizzle-orm";

async function regenerateImages() {
    console.log("Searching for drafts with mock images...");

    // Find drafts with mock images
    const drafts = await db.select().from(postcardDrafts).where(like(postcardDrafts.turaiImageUrl, "%mock-image%"));

    console.log(`Found ${drafts.length} drafts to regenerate.`);

    for (const draft of drafts) {
        console.log(`Regenerating image for Draft ${draft.id} (${draft.detectedLocation})...`);
        try {
            const newUrl = await postcardDrafter.regenerateImage(draft.id);
            console.log(`✅ Success: ${newUrl}`);
        } catch (error) {
            console.error(`❌ Failed for Draft ${draft.id}:`, error);
        }
        // Wait a bit to avoid overwhelming Turai
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("Done.");
    process.exit(0);
}

regenerateImages().catch(console.error);
