import type { Express } from "express";
import { createServer, type Server } from "http";
import * as path from "path";
import * as fs from "fs";
import { z } from "zod";
import { TwitterApi } from "twitter-api-v2";
import { storage } from "./storage";
import { insertPostSchema, insertPlatformConnectionSchema, insertCampaignSchema, Platform, PostStatus } from "@shared/schema";
import { keywordSearchEngine } from "./keyword-search";
import { postcardDrafter, generateDraft } from "./services/postcard_drafter";
import { publishDraft } from "./services/twitter_publisher";
import { sniperManager } from "./services/sniper_manager";
import { generateDailyPostcard, previewDailyPostcard, generatePostcardForDestination, getAvailableDestinations } from "./services/daily_postcard";
import { startDailyPostcardScheduler, getSchedulerStatus, triggerDailyPostcardNow } from "./services/daily_postcard_scheduler";
import { generateVideoSlideshow, getVideoDestinations, previewVideoSlideshow, listGeneratedVideos } from "./services/video_slideshow";
import { postThreadTour, previewThreadTour, getThreadTourDestinations, getTodaysThreadDestination, fetchFamousTours } from "./services/thread_tour";
import { getThreadTourSchedulerStatus, setNextThreadDestination, clearNextThreadDestination } from "./services/thread_tour_scheduler";
import { autoPublisher } from "./services/auto_publisher";
export async function registerRoutes(app: Express): Promise<Server> {
  // Simple authentication middleware
  const isAuthenticated = (req: any, res: any, next: any) => {
    // For now, always allow through for demo purposes
    // In production, this would check actual authentication
    next();
  };

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
      const posts = await storage.getPostsByStatus("published");
      const results = [];

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

      // 2. Fetch Twitter metrics in batches of 100 (API limit)
      let twitterMetricsMap: Record<string, any> = {};
      if (twitterIds.length > 0) {
        try {
          // Split into chunks of 100 (Twitter API limit)
          const chunkSize = 100;
          for (let i = 0; i < twitterIds.length; i += chunkSize) {
            const chunk = twitterIds.slice(i, i + chunkSize);
            console.log(`[Metrics] Fetching batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(twitterIds.length / chunkSize)} (${chunk.length} IDs)...`);
            const chunkMetrics = await fetchTwitterMetricsBatch(chunk);
            twitterMetricsMap = { ...twitterMetricsMap, ...chunkMetrics };
          }
        } catch (error) {
          console.error("Failed to fetch batch Twitter metrics:", error);
        }
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

      res.json({ success: true, results });
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

  // Manual Hunt Trigger (Debug) - now supports campaign type
  app.post("/api/debug/hunt", async (req, res) => {
    try {
      const { campaignType } = req.body; // Optional: 'turai' or 'logigo'
      console.log(`🎯 Manual hunt triggered via API${campaignType ? ` for campaign: ${campaignType}` : ''}`);
      const result = await sniperManager.forceHunt(campaignType);
      res.json({ success: true, message: "Hunt completed", result });
    } catch (error) {
      console.error("Manual hunt failed:", error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get current campaign configuration
  app.get("/api/sniper/campaign", (req, res) => {
    res.json({
      currentCampaign: sniperManager.getCampaign(),
      config: sniperManager.getCampaignConfig()
    });
  });

  // Set sniper campaign type
  app.post("/api/sniper/campaign", (req, res) => {
    try {
      const { campaignType } = req.body;
      if (!campaignType || !['turai', 'logigo'].includes(campaignType)) {
        return res.status(400).json({ error: "Invalid campaignType. Must be 'turai' or 'logigo'" });
      }
      sniperManager.setCampaign(campaignType);
      res.json({
        success: true,
        message: `Campaign switched to ${campaignType}`,
        config: sniperManager.getCampaignConfig()
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get all available campaign configs
  app.get("/api/sniper/campaigns", (req, res) => {
    const { CAMPAIGN_CONFIGS } = require("./campaign-config");
    res.json({
      campaigns: Object.values(CAMPAIGN_CONFIGS),
      currentCampaign: sniperManager.getCampaign()
    });
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

  app.post("/api/sniper/draft-from-search", async (req, res) => {
    try {
      const { tweetId, authorHandle, text } = req.body;

      if (!tweetId || !authorHandle || !text) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Trigger the drafter
      await generateDraft({
        id: tweetId,
        text: text
      }, authorHandle);

      res.json({ success: true, message: "Draft creation started" });
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
      // Use v2.tweets to fetch up to 100 tweets at once
      const tweets = await twitterClient.v2.tweets(tweetIds, {
        'tweet.fields': ['public_metrics', 'created_at'],
      });

      const metricsMap: Record<string, any> = {};

      if (tweets.data) {
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
      }

      console.log(`[Metrics] Successfully fetched metrics for ${Object.keys(metricsMap).length} tweets.`);
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
      // Get stored Twitter credentials from database (same as test function)
      const twitterConnection = await storage.getPlatformConnection("twitter");

      if (!twitterConnection || !twitterConnection.credentials || Object.keys(twitterConnection.credentials).length === 0) {
        throw new Error("Twitter API credentials not configured");
      }

      const credentials = twitterConnection.credentials;

      // Initialize Twitter API client with database credentials
      const twitterClient = new TwitterApi({
        appKey: credentials.apiKey,
        appSecret: credentials.apiSecret,
        accessToken: credentials.accessToken,
        accessSecret: credentials.accessTokenSecret,
      });

      // Post the tweet
      console.log(`Publishing to Twitter: ${post.content}`);
      const tweet = await twitterClient.v2.tweet(post.content);

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
      res.status(500).json({ message: "Failed to fetch drafts" });
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

  app.post("/api/postcard-drafts/:id/regenerate-image", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const newImageUrl = await postcardDrafter.regenerateImage(id);
      res.json({ imageUrl: newImageUrl });
    } catch (error) {
      console.error("Error regenerating image:", error);
      res.status(500).json({ message: "Failed to regenerate image" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

