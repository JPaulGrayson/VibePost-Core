/**
 * Update Growth Metrics
 * Daily script to update follower count and engagement metrics
 */

import 'dotenv/config';
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function updateGrowthMetrics(followerCount?: number) {
    console.log("📊 Updating Growth Metrics...\n");

    const today = new Date().toISOString().split('T')[0];

    // Get current post stats
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
    const destinationStats: Record<string, { posts: number; engagements: number; impressions: number }> = {};

    posts.forEach((post: any) => {
        const twitter = post.platform_data?.twitter;
        if (!twitter) return;

        const likes = twitter.likes || 0;
        const retweets = twitter.retweets || 0;
        const replies = twitter.replies || 0;
        const impressions = twitter.impressions || 0;

        totalLikes += likes;
        totalRetweets += retweets;
        totalReplies += replies;
        totalImpressions += impressions;

        if (likes + retweets + replies > 0) {
            postsWithEngagement++;
        }

        // Extract destination
        const destMatch = post.content.match(/(?:to|in|over|through)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (destMatch) {
            const dest = destMatch[1];
            if (!destinationStats[dest]) {
                destinationStats[dest] = { posts: 0, engagements: 0, impressions: 0 };
            }
            destinationStats[dest].posts++;
            destinationStats[dest].engagements += likes + retweets + replies;
            destinationStats[dest].impressions += impressions;
        }
    });

    const totalEngagements = totalLikes + totalRetweets + totalReplies;
    const engagementRate = posts.length > 0 ? (postsWithEngagement / posts.length) * 100 : 0;
    const avgImpressionsPerPost = posts.length > 0 ? totalImpressions / posts.length : 0;

    // Find top destination
    const topDestination = Object.entries(destinationStats)
        .sort(([, a], [, b]) => b.engagements - a.engagements)[0]?.[0] || null;

    // Update growth_metrics
    await sql`
    INSERT INTO growth_metrics (
      date,
      follower_count,
      total_posts,
      total_likes,
      total_retweets,
      total_replies,
      total_impressions,
      engagement_rate,
      avg_impressions_per_post,
      posts_with_engagement,
      top_destination
    ) VALUES (
      ${today},
      ${followerCount || 0},
      ${posts.length},
      ${totalLikes},
      ${totalRetweets},
      ${totalReplies},
      ${totalImpressions},
      ${engagementRate.toFixed(2)},
      ${avgImpressionsPerPost.toFixed(2)},
      ${postsWithEngagement},
      ${topDestination}
    )
    ON CONFLICT (date) DO UPDATE SET
      follower_count = EXCLUDED.follower_count,
      total_posts = EXCLUDED.total_posts,
      total_likes = EXCLUDED.total_likes,
      total_retweets = EXCLUDED.total_retweets,
      total_replies = EXCLUDED.total_replies,
      total_impressions = EXCLUDED.total_impressions,
      engagement_rate = EXCLUDED.engagement_rate,
      avg_impressions_per_post = EXCLUDED.avg_impressions_per_post,
      posts_with_engagement = EXCLUDED.posts_with_engagement,
      top_destination = EXCLUDED.top_destination,
      updated_at = NOW()
  `;

    console.log("✅ Updated growth_metrics");

    // Update destination_performance
    for (const [destination, stats] of Object.entries(destinationStats)) {
        const avgEngagement = stats.posts > 0 ? stats.engagements / stats.posts : 0;

        await sql`
      INSERT INTO destination_performance (
        destination,
        total_posts,
        total_engagements,
        avg_engagement,
        total_impressions,
        last_posted_at
      ) VALUES (
        ${destination},
        ${stats.posts},
        ${stats.engagements},
        ${avgEngagement.toFixed(2)},
        ${stats.impressions},
        NOW()
      )
      ON CONFLICT (destination) DO UPDATE SET
        total_posts = EXCLUDED.total_posts,
        total_engagements = EXCLUDED.total_engagements,
        avg_engagement = EXCLUDED.avg_engagement,
        total_impressions = EXCLUDED.total_impressions,
        last_posted_at = EXCLUDED.last_posted_at,
        updated_at = NOW()
    `;
    }

    console.log("✅ Updated destination_performance");

    // Print summary
    console.log("\n📊 Today's Metrics:");
    console.log("─────────────────────────────────────────");
    console.log(`Date: ${today}`);
    console.log(`Followers: ${followerCount || 'Not tracked'}`);
    console.log(`Total Posts: ${posts.length}`);
    console.log(`Engagement Rate: ${engagementRate.toFixed(2)}%`);
    console.log(`Avg Impressions/Post: ${avgImpressionsPerPost.toFixed(1)}`);
    console.log(`Top Destination: ${topDestination || 'N/A'}`);
    console.log();

    console.log("✅ Metrics updated successfully!\n");
}

// Get follower count from command line argument
const followerCount = process.argv[2] ? parseInt(process.argv[2]) : undefined;

if (followerCount) {
    console.log(`📈 Tracking ${followerCount} followers\n`);
}

updateGrowthMetrics(followerCount).catch(console.error);
