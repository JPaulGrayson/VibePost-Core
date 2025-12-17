/**
 * Cleanup Reddit Drafts
 * Deletes all drafts that have non-numeric originalTweetId (Reddit posts)
 * Run with: npx tsx scripts/cleanup_reddit_drafts.ts
 */

import "dotenv/config";
import { db } from "../server/db";
import { postcardDrafts } from "@shared/schema";
import { sql } from "drizzle-orm";

async function cleanupRedditDrafts() {
    console.log("🧹 Cleaning up Reddit drafts...\n");

    // Find all drafts with non-numeric IDs (Reddit posts)
    const allDrafts = await db.select().from(postcardDrafts);

    const redditDrafts = allDrafts.filter(d =>
        d.originalTweetId && !/^\d+$/.test(d.originalTweetId) &&
        !d.originalTweetId.startsWith('daily-') &&
        !d.originalTweetId.startsWith('thread-')
    );

    console.log(`Found ${redditDrafts.length} Reddit drafts to delete`);
    console.log(`(Keeping ${allDrafts.length - redditDrafts.length} Twitter/daily/thread drafts)\n`);

    if (redditDrafts.length === 0) {
        console.log("✅ No Reddit drafts to clean up!");
        process.exit(0);
    }

    // Show sample
    console.log("Sample of drafts being deleted:");
    redditDrafts.slice(0, 3).forEach(d => {
        console.log(`  - ID: ${d.originalTweetId}, Author: ${d.originalAuthorHandle}, Location: ${d.detectedLocation}`);
    });
    console.log("");

    // Delete them
    for (const draft of redditDrafts) {
        await db.delete(postcardDrafts).where(sql`id = ${draft.id}`);
    }

    console.log(`✅ Deleted ${redditDrafts.length} Reddit drafts`);
    process.exit(0);
}

cleanupRedditDrafts().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
