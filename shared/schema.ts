import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, index, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  tier: varchar("tier").default("free"), // free, pro, byok
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  tierExpiresAt: timestamp("tier_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserTier = "free" | "pro" | "byok";

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  platforms: jsonb("platforms").notNull().$type<string[]>(),
  template: text("template"),
  status: text("status").notNull().default("draft"), // draft, published, failed, scheduled
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  platformData: jsonb("platform_data").$type<Record<string, any>>(),
  campaignId: integer("campaign_id"),
  mediaUrl: text("media_url"), // Legacy: single URL (kept for backwards compatibility)
  mediaUrls: jsonb("media_urls").$type<string[]>(), // Array of media URLs (up to 4 for Twitter)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const platformConnections = pgTable("platform_connections", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(), // twitter, discord, reddit
  isConnected: boolean("is_connected").notNull().default(false),
  credentials: jsonb("credentials").$type<Record<string, any>>(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const postAnalytics = pgTable("post_analytics", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => posts.id).notNull(),
  platform: text("platform").notNull(),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  views: integer("views").default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"), // draft, active, paused, completed
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  targetPlatforms: jsonb("target_platforms").notNull().$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const campaignPosts = pgTable("campaign_posts", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id).notNull(),
  postId: integer("post_id").references(() => posts.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contentMoodTracking = pgTable("content_mood_tracking", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => posts.id).notNull(),
  mood: text("mood").notNull(), // happy, excited, professional, casual, urgent, etc.
  emoji: text("emoji"),
  performanceScore: integer("performance_score"), // 1-100 based on engagement
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contentRecycling = pgTable("content_recycling", {
  id: serial("id").primaryKey(),
  originalPostId: integer("original_post_id").references(() => posts.id).notNull(),
  recycledPostId: integer("recycled_post_id").references(() => posts.id).notNull(),
  recycleType: text("recycle_type").notNull(), // repost, remix, update
  optimalTimingData: jsonb("optimal_timing_data").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Keyword monitoring for finding posts to reply to
export const keywordMonitoring = pgTable("keyword_monitoring", {
  id: serial("id").primaryKey(),
  keyword: varchar("keyword", { length: 255 }).notNull(),
  platforms: text("platforms").notNull(), // JSON array of platforms to monitor
  isActive: boolean("is_active").default(true),
  replyTemplate: text("reply_template"), // Template for automated replies
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Found posts that match keywords
export const foundPosts = pgTable("found_posts", {
  id: serial("id").primaryKey(),
  keywordId: integer("keyword_id").references(() => keywordMonitoring.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(),
  platformPostId: varchar("platform_post_id").notNull(), // ID from the platform
  author: varchar("author").notNull(),
  content: text("content").notNull(),
  url: varchar("url"),
  foundAt: timestamp("found_at").defaultNow(),
  repliedAt: timestamp("replied_at"),
  replyPostId: varchar("reply_post_id"), // ID of our reply post
  status: varchar("status", { length: 50 }).default("found"), // found, replied, ignored
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const draftStatusEnum = pgEnum("draft_status", [
  "pending_review",
  "approved",
  "rejected",
  "published",
  "failed",
  "pending_retry"
]);

export const postcardDrafts = pgTable("postcard_drafts", {
  id: serial("id").primaryKey(),

  // Campaign Type (turai = travel, logicart = coding)
  campaignType: text("campaign_type").default("turai"),
  
  // Strategy (for logicart campaign - vibe_scout, spaghetti_detective, bug_hunter, arena_referee)
  strategy: text("strategy"),

  // Origin Data (The User's Tweet)
  originalTweetId: text("original_tweet_id").notNull().unique(),
  originalAuthorHandle: text("original_author_handle").notNull(),
  originalTweetText: text("original_tweet_text").notNull(),
  detectedLocation: text("detected_location"), // e.g., "Kyoto, Japan"

  // The Asset (Generated by Turai)
  turaiImageUrl: text("turai_image_url"),
  imageAttribution: text("image_attribution"), // "Photo by X on Unsplash"

  // The Draft Content
  draftReplyText: text("draft_reply_text"),
  
  // Action Type - determines how the draft is published
  actionType: text("action_type").default("reply"), // reply or quote_tweet

  // Arena Referee specific data (for quote tweets)
  arenaVerdict: jsonb("arena_verdict").$type<{
    winner: string;
    reasoning: string;
    responses?: Array<{ model: string; response: string; responseTime: number }>;
  }>(),

  // Targeting
  targetCommunityId: text("target_community_id"), // Null = Main Timeline

  // Metadata
  status: draftStatusEnum("status").default("pending_review").notNull(),
  score: integer("score").default(0), // AI Relevance Score (0-100)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),

  // Published tweet data (our reply)
  tweetId: text("tweet_id"), // ID of our published reply tweet
  
  // Analytics (synced from Twitter API)
  likes: integer("likes").default(0),
  retweets: integer("retweets").default(0),
  replies: integer("replies").default(0),
  impressions: integer("impressions").default(0),

  // Retry mechanism for failed posts
  publishAttempts: integer("publish_attempts").default(0),
  lastError: text("last_error"),
});

export const insertPostSchema = createInsertSchema(posts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
});

export const insertPlatformConnectionSchema = createInsertSchema(platformConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPostAnalyticsSchema = createInsertSchema(postAnalytics).omit({
  id: true,
  updatedAt: true,
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true, // Add userId after validation in the route
});

export const insertCampaignPostSchema = createInsertSchema(campaignPosts).omit({
  id: true,
  createdAt: true,
});

export const insertContentMoodTrackingSchema = createInsertSchema(contentMoodTracking).omit({
  id: true,
  createdAt: true,
});

export const insertContentRecyclingSchema = createInsertSchema(contentRecycling).omit({
  id: true,
  createdAt: true,
});

export const insertKeywordMonitoringSchema = createInsertSchema(keywordMonitoring).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
});

export const insertFoundPostSchema = createInsertSchema(foundPosts).omit({
  id: true,
  createdAt: true,
  userId: true,
});

export const insertPostcardDraftSchema = createInsertSchema(postcardDrafts).omit({
  id: true,
  createdAt: true,
});

// User schema for authentication
export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;
export type InsertPlatformConnection = z.infer<typeof insertPlatformConnectionSchema>;
export type PlatformConnection = typeof platformConnections.$inferSelect;
export type InsertPostAnalytics = z.infer<typeof insertPostAnalyticsSchema>;
export type PostAnalytics = typeof postAnalytics.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaignPost = z.infer<typeof insertCampaignPostSchema>;
export type CampaignPost = typeof campaignPosts.$inferSelect;
export type InsertContentMoodTracking = z.infer<typeof insertContentMoodTrackingSchema>;
export type ContentMoodTracking = typeof contentMoodTracking.$inferSelect;
export type InsertContentRecycling = z.infer<typeof insertContentRecyclingSchema>;
export type ContentRecycling = typeof contentRecycling.$inferSelect;
export type InsertKeywordMonitoring = z.infer<typeof insertKeywordMonitoringSchema>;
export type KeywordMonitoring = typeof keywordMonitoring.$inferSelect;
export type InsertFoundPost = z.infer<typeof insertFoundPostSchema>;
export type FoundPost = typeof foundPosts.$inferSelect;

export const PostTemplate = z.enum(["announcement", "tip", "question", "share", "custom"]);
export type PostTemplate = z.infer<typeof PostTemplate>;

export const Platform = z.enum(["twitter", "discord", "reddit"]);
export type Platform = z.infer<typeof Platform>;

export const PostStatus = z.enum(["draft", "published", "failed", "scheduled"]);
export type PostStatus = z.infer<typeof PostStatus>;

export type InsertPostcardDraft = z.infer<typeof insertPostcardDraftSchema>;
export type PostcardDraft = typeof postcardDrafts.$inferSelect;

export const PostcardDraftStatus = z.enum(["pending_review", "approved", "rejected", "published", "failed", "pending_retry"]);
export type PostcardDraftStatus = z.infer<typeof PostcardDraftStatus>;

// Arena Referee specific types
export interface ArenaVerdict {
  winner: string;
  reasoning: string;
  responses?: Array<{ model: string; response: string; responseTime: number }>;
}

export const ActionType = z.enum(["reply", "quote_tweet"]);
export type ActionType = z.infer<typeof ActionType>;

// Re-export chat models for Gemini integration
export * from "./models/chat";
