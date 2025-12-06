
import "dotenv/config";
import { db } from "../server/db";
import { postcardDrafts, posts } from "@shared/schema";
import { gt, desc, eq, and } from "drizzle-orm";

async function auditActivity() {
    console.log("🕵️‍♀️ Auditing VibePost Activity (Last 24 Hours)...");

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
        // 1. Check Postcard Drafts (The main VibePost activity)
        const recentDrafts = await db.query.postcardDrafts.findMany({
            where: gt(postcardDrafts.createdAt, oneDayAgo),
            orderBy: [desc(postcardDrafts.createdAt)],
        });

        console.log(`\n📄 Postcard Drafts Created: ${recentDrafts.length}`);

        const statusCounts = recentDrafts.reduce((acc, draft) => {
            acc[draft.status] = (acc[draft.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        console.log("   Status Breakdown:");
        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`   - ${status}: ${count}`);
        });

        const failedDrafts = recentDrafts.filter(d => d.status === 'failed');
        if (failedDrafts.length > 0) {
            console.log("\n❌ Failed Drafts Details:");
            failedDrafts.forEach(d => {
                console.log(`   - ID ${d.id} (@${d.originalAuthorHandle}): Created ${d.createdAt}`);
                // Note: Schema doesn't have an 'error' column for drafts, so we can't see the specific error message here.
            });
        }

        // 2. Check Published Posts (if they go to 'posts' table)
        const recentPosts = await db.query.posts.findMany({
            where: gt(posts.createdAt, oneDayAgo),
            orderBy: [desc(posts.createdAt)],
        });

        console.log(`\n📢 Published Posts (in 'posts' table): ${recentPosts.length}`);
        recentPosts.forEach(p => {
            console.log(`   - ID ${p.id} (${p.status}): ${p.content.substring(0, 50)}...`);
        });

    } catch (error) {
        console.error("❌ Audit Failed:", error);
    }
    process.exit(0);
}

auditActivity();
