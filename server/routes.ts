import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import * as path from "path";
import * as fs from "fs";
import multer from "multer";
import { z } from "zod";
import { TwitterApi } from "twitter-api-v2";
import { eq, and, or, isNull } from "drizzle-orm";
import { storage } from "./storage";
import { pool } from "./db";
import { db } from "./db";
import { postcardDrafts } from "@shared/schema";
import { insertPostSchema, insertPlatformConnectionSchema, insertCampaignSchema, Platform, PostStatus } from "@shared/schema";
import { keywordSearchEngine } from "./keyword-search";
import { postcardDrafter, generateDraft } from "./services/postcard_drafter";
import { publishDraft } from "./services/twitter_publisher";
import { sniperManager } from "./services/sniper_manager";
import { generateDailyPostcard, previewDailyPostcard, generatePostcardForDestination, getAvailableDestinations, setOverrideDestination } from "./services/daily_postcard";
import { startDailyPostcardScheduler, getSchedulerStatus, triggerDailyPostcardNow } from "./services/daily_postcard_scheduler";
import { generateVideoSlideshow, getVideoDestinations, previewVideoSlideshow, listGeneratedVideos } from "./services/video_slideshow";
import { postThreadTour, previewThreadTour, getThreadTourDestinations, getTodaysThreadDestination, fetchFamousTours } from "./services/thread_tour";
import { getThreadTourSchedulerStatus, setNextThreadDestination, clearNextThreadDestination } from "./services/thread_tour_scheduler";
import { autoPublisher } from "./services/auto_publisher";
import { previewVideoPost, generateVideoPost, generateVideoCaption, refreshPreviewData } from "./services/video_post_generator";
import { getDailyVideoSchedulerStatus, setNextVideoDestination, clearNextVideoDestination, triggerDailyVideoNow, getVideoDestinationQueue } from "./services/daily_video_scheduler";
import { CAMPAIGN_CONFIGS, LOGICART_STRATEGIES, getActiveLogicArtStrategy, setActiveLogicArtStrategy, getActiveStrategyConfig } from "./campaign-config";
import { getActiveCampaign, setActiveCampaign, isValidCampaignType } from "./campaign-state";
import { arenaService, type ArenaRequest, getRandomChallenge, getAllChallenges, runAutoArena } from "./services/arena_service";
import { requireTier, checkFeature, getTierLimits, TIER_LIMITS } from "./middleware/tier-guard";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve generated images from the public/generated-images folder
  const generatedImagesDir = path.join(process.cwd(), "public", "generated-images");
  if (!fs.existsSync(generatedImagesDir)) {
    fs.mkdirSync(generatedImagesDir, { recursive: true });
  }
  app.use("/generated-images", express.static(generatedImagesDir));
  
  // Host-based routing for custom domains (x.quack.us.com, x.orchestrate.us.com)
  app.use((req, res, next) => {
    const host = req.hostname.toLowerCase();
    
    // x.quack.us.com -> redirect to /quack landing page
    if (host === 'x.quack.us.com' && req.path === '/') {
      return res.redirect('/quack');
    }
    
    // x.orchestrate.us.com -> redirect to /orchestrate landing page  
    if (host === 'x.orchestrate.us.com' && req.path === '/') {
      return res.redirect('/orchestrate');
    }
    
    next();
  });
  
  // Simple authentication middleware
  const isAuthenticated = (req: any, res: any, next: any) => {
    // For now, always allow through for demo purposes
    // In production, this would check actual authentication
    next();
  };

  // Configure multer for file uploads
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  const multerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${timestamp}-${randomId}${ext}`);
    }
  });
  
  const upload = multer({
    storage: multerStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|webm|avi/;
      const ext = path.extname(file.originalname).toLowerCase().slice(1);
      if (allowedTypes.test(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type'));
      }
    }
  });

  // Test route to verify upload registration
  app.get('/api/upload-test', (req, res) => {
    res.json({ status: 'upload routes registered' });
  });

  // File upload endpoint for media attachments
  app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const fileUrl = `/uploads/${req.file.filename}`;
      console.log(`File uploaded: ${fileUrl} (${req.file.size} bytes)`);
      
      res.json({ url: fileUrl, filename: req.file.filename });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Simple authentication stub
  app.get('/api/auth/user', async (req, res) => {
    // For now, always return a basic user to enable the app
    // In production, this would check session/token
    res.json({
      id: "user1",
      email: "user@example.com",
      firstName: "Demo",
      lastName: "User"
    });
  });

  app.get('/api/login', (req, res) => {
    // Simple login redirect - in production this would handle OAuth
    res.redirect('/');
  });

  app.get('/api/logout', (req, res) => {
    // Simple logout - in production this would clear session
    res.redirect('/');
  });

  // System Health Check
  app.get("/api/health/detailed", async (req, res) => {
    try {
      const turaiUrl = process.env.TURAI_API_URL || "http://localhost:5050";
      let turaiStatus = "unknown";
      try {
        // Short timeout for health check
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const turaiRes = await fetch(turaiUrl + "/health", { signal: controller.signal });
        clearTimeout(timeoutId);
        turaiStatus = turaiRes.ok ? "connected" : "error";
      } catch (e) {
        turaiStatus = "unreachable";
      }

      const sniperStatus = {
        isRunning: sniperManager.isRunning,
        isReady: sniperManager.isReady,
        status: sniperManager.status,
        isPaused: sniperManager.paused,
        draftsGeneratedToday: sniperManager.todaysDrafts,
        dailyLimit: sniperManager.dailyDraftLimit
      };

      res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        sniper: sniperStatus,
        turai: { url: turaiUrl, status: turaiStatus }
      });
    } catch (error) {
      console.error("🏥 Health check error:", error);
      res.status(500).json({ status: "error", message: (error as Error).message });
    }
  });

  // Posts endpoints
  app.get("/api/posts", async (req, res) => {
    try {
      const status = req.query.status as PostStatus | undefined;
      const posts = status
        ? await storage.getPostsByStatus(status)
        : await storage.getPosts();
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  app.get("/api/posts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const post = await storage.getPost(id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  app.post("/api/posts", async (req, res) => {
    try {
      console.log("Creating post with data:", req.body);
      const userId = "user1"; // Hardcoded for now
      const postData = { ...req.body, userId };
      console.log("Post data with userId:", postData);

      const validatedData = insertPostSchema.parse(postData);
      console.log("Validated data:", validatedData);
      const post = await storage.createPost(validatedData);
      console.log("Created post:", post);

      // If publishing, simulate platform posting
      if (post.status === "published") {
        await handlePostPublishing(post.id, post.platforms as string[]);
      }

      res.status(201).json(post);
    } catch (error) {
      console.error("Post creation error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid post data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  app.patch("/api/posts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = insertPostSchema.partial().parse(req.body);
      const post = await storage.updatePost(id, updates);

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // If publishing, simulate platform posting
      if (updates.status === "published") {
        await handlePostPublishing(post.id, post.platforms as string[]);
      }

      res.json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid update data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update post" });
    }
  });

  app.delete("/api/posts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deletePost(id);

      if (!deleted) {
        return res.status(404).json({ message: "Post not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  // Sync metrics for a specific post
  app.post("/api/posts/:id/sync-metrics", isAuthenticated, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const post = await storage.getPost(postId);

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (post.status !== "published" || !post.platformData) {
        return res.status(400).json({ message: "Post must be published to sync metrics" });
      }

      const platformData = post.platformData as any;
      const updatedMetrics: any = {};

      // Sync Twitter metrics
      const twitterId = platformData.twitter?.tweetId || platformData.twitter?.id;
      if (twitterId) {
        try {
          const metricsMap = await fetchTwitterMetricsBatch([twitterId]);
          const twitterMetrics = metricsMap[twitterId];
          if (twitterMetrics) {
            updatedMetrics.twitter = { ...platformData.twitter, ...twitterMetrics };
          }
        } catch (error) {
          console.error("Failed to fetch Twitter metrics:", error);
        }
      }

      // Sync Reddit metrics  
      if (platformData.reddit?.id) {
        try {
          const redditMetrics = await fetchRedditMetrics(platformData.reddit.id);
          updatedMetrics.reddit = { ...platformData.reddit, ...redditMetrics };
        } catch (error) {
          console.error("Failed to fetch Reddit metrics:", error);
        }
      }

      // Update post with new metrics
      const updatedPost = await storage.updatePost(postId, {
        platformData: {
          ...platformData,
          ...updatedMetrics,
          lastSyncedAt: new Date().toISOString(),
        },
      });

      res.json({ success: true, post: updatedPost });
    } catch (error) {
      console.error("Error syncing metrics:", error);
      res.status(500).json({ message: "Failed to sync metrics" });
    }
  });

  // Sync metrics for all published posts
  app.post("/api/posts/sync-all-metrics", isAuthenticated, async (req, res) => {
    try {
      console.log("[Sync] Starting manual metrics sync...");
      const posts = await storage.getPostsByStatus("published");
      const results = [];
      let syncErrors: string[] = [];

      // 1. Collect all Twitter IDs needing sync
      // Look for tweetId (new standard) or id (old standard)
      const postsToUpdate = posts.filter(p => {
        const data = p.platformData as any;
        return data && data.twitter && (data.twitter.tweetId || data.twitter.id);
      });

      const twitterIds = postsToUpdate.map(p => {
        const data = (p.platformData as any).twitter;
        return data.tweetId || data.id;
      }).filter(id => id && id !== 'unknown' && /^\d+$/.test(id)); // Validate IDs are numeric

      console.log(`[Sync] Found ${posts.length} published posts, ${twitterIds.length} with valid Twitter IDs`);

      // 2. Fetch Twitter metrics in batches of 100 (API limit)
      let twitterMetricsMap: Record<string, any> = {};
      if (twitterIds.length > 0) {
        try {
          // Split into chunks of 100 (Twitter API limit)
          const chunkSize = 100;
          for (let i = 0; i < twitterIds.length; i += chunkSize) {
            const chunk = twitterIds.slice(i, i + chunkSize);
            console.log(`[Sync] Fetching batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(twitterIds.length / chunkSize)} (${chunk.length} IDs)...`);
            const chunkMetrics = await fetchTwitterMetricsBatch(chunk);
            twitterMetricsMap = { ...twitterMetricsMap, ...chunkMetrics };
          }
          console.log(`[Sync] Twitter API returned metrics for ${Object.keys(twitterMetricsMap).length} tweets`);
        } catch (error: any) {
          console.error("[Sync] Failed to fetch batch Twitter metrics:", error);
          syncErrors.push(`Twitter API error: ${error.message || 'Unknown error'}`);
        }
      } else {
        syncErrors.push("No valid Twitter IDs found to sync");
      }

      // 3. Loop through posts and update data
      for (const post of posts) {
        if (!post.platformData) continue;

        try {
          const platformData = post.platformData as any;
          const updatedMetrics: any = {};

          // Sync Twitter metrics (from map)
          const twitterId = platformData.twitter?.tweetId || platformData.twitter?.id;
          if (twitterId) {
            const metrics = twitterMetricsMap[twitterId];
            if (metrics) {
              updatedMetrics.twitter = { ...platformData.twitter, ...metrics };
            }
          }

          // Sync Reddit metrics (Still sequential for now, Reddit API is different)
          if (platformData.reddit?.id) {
            try {
              const redditMetrics = await fetchRedditMetrics(platformData.reddit.id);
              updatedMetrics.reddit = { ...platformData.reddit, ...redditMetrics };
            } catch (error) {
              console.error(`Failed to fetch Reddit metrics for post ${post.id}:`, error);
            }
          }

          // Only update if we have new data
          if (Object.keys(updatedMetrics).length > 0) {
            await storage.updatePost(post.id, {
              platformData: {
                ...platformData,
                ...updatedMetrics,
                lastSyncedAt: new Date().toISOString(),
              },
            });
            results.push({ postId: post.id, success: true, metrics: updatedMetrics });
          }
        } catch (error) {
          results.push({ postId: post.id, success: false, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      console.log(`[Sync] Complete. Updated ${results.length} posts.`);
      res.json({ 
        success: true, 
        results,
        stats: {
          totalPosts: posts.length,
          postsWithTwitter: twitterIds.length,
          metricsReturned: Object.keys(twitterMetricsMap).length,
          postsUpdated: results.length,
          errors: syncErrors
        }
      });
    } catch (error) {
      console.error("Error syncing all metrics:", error);
      res.status(500).json({ message: "Failed to sync metrics" });
    }
  });

  // Topic Search
  app.get("/api/search/:keyword", async (req, res) => {
    try {
      const keyword = req.params.keyword;
      const platforms = req.query.platforms as string;
      const platformList = platforms ? platforms.split(',') : ['twitter', 'reddit'];

      const results = await keywordSearchEngine.searchAllPlatforms(keyword, platformList);
      res.json(results);
    } catch (error) {
      console.error("Error searching topics:", error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to search topics';
      res.status(500).json({ message: errorMessage });
    }
  });

  app.post("/api/reply/:platform/:postId", async (req, res) => {
    try {
      const { platform, postId } = req.params;
      const { replyText } = req.body;

      let success = false;

      if (platform === 'twitter') {
        success = await keywordSearchEngine.replyToTwitterPost(postId, replyText);
      } else if (platform === 'reddit') {
        success = await keywordSearchEngine.replyToRedditPost(postId, replyText);
      } else {
        return res.status(400).json({ message: 'Unsupported platform for replies' });
      }

      if (success) {
        res.json({ message: 'Reply posted successfully' });
      } else {
        res.status(500).json({ message: 'Failed to post reply' });
      }
    } catch (error) {
      console.error("Error posting reply:", error);
      res.status(500).json({ message: 'Failed to post reply' });
    }
  });

  // Platform connections endpoints
  app.get("/api/platforms", async (req, res) => {
    try {
      const connections = await storage.getPlatformConnections();
      res.json(connections);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch platform connections" });
    }
  });

  app.get("/api/platforms/:platform", async (req, res) => {
    try {
      const platform = req.params.platform as Platform;
      const connection = await storage.getPlatformConnection(platform);

      if (!connection) {
        return res.status(404).json({ message: "Platform connection not found" });
      }

      res.json(connection);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch platform connection" });
    }
  });

  app.patch("/api/platforms/:platform", async (req, res) => {
    try {
      const platform = req.params.platform as Platform;
      const updates = insertPlatformConnectionSchema.partial().parse(req.body);
      const connection = await storage.updatePlatformConnection(platform, updates);

      if (!connection) {
        return res.status(404).json({ message: "Platform connection not found" });
      }

      res.json(connection);
    } catch (error) {
      console.error("Error updating platform connection:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid connection data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update platform connection" });
    }
  });

  // Analytics endpoints
  app.get("/api/posts/:id/analytics", async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const analytics = await storage.getPostAnalytics(postId);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post analytics" });
    }
  });

  // Fetch replies to a specific tweet
  app.get("/api/tweets/:tweetId/replies", async (req, res) => {
    try {
      const { tweetId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const replies = await keywordSearchEngine.fetchTweetReplies(tweetId, limit);
      
      res.json({
        tweetId,
        replies: replies.map(r => ({
          id: r.id,
          author: r.author,
          text: r.content,
          createdAt: r.createdAt,
          likes: r.metadata?.likes || 0,
          retweets: r.metadata?.shares || 0,
          replies: r.metadata?.replies || 0,
          url: `https://twitter.com/${r.author}/status/${r.id}`
        }))
      });
    } catch (error) {
      console.error("Error fetching tweet replies:", error);
      res.status(500).json({ message: "Failed to fetch replies", error: String(error) });
    }
  });

  // Fetch all comments/replies for posts with comments (bulk endpoint for analytics)
  app.get("/api/analytics/comments", async (req, res) => {
    try {
      // Get recent posts with comments
      const posts = await storage.getPosts();
      const postsWithReplies = posts
        .filter(p => {
          const data = p.platformData as any;
          return (data?.twitter?.replies || 0) > 0 && (data?.twitter?.tweetId || data?.twitter?.id);
        })
        .sort((a, b) => {
          const aReplies = (a.platformData as any)?.twitter?.replies || 0;
          const bReplies = (b.platformData as any)?.twitter?.replies || 0;
          return bReplies - aReplies;
        })
        .slice(0, 10); // Top 10 posts with most comments

      // Fetch actual replies for each post
      const results = [];
      
      for (const post of postsWithReplies) {
        const data = post.platformData as any;
        const tweetId = data?.twitter?.tweetId || data?.twitter?.id;
        
        if (!tweetId) continue;
        
        try {
          const replies = await keywordSearchEngine.fetchTweetReplies(tweetId, 5);
          
          results.push({
            postId: post.id,
            tweetId,
            postContent: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
            postUrl: `https://twitter.com/MaxTruth_Seeker/status/${tweetId}`,
            publishedAt: post.publishedAt,
            totalReplies: data?.twitter?.replies || 0,
            replies: replies.map(r => ({
              id: r.id,
              author: r.author,
              text: r.content,
              createdAt: r.createdAt,
              likes: r.metadata?.likes || 0,
              url: `https://twitter.com/${r.author}/status/${r.id}`
            }))
          });
        } catch (e) {
          // Skip posts where we can't fetch replies
          console.log(`Could not fetch replies for tweet ${tweetId}:`, e);
        }
      }
      
      res.json({ posts: results });
    } catch (error) {
      console.error("Error fetching analytics comments:", error);
      res.status(500).json({ message: "Failed to fetch comments", error: String(error) });
    }
  });

  // Publish post to platforms
  app.post("/api/posts/:id/publish", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const post = await storage.getPost(id);

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      const publishedPost = await storage.updatePost(id, { status: "published" });
      await handlePostPublishing(id, post.platforms as string[]);

      res.json(publishedPost);
    } catch (error) {
      res.status(500).json({ message: "Failed to publish post" });
    }
  });

  // Retry failed post
  app.post("/api/posts/:id/retry", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const post = await storage.getPost(id);

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (post.status !== "failed" && post.status !== "draft") {
        return res.status(400).json({ message: "Post is not in failed or draft status" });
      }

      // Reset status to draft first, then publish
      await storage.updatePost(id, { status: "draft" });
      
      // Attempt to publish
      await handlePostPublishing(id, post.platforms as string[]);
      
      // Get updated post to return
      const updatedPost = await storage.getPost(id);
      res.json(updatedPost);
    } catch (error) {
      console.error("Retry post failed:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to retry post" });
    }
  });

  // Test Twitter API connection
  app.post("/api/platforms/twitter/test", async (req, res) => {
    try {
      let credentials = req.body;

      // If no credentials provided in body, try to get from DB
      if (!credentials || Object.keys(credentials).length === 0) {
        const twitterConnection = await storage.getPlatformConnection("twitter");
        if (twitterConnection && twitterConnection.credentials) {
          credentials = twitterConnection.credentials;
        }
      }

      // Check if we have credentials OR environment variables
      const hasEnvVars = process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET;

      if ((!credentials || Object.keys(credentials).length === 0) && !hasEnvVars) {
        return res.status(400).json({
          success: false,
          message: "Twitter API credentials not provided and no environment variables found.",
        });
      }

      // Use OAuth 1.0a User Context authentication
      // Treat empty strings as undefined to allow fallback to env vars
      const appKey = (credentials?.apiKey && credentials.apiKey.trim() !== "") ? credentials.apiKey : process.env.TWITTER_API_KEY!;
      const appSecret = (credentials?.apiSecret && credentials.apiSecret.trim() !== "") ? credentials.apiSecret : process.env.TWITTER_API_SECRET!;
      const accessToken = (credentials?.accessToken && credentials.accessToken.trim() !== "") ? credentials.accessToken : process.env.TWITTER_ACCESS_TOKEN!;
      const accessSecret = (credentials?.accessTokenSecret && credentials.accessTokenSecret.trim() !== "") ? credentials.accessTokenSecret : process.env.TWITTER_ACCESS_TOKEN_SECRET!;

      console.log("Testing Twitter Connection with keys:");
      console.log("App Key source:", (credentials?.apiKey && credentials.apiKey.trim() !== "") ? "Request Body" : "Env Var");
      console.log("App Key:", appKey ? appKey.substring(0, 5) + "..." : "MISSING");

      if (!appKey || !appSecret || !accessToken || !accessSecret) {
        console.error("Missing one or more Twitter API keys");
        return res.status(400).json({
          success: false,
          message: "Missing one or more Twitter API keys. Please check your settings or .env file.",
        });
      }

      const twitterClient = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      });

      const user = await twitterClient.v2.me();

      res.json({
        success: true,
        user: {
          id: user.data.id,
          username: user.data.username,
          name: user.data.name,
        },
        message: "Twitter API connection successful",
      });
    } catch (error) {
      console.error("Twitter API test failed:", error);
      res.status(400).json({
        success: false,
        message: `Twitter API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });

  // Legacy GET handler for cached frontends
  app.get("/api/platforms/twitter/test", async (req, res) => {
    try {
      // Use OAuth 1.0a User Context authentication with .env fallback
      const appKey = process.env.TWITTER_API_KEY!;
      const appSecret = process.env.TWITTER_API_SECRET!;
      const accessToken = process.env.TWITTER_ACCESS_TOKEN!;
      const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET!;

      const twitterClient = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      });

      const user = await twitterClient.v2.me();

      res.json({
        success: true,
        user: {
          id: user.data.id,
          username: user.data.username,
          name: user.data.name,
        },
        message: "Twitter API connection successful",
      });
    } catch (error) {
      console.error("Twitter API test failed:", error);
      res.status(400).json({
        success: false,
        message: `Twitter API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });

  // Test Discord webhook connection
  app.get("/api/platforms/discord/test", async (req, res) => {
    try {
      // Get stored Discord credentials from database
      const discordConnection = await storage.getPlatformConnection("discord");

      if (!discordConnection || !discordConnection.credentials) {
        return res.status(400).json({
          success: false,
          message: "Discord webhook URL not configured. Please add your Discord webhook URL in the Settings page.",
        });
      }

      const { webhookUrl } = discordConnection.credentials;

      if (!webhookUrl) {
        return res.status(400).json({
          success: false,
          message: "Discord webhook URL is required.",
        });
      }



      console.log(`Testing Discord webhook: ${webhookUrl.substring(0, 50)}...`);

      // Send a test message to Discord
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: '🎉 Discord webhook connection test successful! Your SocialVibe bot is ready to post.',
          username: 'SocialVibe Bot',
          avatar_url: 'https://i.imgur.com/4M34hi2.png'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(400).json({
          success: false,
          message: `Discord webhook test failed: ${response.status} - ${errorText}`,
        });
      }

      res.json({
        success: true,
        message: "Discord webhook connection successful! Check your Discord channel for the test message.",
        webhookUrl: webhookUrl.substring(0, 50) + "..." // Partially hide webhook URL for security
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Discord connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });

  // Test Reddit API connection
  app.get("/api/platforms/reddit/test", async (req, res) => {
    try {
      // Get stored Reddit credentials from database
      const redditConnection = await storage.getPlatformConnection("reddit");

      if (!redditConnection || !redditConnection.credentials) {
        return res.status(400).json({
          success: false,
          message: "Reddit API credentials not configured. Please add your Reddit credentials in the Settings page.",
        });
      }

      const { clientId, clientSecret, username, password, userAgent } = redditConnection.credentials;

      if (!clientId || !clientSecret || !username || !password) {
        return res.status(400).json({
          success: false,
          message: "Reddit API credentials incomplete. Please fill in all required fields in the Settings page.",
        });
      }

      // Use a proper User Agent if none provided
      const finalUserAgent = userAgent || `SocialVibe:v1.0.0 (by u/${username})`;

      console.log(`Testing Reddit connection for user: ${username}`);
      console.log(`Using User Agent: ${finalUserAgent}`);

      // Test authentication with exact Reddit API requirements
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      console.log(`Auth header (base64): ${auth}`);

      const requestBody = new URLSearchParams({
        grant_type: 'password',
        username: username,
        password: password,
      });

      console.log(`Request body: ${requestBody.toString()}`);

      const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': finalUserAgent,
        },
        body: requestBody,
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(`Reddit auth failed with status ${tokenResponse.status}: ${errorText}`);
        console.error(`Full request details:`, {
          clientId: clientId,
          username: username,
          userAgent: finalUserAgent,
          authHeader: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        });
        throw new Error(`Reddit auth failed: ${tokenResponse.statusText} - ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Get user info to verify connection
      const userResponse = await fetch('https://oauth.reddit.com/api/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': finalUserAgent,
        },
      });

      if (!userResponse.ok) {
        throw new Error(`Failed to get Reddit user info: ${userResponse.statusText}`);
      }

      const userData = await userResponse.json();

      res.json({
        success: true,
        user: {
          id: userData.id,
          username: userData.name,
          karma: userData.total_karma,
        },
        message: "Reddit API connection successful",
      });
    } catch (error) {
      console.error("Reddit API test failed:", error);
      res.status(400).json({
        success: false,
        message: `Reddit API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });

  // Campaign endpoints
  app.get("/api/campaigns", async (req, res) => {
    try {
      const campaigns = await storage.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const campaign = await storage.getCampaign(campaignId);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      res.json(campaign);
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  app.patch("/api/campaigns/:id", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const updates = req.body;

      const campaign = await storage.updateCampaign(campaignId, updates);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      res.json(campaign);
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  app.delete("/api/campaigns/:id", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);

      const success = await storage.deleteCampaign(campaignId);

      if (!success) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      res.json({ message: "Campaign deleted successfully" });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  app.get("/api/campaigns/:id/posts", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);

      // Get all posts and filter by campaign ID
      const allPosts = await storage.getPosts();
      const campaignPosts = allPosts.filter(post => post.campaignId === campaignId);

      res.json(campaignPosts);
    } catch (error) {
      console.error("Error fetching campaign posts:", error);
      res.status(500).json({ error: "Failed to fetch campaign posts" });
    }
  });

  app.post("/api/campaigns/:id/launch", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);

      // Update campaign status to active
      const campaign = await storage.updateCampaign(campaignId, { status: "active" });

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Get campaign posts and publish them
      const allPosts = await storage.getPosts();
      const campaignPosts = allPosts.filter(post => post.campaignId === campaignId);

      // Publish all draft posts in the campaign
      for (const post of campaignPosts) {
        if (post.status === "draft") {
          await handlePostPublishing(post.id, post.platforms);
        }
      }

      res.json({ message: "Campaign launched successfully", campaign });
    } catch (error) {
      console.error("Error launching campaign:", error);
      res.status(500).json({ error: "Failed to launch campaign" });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const validatedData = insertCampaignSchema.parse(req.body);
      // Add user ID for the campaign
      const campaignWithUser = {
        ...validatedData,
        userId: "user1" // Using demo user ID
      };
      const campaign = await storage.createCampaign(campaignWithUser);
      res.status(201).json(campaign);
    } catch (error) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  // Test keyword search API connections
  app.get("/api/keywords/test", isAuthenticated, async (req, res) => {
    const results = {
      twitter: { success: false, message: '', needsSetup: false },
      reddit: { success: false, message: '' }
    };

    // Test Twitter API
    try {
      const twitterConnection = await storage.getPlatformConnection("twitter");

      if (!twitterConnection || !twitterConnection.credentials) {
        results.twitter = {
          success: false,
          message: 'Twitter API credentials not found. Please configure your Twitter API keys in Settings.',
          needsSetup: true
        };
      } else {
        // Try a simple search to test the connection
        await keywordSearchEngine.searchTwitter('test', 1);
        results.twitter = {
          success: true,
          message: 'Twitter API connection successful',
          needsSetup: false
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.twitter = {
        success: false,
        message: errorMessage,
        needsSetup: errorMessage.includes('not configured')
      };
    }

    // Test Reddit API
    try {
      await keywordSearchEngine.searchReddit('test', 'AskReddit', 1);
      results.reddit = {
        success: true,
        message: 'Reddit API connection successful'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.reddit = {
        success: false,
        message: errorMessage
      };
    }

    res.json(results);
  });

  // Manual Hunt Trigger (Debug)
  app.post("/api/debug/hunt", async (req, res) => {
    try {
      const { forceReset = false } = req.body;
      const campaign = getActiveCampaign();
      const strategy = getActiveLogicArtStrategy();
      const strategyConfig = getActiveStrategyConfig();
      
      console.log(`🎯 Manual hunt triggered via API (forceReset: ${forceReset})`);
      console.log(`   Campaign: ${campaign}`);
      console.log(`   Strategy: ${strategy} (${strategyConfig.name})`);
      console.log(`   Keywords (first 5): ${strategyConfig.keywords.slice(0, 5).join(', ')}`);
      
      const result = await sniperManager.forceHunt(true, forceReset);
      
      res.json({ 
        success: true, 
        message: "Hunt completed", 
        result,
        debug: {
          campaign,
          strategy,
          strategyName: strategyConfig.name,
          keywordsSample: strategyConfig.keywords.slice(0, 5)
        }
      });
    } catch (error) {
      console.error("Manual hunt failed:", error);
      fs.appendFileSync('diagnostic.log', `[${new Date().toISOString()}] Hunt Error: ${error}\n${error instanceof Error ? error.stack : ''}\n`);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Hunt ALL Strategies (cycles through all 5 LogicArt strategies)
  app.post("/api/debug/hunt-all", async (req, res) => {
    try {
      const { forceReset = false } = req.body;
      
      console.log(`🎯 HUNT ALL triggered via API (forceReset: ${forceReset})`);
      
      const result = await sniperManager.huntAllStrategies(forceReset);
      
      res.json({ 
        success: true, 
        message: result.message, 
        result
      });
    } catch (error) {
      console.error("Hunt all failed:", error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Debug: Test Twitter search with specific keyword
  app.get("/api/debug/test-search", async (req, res) => {
    try {
      const keyword = (req.query.keyword as string) || "vibe coding";
      console.log(`🔬 Debug: Testing Twitter search for "${keyword}"...`);
      
      const results = await keywordSearchEngine.searchTwitter(keyword, 10, false);
      
      res.json({
        success: true,
        keyword,
        resultsCount: results.length,
        results: results.slice(0, 5).map(r => ({
          id: r.id,
          author: r.author,
          content: r.content.substring(0, 200),
          score: r.score,
          platform: r.platform
        }))
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error("Debug search failed:", errorMsg);
      res.status(500).json({ success: false, error: errorMsg });
    }
  });

  // Analytics Dashboard API
  app.get("/api/analytics/dashboard", async (req, res) => {
    try {
      const range = req.query.range as string || '7d';
      const days = range === '7d' ? 7 : range === '30d' ? 30 : 365;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Fetch posts in range (from main posts table)
      const allPosts = await storage.getPostsInRange(cutoffDate);

      // Calculate overall metrics
      let totalLikes = 0, totalRetweets = 0, totalReplies = 0, totalImpressions = 0;
      const destinations: Record<string, { posts: number; engagements: number }> = {};
      const hourlyData: Record<number, number> = {};
      const dailyData: Record<string, { posts: number; likes: number; retweets: number; replies: number; impressions: number }> = {};
      let likesOnly = 0, retweetsOnly = 0, repliesOnly = 0, multiEngagement = 0;

      allPosts.forEach((post: any) => {
        const twitter = post.platformData?.twitter;
        if (!twitter) return;

        const likes = twitter.likes || 0;
        const retweets = twitter.retweets || 0;
        const replies = twitter.replies || 0;
        const impressions = twitter.impressions || 0;

        totalLikes += likes;
        totalRetweets += retweets;
        totalReplies += replies;
        totalImpressions += impressions;

        // Extract destination
        const destMatch = post.content.match(/(?:to|in|over|through)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (destMatch) {
          const dest = destMatch[1];
          if (!destinations[dest]) destinations[dest] = { posts: 0, engagements: 0 };
          destinations[dest].posts++;
          destinations[dest].engagements += likes + retweets + replies;
        }

        // Hourly distribution
        const hour = new Date(post.createdAt).getHours();
        hourlyData[hour] = (hourlyData[hour] || 0) + (likes + retweets + replies);

        // Daily trends
        const date = new Date(post.createdAt).toISOString().split('T')[0];
        if (!dailyData[date]) {
          dailyData[date] = { posts: 0, likes: 0, retweets: 0, replies: 0, impressions: 0 };
        }
        dailyData[date].posts++;
        dailyData[date].likes += likes;
        dailyData[date].retweets += retweets;
        dailyData[date].replies += replies;
        dailyData[date].impressions += impressions;

        // Engagement types
        const hasLikes = likes > 0;
        const hasRetweets = retweets > 0;
        const hasReplies = replies > 0;
        const engagementCount = [hasLikes, hasRetweets, hasReplies].filter(Boolean).length;

        if (engagementCount > 1) multiEngagement++;
        else if (hasLikes) likesOnly++;
        else if (hasRetweets) retweetsOnly++;
        else if (hasReplies) repliesOnly++;
      });

      const totalEngagements = totalLikes + totalRetweets + totalReplies;
      const engagementRate = allPosts.length > 0 ? (totalEngagements / allPosts.length) : 0;

      // Format response
      const response = {
        overall: {
          totalPosts: allPosts.length,
          totalEngagements,
          engagementRate,
          avgImpressionsPerPost: allPosts.length > 0 ? totalImpressions / allPosts.length : 0,
        },
        trends: Object.entries(dailyData)
          .map(([date, data]) => ({
            date,
            ...data,
            engagementRate: data.posts > 0 ? ((data.likes + data.retweets + data.replies) / data.posts) : 0,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        topDestinations: Object.entries(destinations)
          .map(([name, data]) => ({
            name,
            posts: data.posts,
            totalEngagements: data.engagements,
            avgEngagement: data.posts > 0 ? data.engagements / data.posts : 0,
          }))
          .sort((a, b) => b.avgEngagement - a.avgEngagement)
          .slice(0, 10),
        hourlyDistribution: Object.entries(hourlyData)
          .map(([hour, engagements]) => ({ hour: Number(hour), engagements }))
          .sort((a, b) => a.hour - b.hour),
        engagementTypes: [
          { name: 'Likes Only', value: likesOnly },
          { name: 'Retweets Only', value: retweetsOnly },
          { name: 'Replies Only', value: repliesOnly },
          { name: 'Multi-Engagement', value: multiEngagement },
        ],
      };

      res.json(response);
    } catch (error) {
      console.error('Dashboard API error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  // Growth Reports API - Current Metrics
  app.get("/api/growth/current", async (req, res) => {
    try {
      // Get real-time data from posts table (not stale growth_metrics)
      const postsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_posts,
          COUNT(CASE WHEN 
            (platform_data->'twitter'->>'likes')::int > 0 OR
            (platform_data->'twitter'->>'retweets')::int > 0 OR
            (platform_data->'twitter'->>'replies')::int > 0
          THEN 1 END) as posts_with_engagement,
          AVG((platform_data->'twitter'->>'impressions')::int) as avg_impressions
        FROM posts
        WHERE status = 'published'
      `);

      const posts = postsResult.rows[0];
      const totalPosts = parseInt(posts.total_posts) || 0;
      const postsWithEngagement = parseInt(posts.posts_with_engagement) || 0;
      const avgImpressions = parseFloat(posts.avg_impressions) || 0;
      const engagementRate = totalPosts > 0 ? (postsWithEngagement / totalPosts) * 100 : 0;

      // Get follower count from growth_metrics (manually updated)
      const metricsResult = await pool.query(`
        SELECT follower_count FROM growth_metrics
        ORDER BY date DESC
        LIMIT 1
      `);

      const followerCount = metricsResult.rows[0]?.follower_count || 58;

      res.json({
        date: new Date().toISOString().split('T')[0],
        followerCount,
        totalPosts,
        engagementRate: parseFloat(engagementRate.toFixed(2)),
        avgImpressionsPerPost: parseFloat(avgImpressions.toFixed(1)),
        postsWithEngagement,
        topDestination: "Rome", // Could calculate this too, but keeping simple
      });
    } catch (error) {
      console.error('Growth metrics error:', error);
      res.status(500).json({ error: 'Failed to fetch growth metrics' });
    }
  });

  // Growth Reports API - Top Destinations
  app.get("/api/growth/destinations", async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM destination_performance
        ORDER BY avg_engagement DESC
        LIMIT 10
      `);

      const destinations = result.rows.map((row: any) => ({
        destination: row.destination,
        totalPosts: row.total_posts || 0,
        totalEngagements: row.total_engagements || 0,
        avgEngagement: parseFloat(row.avg_engagement) || 0,
      }));

      res.json(destinations);
    } catch (error) {
      console.error('Destinations error:', error);
      res.status(500).json({ error: 'Failed to fetch destinations' });
    }
  });

  // Growth Reports API - Pattern Analysis
  app.get("/api/growth/patterns", async (req, res) => {
    try {
      // Get all posts with engagement
      const posts = await storage.getPosts();

      const postsWithEngagement = posts
        .filter(p => p.platformData?.twitter)
        .map(p => {
          const twitter = (p.platformData as any).twitter;
          const engagement = (twitter.likes || 0) + (twitter.retweets || 0) + (twitter.replies || 0);
          return { ...p, engagement, twitter };
        })
        .filter(p => p.engagement > 0);

      // Analyze emojis
      const emojiStats: Record<string, { count: number; totalEng: number }> = {};
      const emojis = ['🔮', '✨', '🗺️', '🌟', '🇲🇽', '🇪🇸'];

      emojis.forEach(emoji => {
        emojiStats[emoji] = { count: 0, totalEng: 0 };
        postsWithEngagement.forEach(post => {
          if (post.content.includes(emoji)) {
            emojiStats[emoji].count++;
            emojiStats[emoji].totalEng += post.engagement;
          }
        });
      });

      const topEmoji = Object.entries(emojiStats)
        .filter(([, data]) => data.count > 0)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

      // Analyze keywords
      const keywordStats: Record<string, { count: number; totalEng: number }> = {};
      const keywords = ['crystal ball', 'mystical', 'whimsical', 'quest', 'stars'];

      keywords.forEach(keyword => {
        keywordStats[keyword] = { count: 0, totalEng: 0 };
        postsWithEngagement.forEach(post => {
          if (post.content.toLowerCase().includes(keyword)) {
            keywordStats[keyword].count++;
            keywordStats[keyword].totalEng += post.engagement;
          }
        });
      });

      const topKeyword = Object.entries(keywordStats)
        .filter(([, data]) => data.count > 0)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

      // Analyze destinations
      const destStats: Record<string, { count: number; totalEng: number }> = {};

      postsWithEngagement.forEach(post => {
        const match = post.content.match(/(?:to|in|over|through)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (match) {
          const dest = match[1];
          if (!destStats[dest]) destStats[dest] = { count: 0, totalEng: 0 };
          destStats[dest].count++;
          destStats[dest].totalEng += post.engagement;
        }
      });

      const topDestination = Object.entries(destStats)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

      // Analyze posting times
      const hourStats: Record<number, { count: number; totalEng: number }> = {};

      postsWithEngagement.forEach(post => {
        const hour = new Date(post.createdAt).getHours();
        if (!hourStats[hour]) hourStats[hour] = { count: 0, totalEng: 0 };
        hourStats[hour].count++;
        hourStats[hour].totalEng += post.engagement;
      });

      const bestHour = Object.entries(hourStats)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

      // Analyze length
      const lengthStats = {
        'Short (<100 chars)': { count: 0, totalEng: 0 },
        'Medium (100-150)': { count: 0, totalEng: 0 },
        'Long (>150 chars)': { count: 0, totalEng: 0 },
      };

      postsWithEngagement.forEach(post => {
        const len = post.content.length;
        if (len < 100) {
          lengthStats['Short (<100 chars)'].count++;
          lengthStats['Short (<100 chars)'].totalEng += post.engagement;
        } else if (len < 150) {
          lengthStats['Medium (100-150)'].count++;
          lengthStats['Medium (100-150)'].totalEng += post.engagement;
        } else {
          lengthStats['Long (>150 chars)'].count++;
          lengthStats['Long (>150 chars)'].totalEng += post.engagement;
        }
      });

      const bestLength = Object.entries(lengthStats)
        .filter(([, data]) => data.count > 0)
        .sort(([, a], [, b]) => (b.totalEng / b.count) - (a.totalEng / a.count))[0];

      res.json({
        topEmoji: {
          emoji: topEmoji?.[0] || 'N/A',
          avgEngagement: topEmoji ? topEmoji[1].totalEng / topEmoji[1].count : 0,
        },
        topKeyword: {
          keyword: topKeyword?.[0] || 'N/A',
          avgEngagement: topKeyword ? topKeyword[1].totalEng / topKeyword[1].count : 0,
        },
        topDestination: {
          name: topDestination?.[0] || 'N/A',
          avgEngagement: topDestination ? topDestination[1].totalEng / topDestination[1].count : 0,
        },
        bestHour: {
          hour: bestHour ? Number(bestHour[0]) : 0,
          avgEngagement: bestHour ? bestHour[1].totalEng / bestHour[1].count : 0,
        },
        bestLength: {
          range: bestLength?.[0] || 'N/A',
          avgEngagement: bestLength ? bestLength[1].totalEng / bestLength[1].count : 0,
        },
      });
    } catch (error) {
      console.error('Patterns error:', error);
      res.status(500).json({ error: 'Failed to fetch patterns' });
    }
  });

  // Set sniper campaign type
  app.post("/api/sniper/campaign", (req, res) => {
    const { campaignType } = req.body;
    
    if (!campaignType) {
      return res.status(400).json({ 
        success: false, 
        error: "campaignType is required" 
      });
    }
    
    if (!isValidCampaignType(campaignType)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid campaign type: ${campaignType}. Must be 'turai' or 'logicart'` 
      });
    }
    
    setActiveCampaign(campaignType);
    const activeCampaign = getActiveCampaign();
    
    res.json({
      success: true,
      message: `Campaign set to ${activeCampaign}`,
      config: CAMPAIGN_CONFIGS[activeCampaign]
    });
  });

  // Get all available campaign configs
  app.get("/api/sniper/campaigns", (req, res) => {
    res.json({
      campaigns: Object.values(CAMPAIGN_CONFIGS),
      currentCampaign: getActiveCampaign(),
      strategies: Object.values(LOGICART_STRATEGIES),
      activeStrategy: getActiveLogicArtStrategy()
    });
  });

  // Get current campaign state (used by frontend)
  app.get("/api/sniper/campaign", (req, res) => {
    const currentCampaign = getActiveCampaign();
    
    res.json({
      currentCampaign,
      config: CAMPAIGN_CONFIGS[currentCampaign],
      activeStrategy: currentCampaign === 'logicart' ? getActiveLogicArtStrategy() : null,
      strategyConfig: currentCampaign === 'logicart' ? getActiveStrategyConfig() : null,
      // Always return LogicArt strategies so frontend can display them when switching tabs
      availableStrategies: Object.values(LOGICART_STRATEGIES)
    });
  });

  // Switch LogicArt strategy
  app.post("/api/sniper/strategy", (req, res) => {
    const { strategy } = req.body;
    
    if (!strategy || !['vibe_scout', 'spaghetti_detective', 'bug_hunter', 'arena_referee', 'code_flowchart', 'quack_duck'].includes(strategy)) {
      return res.status(400).json({ error: 'Invalid strategy. Choose: vibe_scout, spaghetti_detective, bug_hunter, arena_referee, code_flowchart, or quack_duck' });
    }
    
    setActiveLogicArtStrategy(strategy as any);
    
    res.json({
      success: true,
      activeStrategy: getActiveLogicArtStrategy(),
      strategyConfig: getActiveStrategyConfig()
    });
  });

  // Pause/Resume sniper auto-hunting - per campaign
  app.post("/api/sniper/pause", (req, res) => {
    const { campaign } = req.body; // Optional: 'turai' or 'logicart'
    sniperManager.pause(campaign);
    res.json({ 
      success: true, 
      campaigns: sniperManager.getCampaignPauseStates(),
      message: campaign ? `${campaign} campaign paused` : "All campaigns paused"
    });
  });

  app.post("/api/sniper/resume", (req, res) => {
    const { campaign } = req.body; // Optional: 'turai' or 'logicart'
    sniperManager.resume(campaign);
    res.json({ 
      success: true, 
      campaigns: sniperManager.getCampaignPauseStates(),
      message: campaign ? `${campaign} campaign resumed` : "All campaigns resumed"
    });
  });

  app.get("/api/sniper/status", (req, res) => {
    res.json({
      campaigns: sniperManager.getCampaignPauseStates(),
      allPaused: sniperManager.paused,
      isRunning: sniperManager.isRunning,
      draftsGeneratedToday: sniperManager.todaysDrafts,
      dailyLimit: sniperManager.dailyDraftLimit,
      activeCampaign: getActiveCampaign(),
      activeStrategy: getActiveLogicArtStrategy(),
      strategyName: getActiveStrategyConfig().name
    });
  });

  // Reset stuck hunting flag
  app.post("/api/sniper/reset", (req, res) => {
    sniperManager.resetHuntingFlag();
    res.json({ 
      success: true, 
      message: "Hunting flag reset",
      isRunning: sniperManager.isRunning
    });
  });

  // ==================== ARENA API ====================
  
  // Get user's tier and feature limits
  app.get("/api/arena/tier", async (req, res) => {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.json({
        tier: "free",
        limits: TIER_LIMITS.free,
        authenticated: false
      });
    }
    
    try {
      const limits = await getTierLimits(userId);
      const tierKey = Object.entries(TIER_LIMITS).find(
        ([_, v]) => JSON.stringify(v) === JSON.stringify(limits)
      )?.[0] || "free";
      
      res.json({
        tier: tierKey,
        limits,
        authenticated: true
      });
    } catch (error) {
      res.json({
        tier: "free",
        limits: TIER_LIMITS.free,
        authenticated: true,
        error: "Could not determine tier"
      });
    }
  });
  
  // Run arena comparison - queries all 4 AI models
  app.post("/api/arena/run", async (req, res) => {
    try {
      const { code, problemDescription, mode = "debug" } = req.body;
      
      // Code is only required in debug mode
      if (mode === "debug" && (!code || typeof code !== 'string')) {
        return res.status(400).json({ error: "Code is required for debug mode" });
      }
      
      // Question mode requires problemDescription
      if (mode === "question" && (!problemDescription || typeof problemDescription !== 'string')) {
        return res.status(400).json({ error: "Question is required" });
      }
      
      console.log(`🏟️ Arena API: Starting multi-model comparison (mode: ${mode})...`);
      const result = await arenaService.runArena({ code: code || "", problemDescription, mode });
      res.json(result);
    } catch (error) {
      console.error("Arena error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Arena failed" });
    }
  });
  
  // Generate X thread content from arena result
  app.post("/api/arena/generate-thread", async (req, res) => {
    try {
      const { code, problemDescription, language } = req.body;
      
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: "Code is required" });
      }
      
      console.log("🏟️ Arena API: Generating thread content...");
      const result = await arenaService.runArena({ code, problemDescription, language });
      const thread = arenaService.generateArenaThread(result);
      
      res.json({ 
        result,
        thread,
        threadCount: thread.length
      });
    } catch (error) {
      console.error("Arena thread generation error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Thread generation failed" });
    }
  });
  
  // Post arena thread to X
  app.post("/api/arena/post-thread", async (req, res) => {
    try {
      const { code, problemDescription, language } = req.body;
      
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: "Code is required" });
      }
      
      // Generate arena result and thread
      const result = await arenaService.runArena({ code, problemDescription, language });
      const thread = arenaService.generateArenaThread(result);
      
      // Get Twitter credentials
      const xConnection = await storage.getPlatformConnection("twitter");
      if (!xConnection?.credentials) {
        return res.status(400).json({ error: "X/Twitter not connected" });
      }
      
      const creds = xConnection.credentials as any;
      const client = new TwitterApi({
        appKey: creds.apiKey || process.env.TWITTER_API_KEY!,
        appSecret: creds.apiSecret || process.env.TWITTER_API_SECRET!,
        accessToken: creds.accessToken || process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: creds.accessTokenSecret || process.env.TWITTER_ACCESS_TOKEN_SECRET!,
      });
      
      // Post thread
      const tweets: string[] = [];
      let lastTweetId: string | undefined;
      
      for (const tweetText of thread) {
        const tweetParams: any = { text: tweetText };
        if (lastTweetId) {
          tweetParams.reply = { in_reply_to_tweet_id: lastTweetId };
        }
        
        const tweet = await client.v2.tweet(tweetParams);
        tweets.push(tweet.data.id);
        lastTweetId = tweet.data.id;
      }
      
      console.log(`🏟️ Arena thread posted! ${tweets.length} tweets, first: ${tweets[0]}`);
      
      res.json({
        success: true,
        tweetIds: tweets,
        threadUrl: `https://twitter.com/i/status/${tweets[0]}`,
        arenaResult: result
      });
    } catch (error) {
      console.error("Arena post error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to post arena thread" });
    }
  });
  
  // Get all available coding challenges
  app.get("/api/arena/challenges", (req, res) => {
    const challenges = getAllChallenges();
    res.json({
      challenges,
      count: challenges.length
    });
  });
  
  // Get a random challenge
  app.get("/api/arena/random-challenge", (req, res) => {
    const challenge = getRandomChallenge();
    res.json(challenge);
  });
  
  // Run a full auto-arena (pick random challenge, run all models, return result + thread)
  app.post("/api/arena/auto", async (req, res) => {
    try {
      const useAI = req.body?.useAI === true;
      console.log(`🏟️ Auto Arena API: Starting automatic challenge (useAI: ${useAI})...`);
      const { result, thread, challengeSource } = await runAutoArena(useAI);
      res.json({
        success: true,
        result,
        thread,
        threadCount: thread.length,
        challengeSource
      });
    } catch (error) {
      console.error("Auto arena error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Auto arena failed" });
    }
  });
  
  // Run auto-arena and post to X (requires Pro tier)
  app.post("/api/arena/auto-post", checkFeature("threadPosting"), async (req, res) => {
    try {
      const useAI = req.body?.useAI === true;
      console.log(`🏟️ Auto Arena API: Running and posting to X (useAI: ${useAI})...`);
      
      const { result, thread, challengeSource } = await runAutoArena(useAI);
      
      // Get Twitter credentials
      const xConnection = await storage.getPlatformConnection("twitter");
      if (!xConnection?.credentials) {
        return res.status(400).json({ error: "X/Twitter not connected" });
      }
      
      const creds = xConnection.credentials as any;
      const client = new TwitterApi({
        appKey: creds.apiKey || process.env.TWITTER_API_KEY!,
        appSecret: creds.apiSecret || process.env.TWITTER_API_SECRET!,
        accessToken: creds.accessToken || process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: creds.accessTokenSecret || process.env.TWITTER_ACCESS_TOKEN_SECRET!,
      });
      
      // Post thread
      const tweets: string[] = [];
      let lastTweetId: string | undefined;
      
      for (const tweetText of thread) {
        const tweetParams: any = { text: tweetText };
        if (lastTweetId) {
          tweetParams.reply = { in_reply_to_tweet_id: lastTweetId };
        }
        
        const tweet = await client.v2.tweet(tweetParams);
        tweets.push(tweet.data.id);
        lastTweetId = tweet.data.id;
      }
      
      console.log(`🏟️ Auto Arena thread posted! ${tweets.length} tweets, first: ${tweets[0]}`);
      
      res.json({
        success: true,
        tweetIds: tweets,
        threadUrl: `https://twitter.com/i/status/${tweets[0]}`,
        arenaResult: result,
        thread,
        challengeSource
      });
    } catch (error) {
      console.error("Auto arena post error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to post auto arena thread" });
    }
  });

  app.post("/api/debug/wipe", async (req, res) => {
    try {
      console.log("🗑️ Wiping all postcard drafts via API...");
      await storage.cleanupAllDrafts(); // We need to implement this in storage
      res.json({ success: true, message: "All drafts wiped successfully" });
    } catch (error) {
      console.error("Wipe failed:", error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Auto-Publisher Control Endpoints
  app.get("/api/auto-publisher/status", async (req, res) => {
    res.json(autoPublisher.getStatus());
  });

  app.post("/api/auto-publisher/enable", async (req, res) => {
    autoPublisher.enable();
    res.json({ success: true, message: "Auto-publisher enabled", status: autoPublisher.getStatus() });
  });

  app.post("/api/auto-publisher/disable", async (req, res) => {
    autoPublisher.disable();
    res.json({ success: true, message: "Auto-publisher disabled", status: autoPublisher.getStatus() });
  });

  // ============================================
  // Daily Postcard Feature
  // ============================================

  // Preview today's postcard (doesn't post)
  app.get("/api/daily-postcard/preview", async (req, res) => {
    try {
      const result = await previewDailyPostcard();
      res.json(result);
    } catch (error) {
      console.error("Daily postcard preview failed:", error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Generate and POST today's postcard to Twitter
  app.post("/api/daily-postcard/post", async (req, res) => {
    try {
      const result = await generateDailyPostcard(true); // autoPost = true
      res.json(result);
    } catch (error) {
      console.error("Daily postcard post failed:", error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Generate postcard for a specific destination
  app.post("/api/daily-postcard/custom", async (req, res) => {
    try {
      const { destination, autoPost = false } = req.body;
      if (!destination) {
        return res.status(400).json({ success: false, error: "destination is required" });
      }
      const result = await generatePostcardForDestination(destination, autoPost);
      res.json(result);
    } catch (error) {
      console.error("Custom postcard failed:", error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get list of available destinations
  app.get("/api/daily-postcard/destinations", (req, res) => {
    res.json({ destinations: getAvailableDestinations() });
  });

  // Get scheduler status
  app.get("/api/daily-postcard/scheduler-status", (req, res) => {
    res.json(getSchedulerStatus());
  });

  // Manually trigger daily postcard (for testing)
  app.post("/api/daily-postcard/trigger", async (req, res) => {
    try {
      console.log("📅 Manual daily postcard trigger requested");
      const result = await triggerDailyPostcardNow();
      res.json(result);
    } catch (error) {
      console.error("Manual trigger error:", error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Set next destination manual override
  app.post("/api/daily-postcard/set-destination", async (req, res) => {
    try {
      const { destination } = req.body;
      if (!destination) {
        return res.status(400).json({ message: "Destination required" });
      }
      setOverrideDestination(destination);
      res.json({ success: true, destination });
    } catch (error) {
      res.status(500).json({ message: "Failed to set destination" });
    }
  });

  // Get scheduler logs
  app.get("/api/daily-postcard/logs", async (req, res) => {
    const logFile = path.join(process.cwd(), 'scheduler.log');

    try {
      if (fs.existsSync(logFile)) {
        const logs = fs.readFileSync(logFile, 'utf8');
        const lines = logs.split('\n').filter(Boolean).slice(-50); // Last 50 lines
        res.json({ logs: lines });
      } else {
        res.json({ logs: [], message: 'No scheduler logs yet' });
      }
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================
  // VIDEO SLIDESHOW ENDPOINTS
  // ============================================

  // Get list of available destinations for video generation
  app.get("/api/video-slideshow/destinations", (req, res) => {
    res.json({ destinations: getVideoDestinations() });
  });

  // Preview video generation info (without actually generating)
  app.get("/api/video-slideshow/preview/:destination", async (req, res) => {
    try {
      const { destination } = req.params;
      const preview = await previewVideoSlideshow(decodeURIComponent(destination));
      res.json(preview);
    } catch (error) {
      console.error("Video preview failed:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Generate a video slideshow (long-running operation)
  // Stream video file
  app.get("/api/video-slideshow/stream", (req, res) => {
    try {
      const videoPath = req.query.path as string;
      if (!videoPath || !fs.existsSync(videoPath)) {
        return res.status(404).json({ error: "Video not found" });
      }

      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch (error) {
      console.error("Stream error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/video-slideshow/generate", async (req, res) => {
    try {
      const { destination, duration = 60, theme = 'general' } = req.body;

      if (!destination) {
        return res.status(400).json({ error: "destination is required" });
      }

      console.log(`🎬 Video generation requested for: ${destination}`);

      // Start generation (this will take a while)
      const result = await generateVideoSlideshow(destination, { duration, theme });

      res.json(result);
    } catch (error) {
      console.error("Video generation failed:", error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // List all generated videos
  app.get("/api/video-slideshow/videos", (req, res) => {
    try {
      const videos = listGeneratedVideos();
      res.json({ videos });
    } catch (error) {
      console.error("Failed to list videos:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // ===== THREAD TOUR ENDPOINTS =====

  // Get thread tour scheduler status
  app.get("/api/thread-tour/scheduler-status", (req, res) => {
    const status = getThreadTourSchedulerStatus();
    res.json(status);
  });

  // Get available destinations for thread tours
  app.get("/api/thread-tour/destinations", (req, res) => {
    res.json({
      destinations: getThreadTourDestinations(),
      todaysDestination: getTodaysThreadDestination()
    });
  });

  // Get famous tours from Turai
  app.get("/api/thread-tour/famous-tours", async (req, res) => {
    try {
      const tours = await fetchFamousTours();
      res.json({ tours });
    } catch (error) {
      console.error("Failed to fetch famous tours:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Post a thread tour manually
  app.post("/api/thread-tour/post", async (req, res) => {
    try {
      const { destination, maxStops = 5, theme = 'hidden_gems', shareCode } = req.body;

      if (!destination && !shareCode) {
        return res.status(400).json({ error: "Destination or shareCode required" });
      }

      const result = await postThreadTour(destination || 'Auto', {
        maxStops,
        theme,
        existingShareCode: shareCode
      });

      res.json(result);
    } catch (error) {
      console.error("Thread tour post failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Post a topic-based thread tour (with focus/keywords)
  app.post("/api/thread-tour/post-topic", async (req, res) => {
    try {
      const { location, focus, maxStops = 5, theme = 'hidden_gems' } = req.body;

      if (!location) {
        return res.status(400).json({ error: "Location required" });
      }

      if (!focus) {
        return res.status(400).json({ error: "Focus/keywords required" });
      }

      console.log(`🔥 Topic Tour Request: ${location} - "${focus.substring(0, 50)}..."`);

      const result = await postThreadTour(location, {
        maxStops,
        theme,
        focus
      });

      // Add topic info to response
      res.json({
        ...result,
        topic: focus,
        location
      });
    } catch (error) {
      console.error("Topic tour post failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Preview thread tour (generate without posting)
  app.post("/api/thread-tour/preview", async (req, res) => {
    try {
      const { location, focus, maxStops = 3, theme = 'hidden_gems' } = req.body;

      if (!location) {
        return res.status(400).json({ error: "Location required" });
      }

      console.log(`👁️ Preview Tour Request: ${location}${focus ? ` - "${focus.substring(0, 50)}..."` : ''}`);

      const result = await previewThreadTour(location, {
        maxStops,
        theme,
        focus
      });

      res.json(result);
    } catch (error) {
      console.error("Tour preview failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Set next scheduled destination
  app.post("/api/thread-tour/set-next", (req, res) => {
    const { destination } = req.body;

    if (!destination) {
      return res.status(400).json({ error: "Destination required" });
    }

    setNextThreadDestination(destination);
    res.json({
      success: true,
      message: `Next thread tour set to: ${destination}`,
      status: getThreadTourSchedulerStatus()
    });
  });

  // Clear custom next destination (revert to auto)
  app.post("/api/thread-tour/clear-next", (req, res) => {
    clearNextThreadDestination();
    res.json({
      success: true,
      message: "Reverted to automatic destination selection",
      status: getThreadTourSchedulerStatus()
    });
  });

  // ============================================
  // VIDEO POST ENDPOINTS (New FFmpeg-based system)
  // ============================================

  // Preview a video post (shows stops, images, narration before generating)
  app.post("/api/video-post/preview", async (req, res) => {
    try {
      const { destination, topic, maxStops = 5, theme = 'hidden_gems' } = req.body;

      if (!destination) {
        return res.status(400).json({ error: "Destination required" });
      }

      console.log(`👁️ Video post preview: ${destination}${topic ? ` (${topic})` : ''}`);

      const preview = await previewVideoPost({
        destination,
        topic,
        maxStops,
        theme
      });

      res.json(preview);
    } catch (error) {
      console.error("Video post preview failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Refresh preview data from existing share code
  app.get("/api/video-post/preview/:shareCode", async (req, res) => {
    try {
      const { shareCode } = req.params;
      const maxStops = parseInt(req.query.maxStops as string) || 5;

      console.log(`🔄 Refreshing preview: ${shareCode}`);
      const preview = await refreshPreviewData(shareCode, maxStops);
      res.json(preview);
    } catch (error) {
      console.error("Video post refresh failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Generate video from options or existing preview
  app.post("/api/video-post/generate", async (req, res) => {
    try {
      const { destination, topic, maxStops = 5, secondsPerStop = 12, theme = 'hidden_gems', shareCode } = req.body;

      if (!destination) {
        return res.status(400).json({ error: "Destination required" });
      }

      console.log(`🎬 Video post generate: ${destination}${shareCode ? ` (shareCode: ${shareCode})` : ''}`);

      // If we have a shareCode from preview, fetch that tour's data instead of creating new
      let existingPreview = undefined;
      if (shareCode) {
        console.log(`   Using existing preview from shareCode: ${shareCode}`);
        existingPreview = await refreshPreviewData(shareCode, maxStops);
        if (!existingPreview.success) {
          console.log(`   ⚠️ Could not fetch preview for ${shareCode}, generating new...`);
          existingPreview = undefined;
        }
      }

      const result = await generateVideoPost({
        destination,
        topic,
        maxStops,
        secondsPerStop,
        theme
      }, existingPreview);

      res.json(result);
    } catch (error) {
      console.error("Video post generation failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Generate caption for video post
  app.post("/api/video-post/caption", async (req, res) => {
    try {
      const { destination, topic } = req.body;

      if (!destination) {
        return res.status(400).json({ error: "Destination required" });
      }

      const caption = await generateVideoCaption(destination, topic);
      res.json({ success: true, caption });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Post video to X (using existing publish infrastructure)
  app.post("/api/video-post/publish", async (req, res) => {
    try {
      const { videoPath, caption, destination, shareCode } = req.body;

      if (!videoPath || !caption) {
        return res.status(400).json({ error: "videoPath and caption required" });
      }

      console.log(`📤 Publishing video post: ${destination || 'Unknown'}`);

      // Use existing video publish function
      const { publishDraftWithVideo } = await import("./services/twitter_publisher");
      const result = await publishDraftWithVideo(videoPath, caption);

      if (result.success && result.tweetId) {
        // Save the post to database for tracking
        await storage.createPost({
          userId: "system",
          content: caption,
          platforms: ["twitter"],
          status: "published",
          publishedAt: new Date(),
          platformData: {
            twitter: {
              url: `https://twitter.com/user/status/${result.tweetId}`,
              tweetId: result.tweetId,
              videoPost: true,
              destination: destination,
              shareCode: shareCode,
              videoPath: videoPath
            }
          } as any
        } as any);

        console.log(`✅ Video post published and saved! Tweet ID: ${result.tweetId}`);

        res.json({
          success: true,
          tweetId: result.tweetId,
          destination,
          tweetUrl: `https://twitter.com/user/status/${result.tweetId}`,
          message: "Video posted successfully!"
        });
      } else {
        throw new Error(result.error || "Failed to publish video");
      }
    } catch (error) {
      console.error("Video publish failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Post thread using preview stops (uses same content as video preview)
  app.post("/api/video-post/thread", async (req, res) => {
    try {
      const { destination, shareCode, stops } = req.body;

      if (!stops || !Array.isArray(stops) || stops.length === 0) {
        return res.status(400).json({ error: "stops array required" });
      }

      console.log(`🧵 Posting thread for ${destination} with ${stops.length} stops from preview`);

      const { postThreadWithPreviewStops } = await import("./services/video_post_generator");
      const result = await postThreadWithPreviewStops(destination, stops, shareCode);

      res.json(result);
    } catch (error) {
      console.error("Thread post failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // List generated video posts
  app.get("/api/video-post/list", (req, res) => {
    try {
      const videosDir = path.join(process.cwd(), 'video_posts');
      if (!fs.existsSync(videosDir)) {
        return res.json({ videos: [] });
      }

      const files = fs.readdirSync(videosDir)
        .filter(f => f.endsWith('.mp4'))
        .map(f => {
          const fullPath = path.join(videosDir, f);
          const stats = fs.statSync(fullPath);
          return {
            filename: f,
            path: fullPath,
            size: stats.size,
            createdAt: stats.mtime.toISOString()
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ videos: files });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Delete a video post
  app.delete("/api/video-post/delete", (req, res) => {
    try {
      const videoPath = req.query.path as string;

      if (!videoPath) {
        return res.status(400).json({ error: "Path required" });
      }

      // Security: ensure path is within video_posts directory
      const videosDir = path.join(process.cwd(), 'video_posts');
      const normalizedPath = path.normalize(videoPath);

      if (!normalizedPath.startsWith(videosDir)) {
        return res.status(403).json({ error: "Invalid path" });
      }

      if (!fs.existsSync(normalizedPath)) {
        return res.status(404).json({ error: "Video not found" });
      }

      fs.unlinkSync(normalizedPath);
      console.log(`🗑️ Deleted video: ${normalizedPath}`);

      res.json({ success: true, message: "Video deleted" });
    } catch (error) {
      console.error("Video delete error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================
  // DAILY VIDEO SCHEDULER ENDPOINTS
  // ============================================

  // Get daily video scheduler status
  app.get("/api/daily-video/status", (req, res) => {
    res.json(getDailyVideoSchedulerStatus());
  });

  // Get destination queue
  app.get("/api/daily-video/queue", (req, res) => {
    res.json({ queue: getVideoDestinationQueue() });
  });

  // Set next destination
  app.post("/api/daily-video/set-next", (req, res) => {
    const { destination, topic } = req.body;

    if (!destination) {
      return res.status(400).json({ error: "Destination required" });
    }

    setNextVideoDestination(destination, topic);
    res.json({
      success: true,
      message: `Next daily video set to: ${destination}`,
      status: getDailyVideoSchedulerStatus()
    });
  });

  // Clear custom next destination
  app.post("/api/daily-video/clear-next", (req, res) => {
    clearNextVideoDestination();
    res.json({
      success: true,
      message: "Reverted to automatic destination selection",
      status: getDailyVideoSchedulerStatus()
    });
  });

  // Trigger daily video now (manual)
  app.post("/api/daily-video/trigger", async (req, res) => {
    try {
      console.log("📹 Manual daily video trigger");
      await triggerDailyVideoNow();
      res.json({
        success: true,
        message: "Daily video triggered",
        status: getDailyVideoSchedulerStatus()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Keyword search endpoints
  app.post("/api/keywords/search", isAuthenticated, async (req, res) => {
    try {
      const { keyword, platforms = ['twitter', 'reddit'], strictMode = false } = req.body;

      if (!keyword || typeof keyword !== 'string') {
        return res.status(400).json({ error: "Keyword is required" });
      }

      const results = await keywordSearchEngine.searchAllPlatforms(keyword, platforms, strictMode);

      res.json({
        keyword,
        platforms,
        results: results.slice(0, 20), // Limit to 20 results
        totalFound: results.length
      });
    } catch (error) {
      console.error("Keyword search error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: "Keyword search failed",
        details: errorMessage,
        needsApiConfiguration: errorMessage.includes('not configured') || errorMessage.includes('missing credentials')
      });
    }
  });

  // Auto-reply to found posts
  app.post("/api/keywords/auto-reply", isAuthenticated, async (req, res) => {
    try {
      const { postId, platform, replyText } = req.body;

      if (!postId || !platform || !replyText) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      let success = false;

      if (platform === 'twitter') {
        success = await keywordSearchEngine.replyToTwitterPost(postId, replyText);
      } else if (platform === 'reddit') {
        success = await keywordSearchEngine.replyToRedditPost(postId, replyText);
      } else {
        return res.status(400).json({ error: "Unsupported platform for auto-reply" });
      }

      if (success) {
        res.json({ success: true, message: "Reply posted successfully" });
      } else {
        res.status(500).json({ error: "Failed to post reply" });
      }
    } catch (error) {
      console.error("Auto-reply error:", error);
      res.status(500).json({ error: "Failed to post auto-reply" });
    }
  });

  // Campaign keyword automation
  app.post("/api/campaigns/:id/auto-engage", isAuthenticated, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const { keywords = [], replyTemplate } = req.body;

      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const allResults = [];

      // Search for each keyword
      for (const keyword of keywords) {
        const results = await keywordSearchEngine.searchAllPlatforms(
          keyword,
          campaign.targetPlatforms
        );

        allResults.push(...results.map(r => ({
          ...r,
          keyword,
          campaignId
        })));
      }

      // For now, return the found posts for manual review
      // In full automation, this would auto-reply to relevant posts
      res.json({
        campaignId,
        keywords,
        foundPosts: allResults.slice(0, 50), // Limit results
        totalFound: allResults.length,
        message: `Found ${allResults.length} posts mentioning your keywords`
      });

    } catch (error) {
      console.error("Campaign auto-engage error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: "Campaign auto-engagement failed",
        details: errorMessage,
        needsApiConfiguration: errorMessage.includes('not configured') || errorMessage.includes('missing credentials')
      });
    }
  });

  // Postcard Drafts Endpoints

  // Generate AI Reply for Manual Post Creator
  app.post("/api/generate-reply", async (req, res) => {
    try {
      const { originalTweet, originalAuthor, strategy } = req.body;
      
      if (!originalTweet) {
        return res.status(400).json({ error: "Original tweet text is required" });
      }

      // Generate reply using the PostcardDrafter's AI methods
      const { reply, arenaUrl } = await postcardDrafter.generateManualReply(originalTweet, originalAuthor || "someone", strategy || "vibe_scout");
      
      res.json({ success: true, reply, arenaUrl });
    } catch (error) {
      console.error("Generate reply error:", error);
      res.status(500).json({ error: "Failed to generate reply" });
    }
  });

  // Generate AI Image for Manual Post Creator
  app.post("/api/generate-image", async (req, res) => {
    try {
      const { context, style, customPrompt } = req.body;
      
      // Generate image using Pollinations AI
      // Use custom prompt if provided, otherwise generate from context
      const imageUrl = await postcardDrafter.generateManualImage(
        context || "technology and coding",
        customPrompt
      );
      
      res.json({ success: true, imageUrl });
    } catch (error) {
      console.error("Generate image error:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });


  app.post("/api/postcard-drafts/:id/regenerate-text", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const newText = await postcardDrafter.regenerateReplyText(id);
      res.json({ success: true, draftText: newText });
    } catch (error) {
      console.error("Regenerate text error:", error);
      res.status(500).json({ error: "Failed to regenerate text" });
    }
  });

  app.post("/api/postcard-drafts/:id/regenerate-image", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const newImageUrl = await postcardDrafter.regenerateImage(id);
      res.json({ success: true, turaiImageUrl: newImageUrl });
    } catch (error) {
      console.error("Regenerate image error:", error);
      res.status(500).json({ error: "Failed to regenerate image" });
    }
  });

  app.post("/api/postcard-drafts/backfill-images", async (req, res) => {
    try {
      const draftsWithoutImages = await db.query.postcardDrafts.findMany({
        where: and(
          eq(postcardDrafts.status, "pending_review"),
          or(
            eq(postcardDrafts.turaiImageUrl, ""),
            isNull(postcardDrafts.turaiImageUrl)
          )
        ),
      });

      console.log(`🎨 Backfilling images for ${draftsWithoutImages.length} drafts...`);
      res.json({ 
        success: true, 
        message: `Started backfilling ${draftsWithoutImages.length} drafts`,
        count: draftsWithoutImages.length
      });

      let completed = 0;
      let failed = 0;
      for (const draft of draftsWithoutImages) {
        try {
          await postcardDrafter.regenerateImage(draft.id);
          completed++;
          console.log(`✅ Backfill ${completed}/${draftsWithoutImages.length}: Draft ${draft.id}`);
        } catch (err) {
          failed++;
          console.error(`❌ Backfill failed for draft ${draft.id}:`, err);
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log(`🎨 Backfill complete: ${completed} success, ${failed} failed`);
    } catch (error) {
      console.error("Backfill images error:", error);
      res.status(500).json({ error: "Failed to start backfill" });
    }
  });

  app.post("/api/sniper/draft-from-search", async (req, res) => {
    try {
      const { tweetId, authorHandle, text, campaignType } = req.body;

      if (!tweetId || !authorHandle || !text) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate campaign type if provided
      const validCampaigns = ['logicart', 'turai'];
      const campaign = validCampaigns.includes(campaignType) ? campaignType : getActiveCampaign();
      console.log(`📝 Creating draft from search for ${campaign} campaign`);

      // Return immediately, process in background (AI calls take 10-30s)
      res.json({ success: true, message: "Draft creation started", campaign });

      // Trigger the drafter in background (don't await)
      generateDraft({
        id: tweetId,
        text: text
      }, authorHandle, campaign, true).then(created => {
        if (created) {
          console.log(`✅ Draft created for tweet ${tweetId}`);
        } else {
          console.log(`⏭️ Draft skipped for tweet ${tweetId} (filtered or duplicate)`);
        }
      }).catch(err => {
        console.error(`❌ Draft creation failed for tweet ${tweetId}:`, err);
      });
    } catch (error) {
      console.error("Error creating draft from search:", error);
      res.status(500).json({ error: "Failed to create draft" });
    }
  });

  // Helper functions for fetching real-time metrics
  // Batch fetch function for metrics
  async function fetchTwitterMetricsBatch(tweetIds: string[]) {
    try {
      if (tweetIds.length === 0) return {};

      // Get stored Twitter credentials from database to match other services
      const twitterConnection = await storage.getPlatformConnection("twitter");
      const credentials = twitterConnection?.credentials;

      // Use env vars if DB is empty, otherwise prefer DB
      const appKey = (credentials?.apiKey && credentials.apiKey.trim() !== "") ? credentials.apiKey : process.env.TWITTER_API_KEY;
      const appSecret = (credentials?.apiSecret && credentials.apiSecret.trim() !== "") ? credentials.apiSecret : process.env.TWITTER_API_SECRET;
      const accessToken = (credentials?.accessToken && credentials.accessToken.trim() !== "") ? credentials.accessToken : process.env.TWITTER_ACCESS_TOKEN;
      const accessSecret = (credentials?.accessTokenSecret && credentials.accessTokenSecret.trim() !== "") ? credentials.accessTokenSecret : process.env.TWITTER_ACCESS_TOKEN_SECRET;

      if (!appKey || !appSecret || !accessToken || !accessSecret) {
        console.warn("Skipping metrics sync: No Twitter credentials found.");
        return {};
      }

      const twitterClient = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      });

      console.log(`[Metrics] Batch fetching for ${tweetIds.length} tweets...`);
      console.log(`[Metrics] Sample tweet IDs: ${tweetIds.slice(0, 3).join(', ')}...`);
      
      // Use v2.tweets to fetch up to 100 tweets at once
      const tweets = await twitterClient.v2.tweets(tweetIds, {
        'tweet.fields': ['public_metrics', 'created_at'],
      });

      console.log(`[Metrics] Twitter API response received. Data exists: ${!!tweets.data}, Errors: ${JSON.stringify(tweets.errors || [])}`);

      const metricsMap: Record<string, any> = {};

      if (tweets.data && Array.isArray(tweets.data)) {
        console.log(`[Metrics] Processing ${tweets.data.length} tweets from response`);
        for (const tweet of tweets.data) {
          const metrics = tweet.public_metrics;
          metricsMap[tweet.id] = {
            likes: metrics?.like_count || 0,
            retweets: metrics?.retweet_count || 0,
            replies: metrics?.reply_count || 0,
            quotes: metrics?.quote_count || 0,
            impressions: metrics?.impression_count || 0,
            bookmarks: metrics?.bookmark_count || 0,
            lastUpdatedAt: new Date().toISOString(),
          };
        }
      } else {
        console.warn(`[Metrics] No tweet data in response. tweets.data type: ${typeof tweets.data}`);
      }

      console.log(`[Metrics] Successfully built metrics map for ${Object.keys(metricsMap).length} tweets.`);
      return metricsMap;

    } catch (error) {
      console.error(`[Metrics] Error fetching batch Twitter metrics:`, error);
      throw error;
    }
  }

  async function fetchRedditMetrics(postId: string) {
    try {
      // Get Reddit credentials from storage
      const redditConnection = await storage.getPlatformConnection("reddit");

      if (!redditConnection?.credentials?.clientId || !redditConnection?.credentials?.username) {
        throw new Error("Reddit credentials not found");
      }

      const { clientId, clientSecret, username } = redditConnection.credentials;

      // Get Reddit access token
      const authResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret || ""}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "SocialVibe/1.0 by " + username,
        },
        body: "grant_type=client_credentials",
      });

      if (!authResponse.ok) {
        throw new Error(`Reddit auth failed: ${authResponse.statusText}`);
      }

      const authData = await authResponse.json();

      // Fetch post details
      const postResponse = await fetch(`https://oauth.reddit.com/by_id/${postId}`, {
        headers: {
          "Authorization": `Bearer ${authData.access_token}`,
          "User-Agent": "SocialVibe/1.0 by " + username,
        },
      });

      if (!postResponse.ok) {
        throw new Error(`Reddit API failed: ${postResponse.statusText}`);
      }

      const postData = await postResponse.json();
      const post = postData.data?.children?.[0]?.data;

      if (!post) {
        throw new Error("Post not found on Reddit");
      }

      return {
        upvotes: post.ups || 0,
        downvotes: post.downs || 0,
        score: post.score || 0,
        comments: post.num_comments || 0,
        upvoteRatio: post.upvote_ratio || 0,
        lastUpdatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error fetching Reddit metrics:", error);
      throw error;
    }
  }

  async function handlePostPublishing(postId: number, platforms: string[]) {
    let successCount = 0;
    let failureCount = 0;

    for (const platform of platforms) {
      try {
        switch (platform) {
          case "twitter":
            await publishToTwitter(postId);
            break;
          case "discord":
            await publishToDiscord(postId);
            break;
          case "reddit":
            await publishToReddit(postId);
            break;
        }

        successCount++;

        // Create analytics entry for the platform
        await storage.createPostAnalytics({
          postId,
          platform,
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
        });
      } catch (error) {
        console.error(`Failed to publish to ${platform}:`, error);
        failureCount++;
      }
    }

    // Update post status based on results
    if (successCount > 0 && failureCount === 0) {
      await storage.updatePost(postId, { status: "published" });
    } else if (successCount > 0 && failureCount > 0) {
      // Partial success - still mark as published but log the issues
      await storage.updatePost(postId, { status: "published" });
      console.log(`Post ${postId}: Published to ${successCount}/${platforms.length} platforms`);
    } else {
      // Total failure
      await storage.updatePost(postId, { status: "failed" });
    }
  }

  async function publishToTwitter(postId: number) {
    const post = await storage.getPost(postId);
    if (!post) throw new Error("Post not found");

    try {
      // Get stored Twitter credentials from database, fall back to env vars
      const twitterConnection = await storage.getPlatformConnection("twitter");
      const credentials = twitterConnection?.credentials || {};

      // Use database credentials if available, otherwise fall back to env vars
      const appKey = (credentials.apiKey && credentials.apiKey.trim() !== "") 
        ? credentials.apiKey : process.env.TWITTER_API_KEY!;
      const appSecret = (credentials.apiSecret && credentials.apiSecret.trim() !== "") 
        ? credentials.apiSecret : process.env.TWITTER_API_SECRET!;
      const accessToken = (credentials.accessToken && credentials.accessToken.trim() !== "") 
        ? credentials.accessToken : process.env.TWITTER_ACCESS_TOKEN!;
      const accessSecret = (credentials.accessTokenSecret && credentials.accessTokenSecret.trim() !== "") 
        ? credentials.accessTokenSecret : process.env.TWITTER_ACCESS_TOKEN_SECRET!;

      if (!appKey || !appSecret || !accessToken || !accessSecret) {
        throw new Error("Twitter API credentials not configured - check settings or environment variables");
      }

      // Initialize Twitter API client
      const twitterClient = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      });

      // Handle media upload - support both legacy mediaUrl and new mediaUrls array
      const mediaIds: string[] = [];
      const mediaUrlsToUpload: string[] = [];
      
      // Gather all media URLs (support both old and new format)
      if ((post as any).mediaUrls && Array.isArray((post as any).mediaUrls)) {
        mediaUrlsToUpload.push(...(post as any).mediaUrls);
      } else if (post.mediaUrl) {
        mediaUrlsToUpload.push(post.mediaUrl);
      }

      // Upload up to 4 media files (Twitter limit)
      for (const mediaUrl of mediaUrlsToUpload.slice(0, 4)) {
        console.log(`Uploading media from: ${mediaUrl}`);
        try {
          let buffer: Buffer;
          let mimeType = 'image/jpeg';

          if (mediaUrl.startsWith('http')) {
            const response = await fetch(mediaUrl);
            if (!response.ok) throw new Error(`Failed to download media: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            const contentType = response.headers.get('content-type');
            if (contentType) mimeType = contentType;
          } else if (mediaUrl.startsWith('/generated-images/') || mediaUrl.startsWith('/uploads/')) {
            const fs = await import('fs/promises');
            const path = await import('path');
            const localPath = path.join(process.cwd(), 'public', mediaUrl);
            buffer = await fs.readFile(localPath);
            const ext = mediaUrl.toLowerCase();
            if (ext.endsWith('.png')) mimeType = 'image/png';
            else if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mimeType = 'image/jpeg';
            else if (ext.endsWith('.gif')) mimeType = 'image/gif';
            else if (ext.endsWith('.mp4')) mimeType = 'video/mp4';
            else if (ext.endsWith('.mov')) mimeType = 'video/quicktime';
            else if (ext.endsWith('.webm')) mimeType = 'video/webm';
          } else {
            console.warn(`Unsupported media URL format: ${mediaUrl}`);
            continue;
          }

          if (buffer.length > 0) {
            // Check if it's a video (needs chunked upload)
            let uploadedMediaId: string;
            if (mimeType.startsWith('video/')) {
              uploadedMediaId = await twitterClient.v1.uploadMedia(buffer, { mimeType, type: 'longvideo' });
            } else {
              uploadedMediaId = await twitterClient.v1.uploadMedia(buffer, { mimeType });
            }
            mediaIds.push(uploadedMediaId);
            console.log(`Media uploaded successfully, ID: ${uploadedMediaId}`);
          }
        } catch (mediaError) {
          console.error(`Media upload failed for ${mediaUrl}:`, mediaError);
          // Continue with other media if one fails
        }
      }

      // Post the tweet (with or without media)
      console.log(`Publishing to Twitter: ${post.content}`);
      const tweetOptions: any = {};
      if (mediaIds.length > 0) {
        tweetOptions.media = { media_ids: mediaIds };
      }
      const tweet = await twitterClient.v2.tweet(post.content, tweetOptions);

      if (tweet.data) {
        const tweetUrl = `https://twitter.com/user/status/${tweet.data.id}`;
        console.log(`Successfully posted tweet: ${tweetUrl}`);

        // Update platform data with real Twitter response
        await storage.updatePost(postId, {
          platformData: {
            ...(post.platformData as Record<string, any>),
            twitter: {
              id: tweet.data.id,
              tweetId: tweet.data.id, // Added for consistency with sniper flow
              url: tweetUrl,
              text: tweet.data.text,
              publishedAt: new Date().toISOString(),
            }
          } as any
        });

        // Create analytics entry for the tweet
        await storage.createPostAnalytics({
          postId,
          platform: "twitter",
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
        });
      } else {
        throw new Error("Failed to get tweet data from Twitter API");
      }
    } catch (error) {
      console.error("Twitter API Error:", error);
      throw new Error(`Failed to post to Twitter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function publishToDiscord(postId: number) {
    const post = await storage.getPost(postId);
    if (!post) throw new Error("Post not found");

    try {
      // Get stored Discord credentials from database
      const discordConnection = await storage.getPlatformConnection("discord");

      if (!discordConnection || !discordConnection.credentials) {
        throw new Error("Discord webhook URL not configured");
      }

      const { webhookUrl } = discordConnection.credentials;

      if (!webhookUrl) {
        throw new Error("Discord webhook URL is required");
      }

      // Send message to Discord via webhook
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: post.content,
          username: 'SocialVibe Bot',
          avatar_url: 'https://i.imgur.com/4M34hi2.png' // Optional bot avatar
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord webhook failed: ${response.status} - ${errorText}`);
      }

      // Discord webhooks don't return message data, so we create our own reference
      const messageId = `discord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await storage.updatePost(postId, {
        platformData: {
          ...(post.platformData as Record<string, any>),
          discord: {
            id: messageId,
            webhookUrl: webhookUrl,
            publishedAt: new Date().toISOString(),
            status: 'published'
          }
        } as any
      });

      console.log(`Successfully posted to Discord: ${post.content.substring(0, 50)}...`);
    } catch (error) {
      console.error("Discord API Error:", error);
      throw new Error(`Failed to post to Discord: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function publishToReddit(postId: number) {
    const post = await storage.getPost(postId);
    if (!post) throw new Error("Post not found");

    try {
      // Get stored Reddit credentials from database
      const redditConnection = await storage.getPlatformConnection("reddit");

      if (!redditConnection || !redditConnection.credentials) {
        throw new Error("Reddit API credentials not configured");
      }

      const { clientId, clientSecret, username, password, userAgent } = redditConnection.credentials;

      if (!clientId || !clientSecret || !username || !password) {
        throw new Error("Reddit API credentials incomplete");
      }

      // Use a proper User Agent if none provided
      const finalUserAgent = userAgent || `SocialVibe:v1.0.0 (by u/${username})`;

      // Get OAuth token
      const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': finalUserAgent,
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: username,
          password: password,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Reddit auth failed: ${tokenResponse.statusText}`);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Post to Reddit (submit to r/test or specified subreddit)
      const subreddit = 'test'; // Default subreddit for testing
      const title = post.content.length > 100 ? post.content.substring(0, 97) + '...' : post.content;

      console.log(`Publishing to Reddit r/${subreddit}: ${title}`);

      const submitResponse = await fetch('https://oauth.reddit.com/api/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': finalUserAgent,
        },
        body: new URLSearchParams({
          kind: 'self',
          sr: subreddit,
          title: title,
          text: post.content,
          api_type: 'json',
        }),
      });

      if (!submitResponse.ok) {
        throw new Error(`Reddit submission failed: ${submitResponse.statusText}`);
      }

      const submitData = await submitResponse.json();

      if (submitData.json && submitData.json.errors && submitData.json.errors.length > 0) {
        throw new Error(`Reddit API Error: ${submitData.json.errors[0][1]}`);
      }

      if (submitData.json && submitData.json.data) {
        const redditPost = submitData.json.data;
        const redditUrl = `https://www.reddit.com/r/${subreddit}/comments/${redditPost.id}/${redditPost.name}/`;

        console.log(`Successfully posted to Reddit: ${redditUrl}`);

        // Update platform data with real Reddit response
        await storage.updatePost(postId, {
          platformData: {
            ...(post.platformData as Record<string, any>),
            reddit: {
              id: redditPost.id,
              name: redditPost.name,
              url: redditUrl,
              subreddit: subreddit,
              title: title,
              publishedAt: new Date().toISOString(),
            }
          } as any
        });

        // Create analytics entry for the Reddit post
        await storage.createPostAnalytics({
          postId,
          platform: "reddit",
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
        });
      } else {
        throw new Error("Failed to get Reddit post data");
      }
    } catch (error) {
      console.error("Reddit API Error:", error);
      throw new Error(`Failed to post to Reddit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  // Postcard Drafts (Sniper Queue)
  app.get("/api/postcard-drafts", async (req, res) => {
    try {
      const drafts = await storage.getPostcardDrafts();
      // Filter for high-quality pending drafts (score >= 80)
      // Lower quality leads are auto-discarded, premium leads are shown or auto-published
      const pendingDrafts = drafts.filter(d =>
        (d.status === "pending_review" || d.status === "pending_retry") &&
        (d.score || 0) >= 80
      );
      res.json(pendingDrafts);
    } catch (error) {
      console.error("Error fetching postcard drafts:", error);
      // Assuming 'fs' is imported at the top level or available globally in the environment
      // If not, 'import fs from 'fs';' would be needed at the top of the file.
      fs.appendFileSync('publish_error.log', `[${new Date().toISOString()}] - Error: ${JSON.stringify(error)}\n${error instanceof Error ? error.stack : ''}\n`);
      res.status(500).json({ message: "Failed to fetch drafts" });
    }
  });

  // Top 10 Drafts - MUST be defined BEFORE parameterized routes like /:id/approve
  app.get("/api/postcard-drafts/top", async (req, res) => {
    try {
      console.log("[TOP 10] Fetching top drafts...");
      const limit = parseInt(req.query.limit as string) || 10;
      const drafts = await storage.getPostcardDrafts();
      console.log(`[TOP 10] Total drafts from storage: ${drafts.length}`);
      
      // Filter for pending drafts and sort by score descending
      const topDrafts = drafts
        .filter(d => d.status === "pending_review" || d.status === "pending_retry")
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit);
      
      console.log(`[TOP 10] Returning ${topDrafts.length} top drafts`);
      res.json(topDrafts);
    } catch (error) {
      console.error("Error fetching top drafts:", error);
      res.status(500).json({ message: "Failed to fetch top drafts" });
    }
  });

  // Bulk Approve - MUST be defined BEFORE parameterized routes
  app.post("/api/postcard-drafts/bulk-approve", async (req, res) => {
    try {
      const { ids } = req.body;
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }
      
      const results: { id: number; success: boolean; tweetId?: string; error?: string }[] = [];
      
      for (const id of ids) {
        try {
          const draft = await storage.getPostcardDraft(id);
          
          if (!draft) {
            results.push({ id, success: false, error: "Draft not found" });
            continue;
          }
          
          if (draft.status !== "pending_review" && draft.status !== "pending_retry") {
            results.push({ id, success: false, error: "Draft is not pending" });
            continue;
          }
          
          // Publish the draft
          const result = await publishDraft(draft);
          
          if (result.success) {
            await storage.updatePostcardDraft(id, {
              status: "published",
              publishedAt: new Date(),
              tweetId: result.tweetId,
            });
            
            // Create a record in the main posts table for history
            await storage.createPost({
              userId: "system",
              content: draft.draftReplyText || "",
              platforms: ["twitter"],
              status: "published",
              platformData: {
                twitter: {
                  tweetId: result.tweetId,
                  replyingTo: draft.originalAuthorHandle,
                  url: `https://twitter.com/CodeWizard_AI/status/${result.tweetId}`,
                }
              }
            });
            
            results.push({ id, success: true, tweetId: result.tweetId });
            console.log(`✅ Bulk sent ${id} -> Tweet ${result.tweetId}`);
          } else {
            const errorMsg = result.error || "Unknown publish error";
            await storage.updatePostcardDraft(id, { 
              status: "failed",
              lastError: errorMsg,
              publishAttempts: 1
            });
            results.push({ id, success: false, error: errorMsg });
            console.log(`❌ Bulk send failed ${id}: ${errorMsg}`);
          }
          
          // Rate limit protection: wait 3 seconds between sends
          if (ids.indexOf(id) < ids.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } catch (error) {
          results.push({ id, success: false, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      res.json({ results, successCount, failCount });
    } catch (error) {
      console.error("Error in bulk approve:", error);
      res.status(500).json({ message: "Failed to bulk approve drafts" });
    }
  });

  app.post("/api/postcard-drafts/:id/approve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const draft = await storage.getPostcardDraft(id);

      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }

      if (draft.status !== "pending_review") {
        return res.status(400).json({ message: "Draft is not pending review" });
      }

      // Update draft text if provided
      const { text } = req.body;
      if (text) {
        draft.draftReplyText = text;
        await storage.updatePostcardDraft(id, { draftReplyText: text });
      }

      // Publish the draft
      const result = await publishDraft(draft);

      if (result.success) {
        await storage.updatePostcardDraft(id, {
          status: "published",
          publishedAt: new Date(),
          tweetId: result.tweetId, // Store for analytics tracking
        });

        // Create a record in the main posts table for history
        await storage.createPost({
          userId: "system", // or the user's ID if available
          content: draft.draftReplyText || "",
          platforms: ["twitter"],
          status: "published",
          publishedAt: new Date(),
          platformData: {
            twitter: {
              url: `https://twitter.com/user/status/${result.tweetId}`,
              tweetId: result.tweetId,
              replyingTo: draft.originalAuthorHandle
            }
          } as any
        } as any);

        res.json({ message: "Draft published successfully", tweetId: result.tweetId });
      } else {
        // Track publish attempts for retry mechanism
        const attempts = (draft.publishAttempts || 0) + 1;
        const isRateLimitError = result.error?.includes('429') || result.error?.includes('rate limit');

        if (attempts < 3 && isRateLimitError) {
          // Rate limit error - allow retry
          await storage.updatePostcardDraft(id, {
            status: "pending_retry",
            publishAttempts: attempts,
            lastError: result.error
          });
          res.status(429).json({
            message: "Rate limited by Twitter. Draft queued for retry.",
            error: result.error,
            attempts: attempts,
            canRetry: true
          });
        } else if (attempts >= 3) {
          // Max retries exceeded - permanent failure
          await storage.updatePostcardDraft(id, {
            status: "failed",
            publishAttempts: attempts,
            lastError: result.error
          });
          res.status(500).json({
            message: "Failed to publish after 3 attempts",
            error: result.error,
            attempts: attempts,
            canRetry: false
          });
        } else {
          // Other error - immediate failure
          await storage.updatePostcardDraft(id, {
            status: "failed",
            publishAttempts: attempts,
            lastError: result.error
          });
          res.status(500).json({ message: "Failed to publish draft", error: result.error });
        }
      }
    } catch (error) {
      console.error("Error approving draft:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: `Failed to approve draft: ${errorMessage}` });
    }
  });

  app.post("/api/postcard-drafts/:id/reject", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.updatePostcardDraft(id, { status: "rejected" });
      res.json({ message: "Draft rejected" });
    } catch (error) {
      console.error("Error rejecting draft:", error);
      res.status(500).json({ message: "Failed to reject draft" });
    }
  });

  app.patch("/api/postcard-drafts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { draftReplyText } = req.body;

      if (!draftReplyText) {
        return res.status(400).json({ message: "draftReplyText is required" });
      }

      const updated = await storage.updatePostcardDraft(id, { draftReplyText });
      res.json(updated);
    } catch (error) {
      console.error("Error updating draft:", error);
      res.status(500).json({ message: "Failed to update draft" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

