import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { TwitterApi } from "twitter-api-v2";
import { storage } from "./storage";
import { insertPostSchema, insertPlatformConnectionSchema, insertCampaignSchema, Platform, PostStatus } from "@shared/schema";
import { keywordSearchEngine } from "./keyword-search";

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
      if (platformData.twitter?.id) {
        try {
          const twitterMetrics = await fetchTwitterMetrics(platformData.twitter.id);
          updatedMetrics.twitter = { ...platformData.twitter, ...twitterMetrics };
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

      for (const post of posts) {
        if (!post.platformData) continue;

        try {
          const platformData = post.platformData as any;
          const updatedMetrics: any = {};

          // Sync Twitter metrics
          if (platformData.twitter?.id) {
            try {
              const twitterMetrics = await fetchTwitterMetrics(platformData.twitter.id);
              updatedMetrics.twitter = { ...platformData.twitter, ...twitterMetrics };
            } catch (error) {
              console.error(`Failed to fetch Twitter metrics for post ${post.id}:`, error);
            }
          }

          // Sync Reddit metrics
          if (platformData.reddit?.id) {
            try {
              const redditMetrics = await fetchRedditMetrics(platformData.reddit.id);
              updatedMetrics.reddit = { ...platformData.reddit, ...redditMetrics };
            } catch (error) {
              console.error(`Failed to fetch Reddit metrics for post ${post.id}:`, error);
            }
          }

          // Update post with new metrics
          await storage.updatePost(post.id, {
            platformData: {
              ...platformData,
              ...updatedMetrics,
              lastSyncedAt: new Date().toISOString(),
            },
          });

          results.push({ postId: post.id, success: true, metrics: updatedMetrics });
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
  app.get("/api/platforms/twitter/test", async (req, res) => {
    try {
      // Get stored Twitter credentials from database (same as other functions)
      const twitterConnection = await storage.getPlatformConnection("twitter");

      if (!twitterConnection || !twitterConnection.credentials || Object.keys(twitterConnection.credentials).length === 0) {
        return res.status(400).json({
          success: false,
          message: "Twitter API credentials not configured. Please add your Twitter API credentials in Settings.",
        });
      }

      const credentials = twitterConnection.credentials;

      // Use OAuth 1.0a User Context authentication (same as successful AIDebate app)
      const twitterClient = new TwitterApi({
        appKey: credentials.apiKey,
        appSecret: credentials.apiSecret,
        accessToken: credentials.accessToken,
        accessSecret: credentials.accessTokenSecret,
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

  // Keyword search endpoints
  app.post("/api/keywords/search", isAuthenticated, async (req, res) => {
    try {
      const { keyword, platforms = ['twitter', 'reddit'] } = req.body;

      if (!keyword || typeof keyword !== 'string') {
        return res.status(400).json({ error: "Keyword is required" });
      }

      const results = await keywordSearchEngine.searchAllPlatforms(keyword, platforms);

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
  app.get("/api/postcard-drafts", async (req, res) => {
    try {
      const drafts = await storage.getPostcardDrafts();
      res.json(drafts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch drafts" });
    }
  });

  app.post("/api/postcard-drafts/:id/approve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const draft = await storage.getPostcardDraft(id);
      if (!draft) return res.status(404).json({ error: "Draft not found" });

      // Update status to approved
      await storage.updatePostcardDraft(id, { status: "approved" });

      // Trigger publishing
      const success = await keywordSearchEngine.replyToTwitterPost(draft.originalTweetId, draft.draftText);

      if (success) {
        await storage.updatePostcardDraft(id, { status: "published" });
        res.json({ success: true, message: "Published successfully" });
      } else {
        await storage.updatePostcardDraft(id, { status: "failed" });
        res.status(500).json({ error: "Failed to publish to Twitter" });
      }

    } catch (error) {
      res.status(500).json({ error: "Failed to approve draft" });
    }
  });

  app.post("/api/postcard-drafts/:id/reject", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.updatePostcardDraft(id, { status: "rejected" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reject draft" });
    }
  });

  app.patch("/api/postcard-drafts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { draftText } = req.body;
      await storage.updatePostcardDraft(id, { draftText });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update draft" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper functions for fetching real-time metrics
async function fetchTwitterMetrics(tweetId: string) {
  try {
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY || "36nXSUbfuzNyoLxEztzsDpgGW",
      appSecret: process.env.TWITTER_API_SECRET || "6qYmel81UoJQWoBQ3Pzdym2iQC3FP2936i2yi4LlswSf6b49hk",
      accessToken: process.env.TWITTER_ACCESS_TOKEN || "2885704441-S5x5tTuj1dAiPeamgNCLXjRCDJYAEuAUuOn0Brz",
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || "Y1BwEQPX6Swn4dA2iMmoLfBmxn73QBUVFJtrxLLF0AtWj",
    });

    // Fetch tweet details with public metrics
    const tweet = await twitterClient.v2.singleTweet(tweetId, {
      'tweet.fields': ['public_metrics', 'created_at'],
    });

    const metrics = tweet.data.public_metrics;

    return {
      likes: metrics?.like_count || 0,
      retweets: metrics?.retweet_count || 0,
      replies: metrics?.reply_count || 0,
      quotes: metrics?.quote_count || 0,
      impressions: metrics?.impression_count || 0,
      bookmarks: metrics?.bookmark_count || 0,
      lastUpdatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching Twitter metrics:", error);
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
          ...post.platformData,
          twitter: {
            id: tweet.data.id,
            url: tweetUrl,
            text: tweet.data.text,
            publishedAt: new Date().toISOString(),
          }
        }
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
        ...post.platformData,
        discord: {
          id: messageId,
          webhookUrl: webhookUrl,
          publishedAt: new Date().toISOString(),
          status: 'published'
        }
      }
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
          ...post.platformData,
          reddit: {
            id: redditPost.id,
            name: redditPost.name,
            url: redditUrl,
            subreddit: subreddit,
            title: title,
            publishedAt: new Date().toISOString(),
          }
        }
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
