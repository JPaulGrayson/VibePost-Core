/**
 * Follower Growth Tracker
 * Tracks Twitter follower growth, engagement trends, and monetization metrics
 */

import 'dotenv/config';
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function setupGrowthTracking() {
    console.log("🚀 Setting up Follower Growth Tracking...\n");

    // Create growth_metrics table
    await sql`
    CREATE TABLE IF NOT EXISTS growth_metrics (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      follower_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      total_posts INTEGER DEFAULT 0,
      total_likes INTEGER DEFAULT 0,
      total_retweets INTEGER DEFAULT 0,
      total_replies INTEGER DEFAULT 0,
      total_impressions INTEGER DEFAULT 0,
      engagement_rate DECIMAL(5,2) DEFAULT 0,
      avg_impressions_per_post DECIMAL(10,2) DEFAULT 0,
      posts_with_engagement INTEGER DEFAULT 0,
      top_destination VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

    console.log("✅ Created growth_metrics table");

    // Create destination_performance table
    await sql`
    CREATE TABLE IF NOT EXISTS destination_performance (
      id SERIAL PRIMARY KEY,
      destination VARCHAR(255) NOT NULL,
      total_posts INTEGER DEFAULT 0,
      total_engagements INTEGER DEFAULT 0,
      avg_engagement DECIMAL(10,2) DEFAULT 0,
      total_impressions INTEGER DEFAULT 0,
      last_posted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(destination)
    )
  `;

    console.log("✅ Created destination_performance table");

    // Create revenue_tracking table
    await sql`
    CREATE TABLE IF NOT EXISTS revenue_tracking (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      revenue_type VARCHAR(50) NOT NULL,
      partner_name VARCHAR(255),
      amount DECIMAL(10,2) DEFAULT 0,
      post_id INTEGER REFERENCES posts(id),
      conversion_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

    console.log("✅ Created revenue_tracking table");

    // Create sponsor_pipeline table
    await sql`
    CREATE TABLE IF NOT EXISTS sponsor_pipeline (
      id SERIAL PRIMARY KEY,
      company_name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255),
      contact_email VARCHAR(255),
      sponsor_tier VARCHAR(50),
      status VARCHAR(50) DEFAULT 'prospect',
      proposed_budget DECIMAL(10,2),
      deal_value DECIMAL(10,2),
      start_date DATE,
      end_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

    console.log("✅ Created sponsor_pipeline table");

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_growth_date ON growth_metrics(date DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_destination_perf ON destination_performance(avg_engagement DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_tracking(date DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sponsor_status ON sponsor_pipeline(status)`;

    console.log("✅ Created indexes");

    // Insert initial baseline
    const today = new Date().toISOString().split('T')[0];

    await sql`
    INSERT INTO growth_metrics (
      date,
      total_posts,
      total_likes,
      total_retweets,
      total_replies,
      total_impressions,
      engagement_rate,
      avg_impressions_per_post,
      posts_with_engagement,
      notes
    ) VALUES (
      ${today},
      939,
      73,
      13,
      13,
      35549,
      6.92,
      37.9,
      65,
      'Baseline metrics - Dec 29, 2025'
    )
    ON CONFLICT (date) DO UPDATE SET
      total_posts = EXCLUDED.total_posts,
      total_likes = EXCLUDED.total_likes,
      total_retweets = EXCLUDED.total_retweets,
      total_replies = EXCLUDED.total_replies,
      total_impressions = EXCLUDED.total_impressions,
      engagement_rate = EXCLUDED.engagement_rate,
      avg_impressions_per_post = EXCLUDED.avg_impressions_per_post,
      posts_with_engagement = EXCLUDED.posts_with_engagement,
      updated_at = NOW()
  `;

    console.log("✅ Inserted baseline metrics");

    console.log("\n✅ Growth tracking setup complete!\n");
    console.log("📊 Next steps:");
    console.log("1. Run: npx tsx scripts/update_growth_metrics.ts (daily)");
    console.log("2. Run: npx tsx scripts/growth_report.ts (weekly)");
    console.log("3. Track followers manually or via Twitter API\n");
}

setupGrowthTracking().catch(console.error);
