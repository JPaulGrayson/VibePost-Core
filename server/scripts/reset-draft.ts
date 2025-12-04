
import "dotenv/config";
import { db } from "../db";
import { postcardDrafts } from "@shared/schema";
import { eq } from "drizzle-orm";

async function resetDraft() {
    await db.update(postcardDrafts)
        .set({ status: "pending_review" })
        .where(eq(postcardDrafts.id, 678));
    console.log("Draft 678 reset to pending_review");
}

resetDraft().catch(console.error);
