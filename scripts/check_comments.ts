import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const sql = neon(process.env.DATABASE_URL!);

async function checkComments() {
    // Get posts from last 2 days with comments
    const posts = await sql`
    SELECT 
      id,
      content,
      platform_data->'twitter'->>'url' as tweet_url,
      platform_data->'twitter'->>'replies' as replies,
      platform_data->'twitter'->>'likes' as likes,
      platform_data->'twitter'->>'retweets' as retweets,
      published_at
    FROM posts
    WHERE status = 'published'
      AND DATE(published_at) >= CURRENT_DATE - INTERVAL '2 days'
      AND (platform_data->'twitter'->>'replies')::int > 0
    ORDER BY (platform_data->'twitter'->>'replies')::int DESC
    LIMIT 20
  `;

    console.log(`\n📊 Posts with Comments (${posts.length} found):\n`);

    for (const post of posts) {
        console.log(`${'='.repeat(80)}`);
        console.log(`💬 ${post.replies} comments | ❤️ ${post.likes} likes | 🔄 ${post.retweets} retweets`);
        console.log(`📝 ${post.content.substring(0, 100)}...`);
        console.log(`🔗 ${post.tweet_url}`);
        console.log(`⏰ ${new Date(post.published_at).toLocaleString()}\n`);
    }

    // Get totals
    const totals = await sql`
    SELECT 
      COUNT(*) as total_posts,
      SUM((platform_data->'twitter'->>'replies')::int) as total_replies,
      SUM((platform_data->'twitter'->>'likes')::int) as total_likes,
      SUM((platform_data->'twitter'->>'retweets')::int) as total_retweets
    FROM posts
    WHERE status = 'published'
      AND DATE(published_at) >= CURRENT_DATE - INTERVAL '2 days'
  `;

    console.log(`${'='.repeat(80)}`);
    console.log(`\n📈 Last 2 Days Totals:`);
    console.log(`   Posts: ${totals[0].total_posts}`);
    console.log(`   Comments: ${totals[0].total_replies}`);
    console.log(`   Likes: ${totals[0].total_likes}`);
    console.log(`   Retweets: ${totals[0].total_retweets}\n`);
}

checkComments().catch(console.error);
