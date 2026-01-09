import { db } from "../server/db";
import { postcardDrafts } from "../shared/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { postcardDrafter } from "../server/services/postcard_drafter";

async function backfill() {
  console.log("Starting image backfill for Arena Referee drafts...");
  
  const drafts = await db.query.postcardDrafts.findMany({
    where: and(
      eq(postcardDrafts.strategy, "arena_referee"),
      or(
        isNull(postcardDrafts.turaiImageUrl),
        eq(postcardDrafts.turaiImageUrl, "")
      )
    ),
    limit: 50
  });
  
  console.log(`Found ${drafts.length} drafts needing images`);
  
  let success = 0;
  let failed = 0;
  
  for (const draft of drafts) {
    console.log(`\nProcessing draft ${draft.id}...`);
    try {
      const verdict = draft.arenaVerdict as any;
      const winner = verdict?.winner || "AI";
      const imageUrl = await postcardDrafter.generateArenaRefereeImage(winner, draft.originalTweetText || undefined);
      
      await db.update(postcardDrafts)
        .set({ turaiImageUrl: imageUrl })
        .where(eq(postcardDrafts.id, draft.id));
      
      console.log(`  ✅ Generated: ${imageUrl}`);
      success++;
      
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      console.error(`  ❌ Failed: ${err.message}`);
      failed++;
    }
  }
  
  console.log(`\n=== Backfill Complete ===`);
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  process.exit(0);
}

backfill();
