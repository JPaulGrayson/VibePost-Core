
import "dotenv/config";
import { db } from "../db";
import { posts } from "../../shared/schema";
import { ilike } from "drizzle-orm";

async function findPost() {
    try {
        console.log("Searching for posts...");
        const foundPosts = await db.select().from(posts).where(
            ilike(posts.content, "%NYC%")
        );

        console.log(`Found ${foundPosts.length} posts.`);
        foundPosts.forEach(post => {
            console.log(`ID: ${post.id}`);
            console.log(`Content: ${post.content}`);
            console.log(`Status: ${post.status}`);
            console.log(`Platforms: ${JSON.stringify(post.platforms)}`);
            console.log("---");
        });
    } catch (error) {
        console.error("Error searching posts:", error);
    } finally {
        process.exit(0);
    }
}

findPost();
