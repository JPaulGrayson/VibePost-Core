/**
 * Analyze Drafts by Score Threshold
 * Since scores are in postcard_drafts, analyze those instead
 */

import 'dotenv/config';
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function analyzeDraftsByScore() {
    console.log("📊 Analyzing Drafts by Score Threshold\n");
    console.log("═══════════════════════════════════════════\n");

    // Get all drafts with scores
    const drafts = await sql`
    SELECT 
      id,
      score,
      status,
      original_tweet_id,
      created_at,
      published_at
    FROM postcard_drafts
    WHERE score IS NOT NULL
    ORDER BY created_at DESC
  `;

    console.log(`Total drafts with scores: ${drafts.length}\n`);

    // Analyze by score thresholds
    const thresholds = [95, 90, 85, 80, 75, 70, 65, 60];
    const results: Record<number, {
        totalDrafts: number;
        published: number;
        publishRate: number;
        pending: number;
        rejected: number;
    }> = {};

    for (const threshold of thresholds) {
        const filtered = drafts.filter((d: any) => d.score >= threshold);

        const published = filtered.filter((d: any) => d.status === 'published').length;
        const pending = filtered.filter((d: any) => d.status === 'pending_review').length;
        const rejected = filtered.filter((d: any) => d.status === 'rejected').length;

        results[threshold] = {
            totalDrafts: filtered.length,
            published,
            publishRate: filtered.length > 0 ? (published / filtered.length) * 100 : 0,
            pending,
            rejected,
        };
    }

    // Display results
    console.log("📈 DRAFT STATISTICS BY SCORE THRESHOLD");
    console.log("─────────────────────────────────────────\n");

    console.log("Score | Total | Published | Pub Rate | Pending | Rejected");
    console.log("───────────────────────────────────────────────────────────");

    for (const threshold of thresholds) {
        const r = results[threshold];
        console.log(
            `≥${threshold}%  | ${r.totalDrafts.toString().padEnd(5)} | ${r.published.toString().padEnd(9)} | ${r.publishRate.toFixed(1)}%${r.publishRate < 10 ? '    ' : r.publishRate < 100 ? '   ' : '  '} | ${r.pending.toString().padEnd(7)} | ${r.rejected}`
        );
    }

    console.log("\n");

    // Score distribution
    console.log("📊 SCORE DISTRIBUTION");
    console.log("─────────────────────────────────────────\n");

    const scoreRanges = {
        '95-100': { count: 0, published: 0 },
        '90-94': { count: 0, published: 0 },
        '85-89': { count: 0, published: 0 },
        '80-84': { count: 0, published: 0 },
        '75-79': { count: 0, published: 0 },
        '70-74': { count: 0, published: 0 },
        '65-69': { count: 0, published: 0 },
        '60-64': { count: 0, published: 0 },
        '<60': { count: 0, published: 0 },
    };

    drafts.forEach((d: any) => {
        const score = d.score;
        const isPublished = d.status === 'published';

        if (score >= 95) {
            scoreRanges['95-100'].count++;
            if (isPublished) scoreRanges['95-100'].published++;
        } else if (score >= 90) {
            scoreRanges['90-94'].count++;
            if (isPublished) scoreRanges['90-94'].published++;
        } else if (score >= 85) {
            scoreRanges['85-89'].count++;
            if (isPublished) scoreRanges['85-89'].published++;
        } else if (score >= 80) {
            scoreRanges['80-84'].count++;
            if (isPublished) scoreRanges['80-84'].published++;
        } else if (score >= 75) {
            scoreRanges['75-79'].count++;
            if (isPublished) scoreRanges['75-79'].published++;
        } else if (score >= 70) {
            scoreRanges['70-74'].count++;
            if (isPublished) scoreRanges['70-74'].published++;
        } else if (score >= 65) {
            scoreRanges['65-69'].count++;
            if (isPublished) scoreRanges['65-69'].published++;
        } else if (score >= 60) {
            scoreRanges['60-64'].count++;
            if (isPublished) scoreRanges['60-64'].published++;
        } else {
            scoreRanges['<60'].count++;
            if (isPublished) scoreRanges['<60'].published++;
        }
    });

    console.log("Range   | Drafts | Published | Pub Rate");
    console.log("────────────────────────────────────────────");
    Object.entries(scoreRanges).forEach(([range, data]) => {
        const pubRate = data.count > 0 ? (data.published / data.count) * 100 : 0;
        console.log(`${range.padEnd(7)} | ${data.count.toString().padEnd(6)} | ${data.published.toString().padEnd(9)} | ${pubRate.toFixed(1)}%`);
    });

    console.log("\n");

    // Impact analysis
    console.log("💡 IMPACT OF CHANGING THRESHOLD FROM ≥80% TO ≥90%");
    console.log("─────────────────────────────────────────\n");

    const current80 = results[80];
    const proposed90 = results[90];

    const draftsLost = current80.totalDrafts - proposed90.totalDrafts;
    const publishedLost = current80.published - proposed90.published;
    const percentDraftsLost = (draftsLost / current80.totalDrafts) * 100;
    const percentPublishedLost = current80.published > 0 ? (publishedLost / current80.published) * 100 : 0;

    console.log(`Current (≥80%):`);
    console.log(`  Total Drafts: ${current80.totalDrafts}`);
    console.log(`  Published: ${current80.published}`);
    console.log(`  Publish Rate: ${current80.publishRate.toFixed(1)}%`);
    console.log(`  Pending: ${current80.pending}`);
    console.log();

    console.log(`Proposed (≥90%):`);
    console.log(`  Total Drafts: ${proposed90.totalDrafts}`);
    console.log(`  Published: ${proposed90.published}`);
    console.log(`  Publish Rate: ${proposed90.publishRate.toFixed(1)}%`);
    console.log(`  Pending: ${proposed90.pending}`);
    console.log();

    console.log(`Change:`);
    console.log(`  Drafts Lost: ${draftsLost} (-${percentDraftsLost.toFixed(1)}%)`);
    console.log(`  Published Posts Lost: ${publishedLost} (-${percentPublishedLost.toFixed(1)}%)`);
    console.log(`  Publish Rate Change: ${(proposed90.publishRate - current80.publishRate).toFixed(1)}%`);

    // Recommendation
    console.log("\n\n🎯 RECOMMENDATION");
    console.log("─────────────────────────────────────────\n");

    if (proposed90.publishRate > current80.publishRate && proposed90.totalDrafts > 100) {
        console.log("✅ RECOMMEND: Switch to ≥90% threshold");
        console.log(`   - Higher publish rate (${proposed90.publishRate.toFixed(1)}% vs ${current80.publishRate.toFixed(1)}%)`);
        console.log(`   - Still have ${proposed90.totalDrafts} drafts to work with`);
        console.log(`   - Better quality over quantity`);
        console.log(`   - You'd lose ${percentDraftsLost.toFixed(1)}% of drafts but gain quality`);
    } else if (proposed90.totalDrafts < 50) {
        console.log("❌ DON'T RECOMMEND: Keep ≥80% threshold");
        console.log(`   - Too few drafts at ≥90% (only ${proposed90.totalDrafts})`);
        console.log(`   - Need more volume to maintain posting cadence`);
        console.log(`   - Current threshold provides good balance`);
    } else {
        console.log("⚖️  CONSIDER: Test ≥90% threshold for 1 week");
        console.log(`   - Publish rate similar (${proposed90.publishRate.toFixed(1)}% vs ${current80.publishRate.toFixed(1)}%)`);
        console.log(`   - ${proposed90.totalDrafts} drafts available`);
        console.log(`   - Monitor engagement rates to see if quality improves`);
    }

    console.log("\n✅ Analysis Complete!\n");
}

analyzeDraftsByScore().catch(console.error);
