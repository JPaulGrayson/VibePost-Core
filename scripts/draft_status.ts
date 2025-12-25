import "dotenv/config";
import { db } from "../server/db";
import { postcardDrafts } from "../shared/schema";
import { sql } from "drizzle-orm";

async function status() {
    try {
        const counts = await db.select({
            status: postcardDrafts.status,
            count: sql<number>`count(*)`
        }).from(postcardDrafts).groupBy(postcardDrafts.status);

        console.log("📊 Postcard Draft Status Summary:");
        counts.forEach(c => {
            console.log(` - ${c.status}: ${c.count}`);
        });

        const highQuality = await db.select({
            count: sql<number>`count(*)`
        }).from(postcardDrafts)
            .where(sql`status = 'pending_review' AND score >= 80`);

        console.log(`\n🔥 High-quality pending leads (80+): ${highQuality[0].count}`);

        process.exit(0);
    } catch (err) {
        console.error("Status check failed:", err);
        process.exit(1);
    }
}

status();
