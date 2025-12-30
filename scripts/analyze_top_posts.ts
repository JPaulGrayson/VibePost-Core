/**
 * Analyze Top Performing Posts
 * Identifies patterns in high-engagement content
 */

import 'dotenv/config';
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function analyzeTopPosts() {
    console.log("🔍 Analyzing Top Performing Posts...\n");
    console.log("═══════════════════════════════════════════\n");

    // Get all posts with engagement
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

    // Calculate engagement for each post
    const postsWithEngagement = posts
        .map((post: any) => {
            const twitter = post.platform_data?.twitter;
            if (!twitter) return null;

            const likes = twitter.likes || 0;
            const retweets = twitter.retweets || 0;
            const replies = twitter.replies || 0;
            const totalEngagement = likes + retweets + replies;

            return {
                id: post.id,
                content: post.content,
                createdAt: post.created_at,
                likes,
                retweets,
                replies,
                totalEngagement,
                impressions: twitter.impressions || 0,
                engagementRate: twitter.impressions ? (totalEngagement / twitter.impressions) * 100 : 0,
            };
        })
        .filter(p => p && p.totalEngagement > 0)
        .sort((a, b) => b!.totalEngagement - a!.totalEngagement);

    console.log(`📊 Found ${postsWithEngagement.length} posts with engagement\n`);

    // Top 10 posts
    console.log("🏆 TOP 10 PERFORMING POSTS");
    console.log("─────────────────────────────────────────\n");

    const top10 = postsWithEngagement.slice(0, 10);
    top10.forEach((post, idx) => {
        console.log(`${idx + 1}. Post #${post!.id} - ${post!.totalEngagement} engagements`);
        console.log(`   Likes: ${post!.likes} | Retweets: ${post!.retweets} | Replies: ${post!.replies}`);
        console.log(`   Content: ${post!.content.substring(0, 80)}...`);
        console.log();
    });

    // Pattern Analysis
    console.log("\n📈 PATTERN ANALYSIS");
    console.log("─────────────────────────────────────────\n");

    // 1. Emoji analysis
    const emojiPatterns = {
        '🔮': { count: 0, totalEng: 0 },
        '✨': { count: 0, totalEng: 0 },
        '🗺️': { count: 0, totalEng: 0 },
        '🌟': { count: 0, totalEng: 0 },
        '🇲🇽': { count: 0, totalEng: 0 },
        '🇪🇸': { count: 0, totalEng: 0 },
    };

    postsWithEngagement.forEach(post => {
        Object.keys(emojiPatterns).forEach(emoji => {
            if (post!.content.includes(emoji)) {
                emojiPatterns[emoji as keyof typeof emojiPatterns].count++;
                emojiPatterns[emoji as keyof typeof emojiPatterns].totalEng += post!.totalEngagement;
            }
        });
    });

    console.log("🎨 Emoji Performance:");
    Object.entries(emojiPatterns)
        .filter(([, data]) => data.count > 0)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))
        .forEach(([emoji, data]) => {
            const avgEng = data.count > 0 ? data.totalEng / data.count : 0;
            console.log(`   ${emoji} - Used ${data.count} times, Avg: ${avgEng.toFixed(2)} engagements`);
        });

    // 2. Keyword analysis
    console.log("\n🔑 Keyword Performance:");
    const keywords = ['crystal ball', 'mystical', 'whimsical', 'quest', 'stars', 'winds', 'magic'];
    const keywordStats: Record<string, { count: number; totalEng: number }> = {};

    keywords.forEach(keyword => {
        keywordStats[keyword] = { count: 0, totalEng: 0 };
        postsWithEngagement.forEach(post => {
            if (post!.content.toLowerCase().includes(keyword)) {
                keywordStats[keyword].count++;
                keywordStats[keyword].totalEng += post!.totalEngagement;
            }
        });
    });

    Object.entries(keywordStats)
        .filter(([, data]) => data.count > 0)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))
        .forEach(([keyword, data]) => {
            const avgEng = data.count > 0 ? data.totalEng / data.count : 0;
            console.log(`   "${keyword}" - Used ${data.count} times, Avg: ${avgEng.toFixed(2)} engagements`);
        });

    // 3. Destination analysis
    console.log("\n🌍 Destination Performance:");
    const destinations: Record<string, { count: number; totalEng: number; posts: number[] }> = {};

    postsWithEngagement.forEach(post => {
        const destMatch = post!.content.match(/(?:to|in|over|through)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (destMatch) {
            const dest = destMatch[1];
            if (!destinations[dest]) {
                destinations[dest] = { count: 0, totalEng: 0, posts: [] };
            }
            destinations[dest].count++;
            destinations[dest].totalEng += post!.totalEngagement;
            destinations[dest].posts.push(post!.id);
        }
    });

    Object.entries(destinations)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))
        .slice(0, 10)
        .forEach(([dest, data]) => {
            const avgEng = data.count > 0 ? data.totalEng / data.count : 0;
            console.log(`   ${dest} - ${data.count} posts, Avg: ${avgEng.toFixed(2)} engagements, Total: ${data.totalEng}`);
        });

    // 4. Length analysis
    console.log("\n📏 Content Length Analysis:");
    const lengthBuckets = {
        'Short (<100 chars)': { count: 0, totalEng: 0 },
        'Medium (100-150)': { count: 0, totalEng: 0 },
        'Long (>150 chars)': { count: 0, totalEng: 0 },
    };

    postsWithEngagement.forEach(post => {
        const len = post!.content.length;
        if (len < 100) {
            lengthBuckets['Short (<100 chars)'].count++;
            lengthBuckets['Short (<100 chars)'].totalEng += post!.totalEngagement;
        } else if (len < 150) {
            lengthBuckets['Medium (100-150)'].count++;
            lengthBuckets['Medium (100-150)'].totalEng += post!.totalEngagement;
        } else {
            lengthBuckets['Long (>150 chars)'].count++;
            lengthBuckets['Long (>150 chars)'].totalEng += post!.totalEngagement;
        }
    });

    Object.entries(lengthBuckets).forEach(([bucket, data]) => {
        const avgEng = data.count > 0 ? data.totalEng / data.count : 0;
        console.log(`   ${bucket} - ${data.count} posts, Avg: ${avgEng.toFixed(2)} engagements`);
    });

    // 5. Time of day analysis
    console.log("\n⏰ Best Posting Times (CST):");
    const hourlyStats: Record<number, { count: number; totalEng: number }> = {};

    postsWithEngagement.forEach(post => {
        const hour = new Date(post!.createdAt).getHours();
        if (!hourlyStats[hour]) {
            hourlyStats[hour] = { count: 0, totalEng: 0 };
        }
        hourlyStats[hour].count++;
        hourlyStats[hour].totalEng += post!.totalEngagement;
    });

    Object.entries(hourlyStats)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))
        .slice(0, 5)
        .forEach(([hour, data]) => {
            const avgEng = data.count > 0 ? data.totalEng / data.count : 0;
            console.log(`   ${hour}:00 - ${data.count} posts, Avg: ${avgEng.toFixed(2)} engagements`);
        });

    // Recommendations
    console.log("\n\n💡 KEY INSIGHTS & RECOMMENDATIONS");
    console.log("─────────────────────────────────────────\n");

    const topDestination = Object.entries(destinations)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

    const topEmoji = Object.entries(emojiPatterns)
        .filter(([, data]) => data.count > 0)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

    const topKeyword = Object.entries(keywordStats)
        .filter(([, data]) => data.count > 0)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

    const topHour = Object.entries(hourlyStats)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

    console.log(`1. 🌍 Focus on ${topDestination?.[0] || 'top destinations'}`);
    console.log(`   - Avg ${(topDestination?.[1].totalEng / topDestination?.[1].count || 0).toFixed(2)} engagements per post`);
    console.log();

    console.log(`2. 🎨 Use ${topEmoji?.[0] || 'emojis'} more often`);
    console.log(`   - Avg ${(topEmoji?.[1].totalEng / topEmoji?.[1].count || 0).toFixed(2)} engagements when used`);
    console.log();

    console.log(`3. 🔑 Incorporate "${topKeyword?.[0] || 'keywords'}" in content`);
    console.log(`   - Avg ${(topKeyword?.[1].totalEng / topKeyword?.[1].count || 0).toFixed(2)} engagements when used`);
    console.log();

    console.log(`4. ⏰ Post around ${topHour?.[0] || 'peak times'}:00 CST`);
    console.log(`   - Avg ${(topHour?.[1].totalEng / topHour?.[1].count || 0).toFixed(2)} engagements at this hour`);
    console.log();

    const bestLength = Object.entries(lengthBuckets)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

    console.log(`5. 📏 Optimal length: ${bestLength?.[0]}`);
    console.log(`   - Avg ${(bestLength?.[1].totalEng / bestLength?.[1].count || 0).toFixed(2)} engagements`);

    console.log("\n✅ Analysis Complete!\n");
}

analyzeTopPosts().catch(console.error);
