
import { db } from "../server/db";
import { postcardDrafts } from "../shared/schema";
import { desc } from "drizzle-orm";

async function main() {
    try {
        const drafts = await db.select().from(postcardDrafts).orderBy(desc(postcardDrafts.createdAt)).limit(5);
        console.log("Recent Postcard Drafts:");
        console.log(JSON.stringify(drafts, null, 2));
    } catch (error) {
        console.error("Error querying drafts:", error);
    }
    process.exit(0);
}

main();
