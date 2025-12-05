
import { db } from "../server/db";
import { postcardDrafts } from "@shared/schema";
import { sql } from "drizzle-orm";

async function wipeDrafts() {
    console.log("🗑️ Wiping all postcard drafts...");
    try {
        await db.delete(postcardDrafts);
        console.log("✅ All drafts deleted successfully.");
    } catch (error) {
        console.error("❌ Error wiping drafts:", error);
    }
    process.exit(0);
}

wipeDrafts();
