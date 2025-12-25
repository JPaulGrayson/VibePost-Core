import "dotenv/config";
import { db } from "../server/db";
import { postcardDrafts } from "../shared/schema";

async function test() {
    try {
        console.log("Testing DB connection...");
        const drafts = await db.select().from(postcardDrafts).limit(1);
        console.log("Found drafts:", drafts.length);
        process.exit(0);
    } catch (err) {
        console.error("DB Test failed:", err);
        process.exit(1);
    }
}

test();
