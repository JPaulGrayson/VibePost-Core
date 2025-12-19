
import { storage } from "../server/storage";

async function auditPosts() {
    console.log("🔍 Auditing Recent Posts (Limit 20)...");

    // Get raw posts from DB
    const posts = await storage.getPosts();

    // Sort by desc date
    posts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    console.log(`\nFound ${posts.length} total posts. Listing top 20 recent:\n`);

    posts.slice(0, 20).forEach(p => {
        const date = new Date(p.publishedAt).toLocaleString("en-US", { timeZone: "America/Chicago" });
        const type = p.platformData?.twitter?.autoPublished ? "🤖 Auto-Reply" :
            p.content.includes("Thread Tour") || p.content.includes("tour") ? "🧵 Thread Tour" :
                p.content.includes("postcard") || p.content.includes("Card") ? "🖼️ Postcard" : "📝 Other";

        console.log(`[${p.id}] ${date} | ${type} | ${p.content.substring(0, 50)}...`);
    });

    console.log("\n-------- DUPLICATE CHECK --------");
    // Check for string similarity or potential duplicates
    const contentMap = new Map();
    posts.slice(0, 50).forEach(p => {
        const key = p.content.substring(0, 30); // simplistic check
        if (!contentMap.has(key)) contentMap.set(key, []);
        contentMap.get(key).push(p.id);
    });

    for (const [key, ids] of contentMap.entries()) {
        if (ids.length > 1) {
            console.log(`⚠️ Potential Duplicate (Content: "${key}..."): IDs [${ids.join(", ")}]`);
        }
    }

    console.log("\n-------- SOURCE AUDIT --------");
    // Check if Auto-Publisher posts are actually in the DB
    const autoPosts = posts.filter(p => p.platformData?.twitter?.autoPublished);
    console.log(`🤖 Auto-Published Posts in DB: ${autoPosts.length}`);
    if (autoPosts.length > 0) {
        console.log(`   Last Auto-Post: ${new Date(autoPosts[0].publishedAt).toLocaleString()} - ID ${autoPosts[0].id}`);
    } else {
        console.log("   ❌ NO auto-published posts found in 'posts' table!");
    }

    process.exit(0);
}

auditPosts().catch(console.error);
