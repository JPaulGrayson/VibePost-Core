/**
 * Simple Growth Report
 * Shows current metrics and top destinations
 */

import 'dotenv/config';
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function simpleGrowthReport() {
    console.log("📊 VibePost Growth Report\n");
    console.log("═══════════════════════════════════════════\n");

    // Get latest metrics
    const [latest] = await sql`
    SELECT * FROM growth_metrics
    ORDER BY date DESC
    LIMIT 1
  `;

    if (!latest) {
        console.log("⚠️  No metrics found. Run: npx tsx scripts/update_growth_metrics.ts\n");
        return;
    }

    console.log("📊 CURRENT PERFORMANCE");
    console.log("─────────────────────────────────────────");
    console.log(`Date: ${latest.date}`);
    console.log(`Followers: ${latest.follower_count || 'Not tracked'}`);
    console.log(`Total Posts: ${latest.total_posts}`);
    console.log(`Engagement Rate: ${latest.engagement_rate}%`);
    console.log(`Avg Impressions/Post: ${latest.avg_impressions_per_post}`);
    console.log(`Posts with Engagement: ${latest.posts_with_engagement}`);
    console.log(`Top Destination: ${latest.top_destination || 'N/A'}`);
    console.log();

    // Get top destinations
    const destinations = await sql`
    SELECT * FROM destination_performance
    ORDER BY avg_engagement DESC
    LIMIT 10
  `;

    if (destinations.length > 0) {
        console.log("\n🌍 TOP 10 DESTINATIONS");
        console.log("─────────────────────────────────────────");
        destinations.forEach((dest: any, idx: number) => {
            console.log(`${idx + 1}. ${dest.destination}`);
            console.log(`   Posts: ${dest.total_posts} | Avg Engagement: ${dest.avg_engagement} | Total: ${dest.total_engagements}`);
        });
    }

    // Milestones
    console.log("\n\n🎯 MILESTONE PROGRESS");
    console.log("─────────────────────────────────────────");

    const milestones = [
        { name: "1,000 posts", target: 1000, current: latest.total_posts },
        { name: "5,000 followers", target: 5000, current: latest.follower_count || 0 },
        { name: "10% engagement", target: 10, current: parseFloat(latest.engagement_rate) },
        { name: "100 impressions/post", target: 100, current: parseFloat(latest.avg_impressions_per_post) },
    ];

    milestones.forEach(milestone => {
        const progress = (milestone.current / milestone.target) * 100;
        const status = progress >= 100 ? '✅' : progress >= 75 ? '🟡' : '⏳';
        console.log(`${status} ${milestone.name}: ${milestone.current.toFixed(0)}/${milestone.target} (${Math.min(progress, 100).toFixed(1)}%)`);
    });

    // Recommendations
    console.log("\n\n💡 RECOMMENDATIONS");
    console.log("─────────────────────────────────────────");

    const recommendations = [];

    if (parseFloat(latest.engagement_rate) < 8) {
        recommendations.push("📈 Engagement rate below 8% - test different content formats");
    }

    if (parseFloat(latest.avg_impressions_per_post) < 100) {
        recommendations.push("📢 Low impressions - try posting at peak times or using hashtags");
    }

    if (destinations.length > 0) {
        recommendations.push(`🌍 Focus on ${destinations[0].destination} - your top performing destination`);
    }

    if (latest.total_posts >= 1000) {
        recommendations.push("💰 Ready for monetization - set up affiliate links");
    }

    if (recommendations.length === 0) {
        recommendations.push("✅ Great work! Keep up the momentum!");
    }

    recommendations.forEach((rec, idx) => {
        console.log(`${idx + 1}. ${rec}`);
    });

    console.log("\n✅ Report Complete!\n");
}

simpleGrowthReport().catch(console.error);
