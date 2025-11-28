import {
  posts,
  platformConnections,
  postAnalytics,
  campaigns,
  campaignPosts,
  contentMoodTracking,
  contentRecycling,
  users,
  keywordMonitoring,
  foundPosts,
  type Post,
  type InsertPost,
  type PlatformConnection,
  type InsertPlatformConnection,
  type PostAnalytics,
  type InsertPostAnalytics,
  type Campaign,
  type InsertCampaign,
  type KeywordMonitoring,
  type InsertKeywordMonitoring,
  type FoundPost,
  type InsertFoundPost,
  type PostcardDraft,
  type InsertPostcardDraft,
  type Platform,
  type PostStatus,
  type User,
  type UpsertUser
} from "@shared/schema";
import { postcardDrafts } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Posts
  getPosts(): Promise<Post[]>;
  getPost(id: number): Promise<Post | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: number, updates: Partial<InsertPost>): Promise<Post | undefined>;
  deletePost(id: number): Promise<boolean>;
  getPostsByStatus(status: PostStatus): Promise<Post[]>;

  // Platform Connections
  getPlatformConnections(): Promise<PlatformConnection[]>;
  getPlatformConnection(platform: Platform): Promise<PlatformConnection | undefined>;
  createPlatformConnection(connection: InsertPlatformConnection): Promise<PlatformConnection>;
  updatePlatformConnection(platform: Platform, updates: Partial<InsertPlatformConnection>): Promise<PlatformConnection | undefined>;

  // Analytics
  getPostAnalytics(postId: number): Promise<PostAnalytics[]>;
  createPostAnalytics(analytics: InsertPostAnalytics): Promise<PostAnalytics>;
  updatePostAnalytics(id: number, updates: Partial<InsertPostAnalytics>): Promise<PostAnalytics | undefined>;

  // Campaigns
  getCampaigns(): Promise<Campaign[]>;
  getCampaign(id: number): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: number, updates: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: number): Promise<boolean>;

  // Keyword Monitoring
  getKeywordMonitoring(): Promise<KeywordMonitoring[]>;
  getKeywordMonitoring(id: number): Promise<KeywordMonitoring | undefined>;
  createKeywordMonitoring(keyword: InsertKeywordMonitoring): Promise<KeywordMonitoring>;
  updateKeywordMonitoring(id: number, updates: Partial<InsertKeywordMonitoring>): Promise<KeywordMonitoring | undefined>;
  deleteKeywordMonitoring(id: number): Promise<boolean>;

  // Found Posts
  getFoundPosts(keywordId?: number): Promise<FoundPost[]>;
  createFoundPost(foundPost: InsertFoundPost): Promise<FoundPost>;
  updateFoundPost(id: number, updates: Partial<InsertFoundPost>): Promise<FoundPost | undefined>;

  // Postcard Drafts
  getPostcardDrafts(): Promise<PostcardDraft[]>;
  getPostcardDraft(id: number): Promise<PostcardDraft | undefined>;
  updatePostcardDraft(id: number, updates: Partial<InsertPostcardDraft>): Promise<PostcardDraft | undefined>;
}

export class MemStorage implements IStorage {
  private posts: Map<number, Post>;
  private platformConnections: Map<string, PlatformConnection>;
  private postAnalytics: Map<number, PostAnalytics>;
  private currentPostId: number;
  private currentConnectionId: number;
  private currentAnalyticsId: number;
  private keywordMonitoring: Map<number, KeywordMonitoring>;
  private foundPosts: Map<number, FoundPost>;
  private currentKeywordId: number;
  private currentFoundPostId: number;
  private postcardDrafts: Map<number, PostcardDraft>;
  private currentPostcardDraftId: number;

  constructor() {
    this.posts = new Map();
    this.platformConnections = new Map();
    this.postAnalytics = new Map();
    this.currentPostId = 1;
    this.currentConnectionId = 1;
    this.currentAnalyticsId = 1;
    this.postcardDrafts = new Map();
    this.currentPostcardDraftId = 1;

    // Initialize with default platform connections
    this.initializePlatformConnections();
  }

  private initializePlatformConnections() {
    const platforms: Platform[] = ["twitter", "discord", "reddit"];
    platforms.forEach(platform => {
      let isConnected = false;
      let credentials = {};

      // Set up platforms as connected with their credentials
      if (platform === "twitter") {
        isConnected = true;
        // Twitter credentials will be set from environment variables in the routes
      } else if (platform === "discord") {
        isConnected = true;
        credentials = {
          webhookUrl: "https://discord.com/api/webhooks/1226299025896828928/z_RWlBKC7yJlvj5e9IjxS2xdD5_xEKZWjZPmkX5LdI4ZwHAR4YY0SDhCGBOL5I12nJ73"
        };
      } else if (platform === "reddit") {
        isConnected = true;
        credentials = {
          clientId: "uOudm6vhc5dpjkT9CWqcMg",
          clientSecret: "gDqSDnu7Ar5PbDjHRiKnMFdd_GxeTg",
          username: "jpaulgrayson",
          password: "Polaris4"
        };
      }

      const connection: PlatformConnection = {
        id: this.currentConnectionId++,
        platform,
        isConnected,
        credentials,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.platformConnections.set(platform, connection);
    });
  }

  // Posts
  async getPosts(): Promise<Post[]> {
    return Array.from(this.posts.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getPost(id: number): Promise<Post | undefined> {
    return this.posts.get(id);
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const now = new Date();
    const post: Post = {
      ...insertPost,
      id: this.currentPostId++,
      template: insertPost.template || null,
      platforms: insertPost.platforms as string[],
      platformData: insertPost.platformData || null,
      scheduledAt: insertPost.scheduledAt || null,
      status: insertPost.status || "draft",
      createdAt: now,
      updatedAt: now,
      publishedAt: insertPost.status === "published" ? now : null,
    };
    this.posts.set(post.id, post);
    return post;
  }

  async updatePost(id: number, updates: Partial<InsertPost>): Promise<Post | undefined> {
    const existingPost = this.posts.get(id);
    if (!existingPost) return undefined;

    const updatedPost: Post = {
      ...existingPost,
      ...updates,
      platforms: updates.platforms ? updates.platforms as string[] : existingPost.platforms,
      template: updates.template !== undefined ? updates.template : existingPost.template,
      platformData: updates.platformData !== undefined ? updates.platformData : existingPost.platformData,
      scheduledAt: updates.scheduledAt !== undefined ? updates.scheduledAt : existingPost.scheduledAt,
      updatedAt: new Date(),
      publishedAt: updates.status === "published" && !existingPost.publishedAt
        ? new Date()
        : existingPost.publishedAt,
    };

    this.posts.set(id, updatedPost);
    return updatedPost;
  }

  async deletePost(id: number): Promise<boolean> {
    return this.posts.delete(id);
  }

  async getPostsByStatus(status: PostStatus): Promise<Post[]> {
    return Array.from(this.posts.values())
      .filter(post => post.status === status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Platform Connections
  async getPlatformConnections(): Promise<PlatformConnection[]> {
    return Array.from(this.platformConnections.values());
  }

  async getPlatformConnection(platform: Platform): Promise<PlatformConnection | undefined> {
    return this.platformConnections.get(platform);
  }

  async createPlatformConnection(connection: InsertPlatformConnection): Promise<PlatformConnection> {
    const now = new Date();
    const platformConnection: PlatformConnection = {
      ...connection,
      id: this.currentConnectionId++,
      isConnected: connection.isConnected !== undefined ? connection.isConnected : false,
      credentials: connection.credentials || null,
      metadata: connection.metadata || null,
      createdAt: now,
      updatedAt: now,
    };
    this.platformConnections.set(connection.platform, platformConnection);
    return platformConnection;
  }

  async updatePlatformConnection(platform: Platform, updates: Partial<InsertPlatformConnection>): Promise<PlatformConnection | undefined> {
    const existing = this.platformConnections.get(platform);
    if (!existing) return undefined;

    const updated: PlatformConnection = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.platformConnections.set(platform, updated);
    return updated;
  }

  // Analytics
  async getPostAnalytics(postId: number): Promise<PostAnalytics[]> {
    return Array.from(this.postAnalytics.values())
      .filter(analytics => analytics.postId === postId);
  }

  async createPostAnalytics(analytics: InsertPostAnalytics): Promise<PostAnalytics> {
    const postAnalytic: PostAnalytics = {
      ...analytics,
      id: this.currentAnalyticsId++,
      likes: analytics.likes ?? null,
      comments: analytics.comments ?? null,
      shares: analytics.shares ?? null,
      views: analytics.views ?? null,
      updatedAt: new Date(),
    };
    this.postAnalytics.set(postAnalytic.id, postAnalytic);
    return postAnalytic;
  }

  async updatePostAnalytics(id: number, updates: Partial<InsertPostAnalytics>): Promise<PostAnalytics | undefined> {
    const existing = this.postAnalytics.get(id);
    if (!existing) return undefined;

    const updated: PostAnalytics = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.postAnalytics.set(id, updated);
    return updated;
  }

  async getCampaigns(): Promise<Campaign[]> {
    return [];
  }

  async getCampaign(id: number): Promise<Campaign | undefined> {
    return undefined;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    throw new Error("Campaigns not supported in MemStorage");
  }

  async updateCampaign(id: number, updates: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    return undefined;
  }

  async deleteCampaign(id: number): Promise<boolean> {
    return false;
  }

  // Keyword Monitoring
  async getKeywordMonitoring(): Promise<KeywordMonitoring[]> {
    return Array.from(this.keywordMonitoring.values());
  }

  async getKeywordMonitoring(id: number): Promise<KeywordMonitoring | undefined> {
    return this.keywordMonitoring.get(id);
  }

  async createKeywordMonitoring(keyword: InsertKeywordMonitoring): Promise<KeywordMonitoring> {
    const now = new Date();
    const newKeyword: KeywordMonitoring = {
      ...keyword,
      id: this.currentKeywordId++,
      createdAt: now,
      updatedAt: now,
    };
    this.keywordMonitoring.set(newKeyword.id, newKeyword);
    return newKeyword;
  }

  async updateKeywordMonitoring(id: number, updates: Partial<InsertKeywordMonitoring>): Promise<KeywordMonitoring | undefined> {
    const existing = this.keywordMonitoring.get(id);
    if (!existing) return undefined;

    const updated: KeywordMonitoring = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.keywordMonitoring.set(id, updated);
    return updated;
  }

  async deleteKeywordMonitoring(id: number): Promise<boolean> {
    return this.keywordMonitoring.delete(id);
  }

  // Found Posts
  async getFoundPosts(keywordId?: number): Promise<FoundPost[]> {
    let posts = Array.from(this.foundPosts.values());
    if (keywordId !== undefined) {
      posts = posts.filter(post => post.keywordId === keywordId);
    }
    return posts;
  }

  async createFoundPost(foundPost: InsertFoundPost): Promise<FoundPost> {
    const now = new Date();
    const newFoundPost: FoundPost = {
      ...foundPost,
      id: this.currentFoundPostId++,
      createdAt: now,
      updatedAt: now,
    };
    this.foundPosts.set(newFoundPost.id, newFoundPost);
    return newFoundPost;
  }

  async updateFoundPost(id: number, updates: Partial<InsertFoundPost>): Promise<FoundPost | undefined> {
    const existing = this.foundPosts.get(id);
    if (!existing) return undefined;

    const updated: FoundPost = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.foundPosts.set(id, updated);
    return updated;
  }

  // Postcard Drafts
  async getPostcardDrafts(): Promise<PostcardDraft[]> {
    return Array.from(this.postcardDrafts.values());
  }

  async getPostcardDraft(id: number): Promise<PostcardDraft | undefined> {
    return this.postcardDrafts.get(id);
  }

  async updatePostcardDraft(id: number, updates: Partial<InsertPostcardDraft>): Promise<PostcardDraft | undefined> {
    const existing = this.postcardDrafts.get(id);
    if (!existing) return undefined;

    const updated: PostcardDraft = {
      ...existing,
      ...updates,
    };
    this.postcardDrafts.set(id, updated);
    return updated;
  }
}

export class DatabaseStorage implements IStorage {
  // User operations for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
  async getPosts(): Promise<Post[]> {
    return await db.select().from(posts);
  }

  async getPost(id: number): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post || undefined;
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await db
      .insert(posts)
      .values(insertPost)
      .returning();
    return post;
  }

  async updatePost(id: number, updates: Partial<InsertPost>): Promise<Post | undefined> {
    const [updatedPost] = await db
      .update(posts)
      .set(updates)
      .where(eq(posts.id, id))
      .returning();
    return updatedPost || undefined;
  }

  async deletePost(id: number): Promise<boolean> {
    // Delete all related records that reference this post to avoid foreign key constraints
    await db.delete(postAnalytics).where(eq(postAnalytics.postId, id));
    await db.delete(campaignPosts).where(eq(campaignPosts.postId, id));
    await db.delete(contentMoodTracking).where(eq(contentMoodTracking.postId, id));
    await db.delete(contentRecycling).where(eq(contentRecycling.originalPostId, id));
    await db.delete(contentRecycling).where(eq(contentRecycling.recycledPostId, id));

    // Then delete the post itself
    const result = await db.delete(posts).where(eq(posts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getPostsByStatus(status: PostStatus): Promise<Post[]> {
    return await db.select().from(posts).where(eq(posts.status, status));
  }

  async getPlatformConnections(): Promise<PlatformConnection[]> {
    return await db.select().from(platformConnections);
  }

  async getPlatformConnection(platform: Platform): Promise<PlatformConnection | undefined> {
    const [connection] = await db
      .select()
      .from(platformConnections)
      .where(eq(platformConnections.platform, platform));
    return connection || undefined;
  }

  async createPlatformConnection(connection: InsertPlatformConnection): Promise<PlatformConnection> {
    const [platformConnection] = await db
      .insert(platformConnections)
      .values(connection)
      .returning();
    return platformConnection;
  }

  async updatePlatformConnection(platform: Platform, updates: Partial<InsertPlatformConnection>): Promise<PlatformConnection | undefined> {
    const [updated] = await db
      .update(platformConnections)
      .set(updates)
      .where(eq(platformConnections.platform, platform))
      .returning();
    return updated || undefined;
  }

  async getPostAnalytics(postId: number): Promise<PostAnalytics[]> {
    return await db.select().from(postAnalytics).where(eq(postAnalytics.postId, postId));
  }

  async createPostAnalytics(analytics: InsertPostAnalytics): Promise<PostAnalytics> {
    const [postAnalytic] = await db
      .insert(postAnalytics)
      .values(analytics)
      .returning();
    return postAnalytic;
  }

  async updatePostAnalytics(id: number, updates: Partial<InsertPostAnalytics>): Promise<PostAnalytics | undefined> {
    const [updated] = await db
      .update(postAnalytics)
      .set(updates)
      .where(eq(postAnalytics.id, id))
      .returning();
    return updated || undefined;
  }

  async getCampaigns(): Promise<Campaign[]> {
    return await db.select().from(campaigns);
  }

  async getCampaign(id: number): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign || undefined;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [newCampaign] = await db
      .insert(campaigns)
      .values(campaign)
      .returning();
    return newCampaign;
  }

  async updateCampaign(id: number, updates: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(eq(campaigns.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCampaign(id: number): Promise<boolean> {
    const result = await db.delete(campaigns).where(eq(campaigns.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Keyword Monitoring
  async getKeywordMonitoring(): Promise<KeywordMonitoring[]>;
  async getKeywordMonitoring(id: number): Promise<KeywordMonitoring | undefined>;
  async getKeywordMonitoring(id?: number): Promise<KeywordMonitoring[] | KeywordMonitoring | undefined> {
    if (id !== undefined) {
      const [result] = await db.select().from(keywordMonitoring).where(eq(keywordMonitoring.id, id));
      return result;
    }
    return await db.select().from(keywordMonitoring);
  }

  async createKeywordMonitoring(keyword: InsertKeywordMonitoring): Promise<KeywordMonitoring> {
    const [result] = await db
      .insert(keywordMonitoring)
      .values(keyword)
      .returning();
    return result;
  }

  async updateKeywordMonitoring(id: number, updates: Partial<InsertKeywordMonitoring>): Promise<KeywordMonitoring | undefined> {
    const [updated] = await db
      .update(keywordMonitoring)
      .set(updates)
      .where(eq(keywordMonitoring.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteKeywordMonitoring(id: number): Promise<boolean> {
    const result = await db.delete(keywordMonitoring).where(eq(keywordMonitoring.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Found Posts
  async getFoundPosts(keywordId?: number): Promise<FoundPost[]> {
    if (keywordId) {
      return await db.select().from(foundPosts).where(eq(foundPosts.keywordId, keywordId));
    }
    return await db.select().from(foundPosts);
  }

  async createFoundPost(foundPost: InsertFoundPost): Promise<FoundPost> {
    const [result] = await db
      .insert(foundPosts)
      .values(foundPost)
      .returning();
    return result;
  }

  async updateFoundPost(id: number, updates: Partial<InsertFoundPost>): Promise<FoundPost | undefined> {
    const [updated] = await db
      .update(foundPosts)
      .set(updates)
      .where(eq(foundPosts.id, id))
      .returning();
    return updated || undefined;
  }

  // Postcard Drafts
  async getPostcardDrafts(): Promise<PostcardDraft[]> {
    return await db.select().from(postcardDrafts).orderBy(desc(postcardDrafts.createdAt));
  }

  async getPostcardDraft(id: number): Promise<PostcardDraft | undefined> {
    const [draft] = await db.select().from(postcardDrafts).where(eq(postcardDrafts.id, id));
    return draft || undefined;
  }

  async updatePostcardDraft(id: number, updates: Partial<InsertPostcardDraft>): Promise<PostcardDraft | undefined> {
    const [updated] = await db
      .update(postcardDrafts)
      .set(updates)
      .where(eq(postcardDrafts.id, id))
      .returning();
    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
