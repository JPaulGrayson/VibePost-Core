import "dotenv/config";
import { db } from "../server/db";
import { postcardDrafts } from "@shared/schema";

async function checkDrafts() {
    const drafts = await db.query.postcardDrafts.findMany({ limit: 20 });
    console.log('Total drafts in DB:', drafts.length);
    drafts.forEach(d => console.log('  -', d.id, d.originalTweetId?.substring(0, 15), d.status, d.originalTweetText?.substring(0, 40)));

    // Check published drafts too
    const published = await db.query.postcardDrafts.findMany({
        where: (drafts, { eq }) => eq(drafts.status, 'published'),
        limit: 10
    });
    console.log('\nPublished drafts:', published.length);

    process.exit(0);
}

checkDrafts();
