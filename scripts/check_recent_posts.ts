import "dotenv/config";
import { db } from "../server/db";
import { postcardDrafts } from "../shared/schema";
import { desc, isNotNull } from "drizzle-orm";

async function check() {
    try {
        const last = await db.select().from(postcardDrafts)
            .where(isNotNull(postcardDrafts.publishedAt))
            .orderBy(desc(postcardDrafts.publishedAt))
            .limit(10);

        console.log("Recent Published Posts:");
        last.forEach(l => {
            console.log(` - [${l.publishedAt?.toLocaleString()}] @${l.originalAuthorHandle} (${l.detectedLocation || 'No loc'})`);
        });

        process.exit(0);
    } catch (err) {
        console.error("Check failed:", err);
        process.exit(1);
    }
}

check();
