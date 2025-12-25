import "dotenv/config";
import { db } from "../server/db";
import { postcardDrafts } from "../shared/schema";
import { and, lt, or, eq } from "drizzle-orm";

async function cleanup() {
    try {
        console.log("🧹 Starting cleanup of drafts with score < 90...");

        // We target 'pending_review' and 'pending_retry' status
        const result = await db.delete(postcardDrafts)
            .where(
                and(
                    or(
                        eq(postcardDrafts.status, "pending_review"),
                        eq(postcardDrafts.status, "pending_retry")
                    ),
                    lt(postcardDrafts.score, 90)
                )
            );

        console.log(`✅ Cleanup complete. Removed low-quality drafts.`);
        process.exit(0);
    } catch (err) {
        console.error("Cleanup failed:", err);
        process.exit(1);
    }
}

cleanup();
