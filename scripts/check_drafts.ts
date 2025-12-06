
import "dotenv/config";
import { db } from "../server/db";
import { postcardDrafts } from "../shared/schema";
import { desc } from "drizzle-orm";

async function main() {
    try {
        const drafts = await db.select().from(postcardDrafts).orderBy(desc(postcardDrafts.createdAt)).limit(5);
        console.log("Recent Postcard Drafts:");
        console.log(JSON.stringify(drafts.map(d => ({
            id: d.id,
            status: d.status,
            turaiImageUrl: d.turaiImageUrl ? (d.turaiImageUrl.length > 50 ? d.turaiImageUrl.substring(0, 50) + '...' : d.turaiImageUrl) : 'NULL',
            fullUrl: d.turaiImageUrl
        })), null, 2));
    } catch (error) {
        console.error("Error querying drafts:", error);
    }
    process.exit(0);
}

main();
