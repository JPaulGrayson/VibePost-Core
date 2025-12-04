
import { db } from "../server/db";
import { postcardDrafts } from "../shared/schema";
import { desc, eq } from "drizzle-orm";

async function main() {
    try {
        const drafts = await db.select().from(postcardDrafts)
            .where(eq(postcardDrafts.originalAuthorHandle, "MaxTruth_Seeker"))
            .orderBy(desc(postcardDrafts.createdAt));

        console.log("Drafts for MaxTruth_Seeker:");
        console.log(JSON.stringify(drafts, null, 2));
    } catch (error) {
        console.error("Error querying drafts:", error);
    }
    process.exit(0);
}

main();
