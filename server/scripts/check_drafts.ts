
import "dotenv/config";
import { db } from "../db";
import { postcardDrafts } from "@shared/schema";
import { desc } from "drizzle-orm";

async function checkDrafts() {
    console.log("Checking recent postcard drafts...");
    const drafts = await db.select().from(postcardDrafts).orderBy(desc(postcardDrafts.createdAt)).limit(5);

    drafts.forEach(d => {
        console.log(`Draft ID: ${d.id}`);
        console.log(`Location: ${d.detectedLocation}`);
        console.log(`Image URL: ${d.turaiImageUrl}`);
        console.log(`Created At: ${d.createdAt}`);
        console.log("---");
    });
    process.exit(0);
}

checkDrafts().catch(console.error);
