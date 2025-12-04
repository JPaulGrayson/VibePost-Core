
import { db } from "../db";
import { postcardDrafts } from "@shared/schema";
import { not, inArray } from "drizzle-orm";

async function cleanupDrafts() {
    console.log("🧹 Cleaning up old drafts...");

    // Delete all drafts where the author is NOT in the protected list
    const protectedHandles = ["Jamesth3grayson", "4lexgrayson"];

    // Note: Drizzle's delete syntax
    const result = await db.delete(postcardDrafts)
        .where(not(inArray(postcardDrafts.originalAuthorHandle, protectedHandles)));

    console.log(`✅ Cleanup complete. Deleted drafts.`);
    process.exit(0);
}

cleanupDrafts().catch(console.error);
