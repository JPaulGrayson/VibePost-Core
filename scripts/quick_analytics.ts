/**
 * Quick Analytics Summary
 * Simple report using production database
 */

import 'dotenv/config';
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function quickSummary() {
    console.log("📊 VibePost Analytics Summary\n");
    console.log("═══════════════════════════════════════════\n");

    // Get total posts
    const [{ count: totalPosts }] = await sql`
    SELECT COUNT(*) as count FROM posts WHERE status = 'published'
  `;

    // Get posts with engagement data
    const posts = await sql`
    SELECT 
      id,
      content,
      created_at,
      platform_data
    FROM posts 
    WHERE status = 'published' 
    AND platform_data->'twitter' IS NOT NULL
    ORDER BY created_at DESC
  `;

    let totalLikes = 0, totalRetweets = 0, totalReplies = 0, totalImpressions = 0;
    let postsWithEngagement = 0;

    posts.forEach((post: any) => {
        const twitter = post.platform_data?.twitter;
        if (twitter) {
            totalLikes += twitter.likes || 0;
            totalRetweets += twitter.retweets || 0;
            totalReplies += twitter.replies || 0;
            totalImpressions += twitter.impressions || 0;

            if ((twitter.likes || 0) + (twitter.retweets || 0) + (twitter.replies || 0) > 0) {
                postsWithEngagement++;
            }
        }
    });

    const totalEngagements = totalLikes + totalRetweets + totalReplies;
    const engagementRate = Number(totalPosts) > 0 ? (postsWithEngagement / Number(totalPosts)) * 100 : 0;
    const avgImpressions = Number(totalPosts) > 0 ? totalImpressions / Number(totalPosts) : 0;

    console.log("📈 OVERALL PERFORMANCE");
    console.log("─────────────────────────────────────────");
    console.log(`Total Posts:           ${totalPosts}`);
    console.log(`Total Impressions:     ${totalImpressions.toLocaleString()}`);
    console.log(`Total Engagements:     ${totalEngagements}`);
    console.log(`  ├─ Likes:            ${totalLikes}`);
    console.log(`  ├─ Retweets:         ${totalRetweets}`);
    console.log(`  └─ Replies:          ${totalReplies}`);
    console.log();
    console.log(`Engagement Rate:       ${engagementRate.toFixed(2)}%`);
    console.log(`Avg Impressions/Post:  ${avgImpressions.toFixed(1)}`);
    console.log(`Posts with Engagement: ${postsWithEngagement} (${engagementRate.toFixed(1)}%)`);
    console.log();

    // Get recent performance (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentPosts = posts.filter((p: any) => new Date(p.created_at) >= sevenDaysAgo);

    let recentLikes = 0, recentRetweets = 0, recentReplies = 0;
    recentPosts.forEach((post: any) => {
        const twitter = post.platform_data?.twitter;
        if (twitter) {
            recentLikes += twitter.likes || 0;
            recentRetweets += twitter.retweets || 0;
            recentReplies += twitter.replies || 0;
        }
    });

    const recentEngagements = recentLikes + recentRetweets + recentReplies;

    console.log("📅 LAST 7 DAYS");
    console.log("─────────────────────────────────────────");
    console.log(`Posts: ${recentPosts.length}`);
    console.log(`Engagements: ${recentEngagements}`);
    console.log(`  ├─ Likes: ${recentLikes}`);
    console.log(`  ├─ Retweets: ${recentRetweets}`);
    console.log(`  └─ Replies: ${recentReplies}`);
    console.log();

    // Top performing posts
    const topPosts = posts
        .filter((p: any) => {
            const twitter = p.platform_data?.twitter;
            return twitter && ((twitter.likes || 0) + (twitter.retweets || 0) + (twitter.replies || 0)) > 0;
        })
        .sort((a: any, b: any) => {
            const aEng = (a.platform_data.twitter.likes || 0) + (a.platform_data.twitter.retweets || 0) + (a.platform_data.twitter.replies || 0);
            const bEng = (b.platform_data.twitter.likes || 0) + (b.platform_data.twitter.retweets || 0) + (b.platform_data.twitter.replies || 0);
            return bEng - aEng;
        })
        .slice(0, 5);

    console.log("🏆 TOP 5 PERFORMING POSTS");
    console.log("─────────────────────────────────────────");
    topPosts.forEach((post: any, idx: number) => {
        const twitter = post.platform_data.twitter;
        const engagements = (twitter.likes || 0) + (twitter.retweets || 0) + (twitter.replies || 0);
        console.log(`${idx + 1}. Post #${post.id} - ${engagements} engagements`);
        console.log(`   ${post.content.substring(0, 70)}...`);
        console.log();
    });

    console.log("💡 KEY INSIGHTS");
    console.log("─────────────────────────────────────────");

    if (engagementRate > 10) {
        console.log("✅ Excellent engagement rate (>10%)!");
        console.log("   Your content is resonating well with your audience.");
    } else if (engagementRate > 5) {
        console.log("📈 Good engagement rate (5-10%).");
        console.log("   Consider A/B testing different content styles.");
    } else {
        console.log("⚠️  Low engagement rate (<5%).");
        console.log("   Review targeting and content quality.");
    }

    console.log();

    if (avgImpressions < 50) {
        console.log("📢 Low impressions per post (<50).");
        console.log("   Try: Better timing, targeting larger accounts, or using hashtags.");
    } else {
        console.log("👁️  Good impression rate!");
    }

    console.log();
    console.log("🎯 RECOMMENDATIONS");
    console.log("─────────────────────────────────────────");
    console.log("1. Continue focusing on lead generation");
    console.log("2. Monitor which destinations get most engagement");
    console.log("3. Set up conversion tracking (profile visits → sign-ups)");
    console.log("4. Test posting at different times to optimize reach");
    console.log();
    console.log("✅ Report Complete!\n");
}

quickSummary().catch(console.error);
