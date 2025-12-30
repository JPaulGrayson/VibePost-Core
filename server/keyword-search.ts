import { TwitterApi } from 'twitter-api-v2';
import { storage } from './storage';

interface SearchResult {
  platform: string;
  id: string;
  author: string;
  content: string;
  url: string;
  createdAt: Date;
  score?: number;
  metadata?: {
    likes?: number;
    replies?: number;
    shares?: number;
    views?: number;
  };
}

export class KeywordSearchEngine {
  private calculateRelevanceScore(content: string, createdAt: Date, replies: number = 0): number {
    let score = 100;
    const lowerContent = content.toLowerCase();
    const now = new Date();
    const hoursOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    // 1. Recency Decay (Freshness is key for leads)
    // Lose 2 points per hour, max 50 points lost
    score -= Math.min(50, hoursOld * 2);

    // 2. Intent Bonuses (high-intent signals)
    if (content.includes("?")) score += 20; // Questions are high intent
    if (lowerContent.includes("recommend") || lowerContent.includes("suggestion")) score += 15;
    if (lowerContent.includes("help") || lowerContent.includes("advice")) score += 15;
    if (lowerContent.includes("plan") || lowerContent.includes("trip")) score += 10;
    if (lowerContent.includes("itinerary")) score += 15; // Very high intent
    if (lowerContent.includes("budget") || lowerContent.includes("cost")) score += 10;
    if (lowerContent.includes("first time")) score += 15; // First-timers need guidance

    // 3. Opportunity Score (Low replies = better opportunity to be seen)
    // Enhanced: Give bigger bonus to truly unanswered questions
    if (replies === 0) score += 25; // Huge bonus for unanswered - first mover advantage!
    else if (replies <= 2) score += 15; // Low competition
    else if (replies <= 5) score += 5;  // Moderate
    else if (replies > 10) score -= 20; // Too crowded - harder to be seen
    else if (replies > 50) score -= 40; // Very crowded - probably viral, skip

    return Math.round(score);
  }

  private async getTwitterClient(): Promise<TwitterApi | null> {
    try {
      // Get stored Twitter credentials from database
      // Get stored Twitter credentials from database
      const twitterConnection = await storage.getPlatformConnection("twitter");
      const credentials = twitterConnection?.credentials;

      // Check for env vars first
      const hasEnvVars = process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET;

      if ((!twitterConnection || !credentials || Object.keys(credentials).length === 0) && !hasEnvVars) {
        console.log('No stored credentials and no env vars, cannot search X without authentication');
        return null;
      }

      // Use OAuth 1.0a User Context authentication
      // Prioritize .env for testing, fallback to DB
      // Treat empty strings in DB as undefined
      const apiKey = process.env.TWITTER_API_KEY || (credentials?.apiKey && credentials.apiKey.trim() !== "" ? credentials.apiKey : undefined);
      const apiSecret = process.env.TWITTER_API_SECRET || (credentials?.apiSecret && credentials.apiSecret.trim() !== "" ? credentials.apiSecret : undefined);
      const accessToken = process.env.TWITTER_ACCESS_TOKEN || (credentials?.accessToken && credentials.accessToken.trim() !== "" ? credentials.accessToken : undefined);
      const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET || (credentials?.accessTokenSecret && credentials.accessTokenSecret.trim() !== "" ? credentials.accessTokenSecret : undefined);

      if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        console.log('No Twitter credentials found in DB or .env');
        return null;
      }

      console.log('Using OAuth 1.0a User Context authentication for X search');
      return new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken: accessToken,
        accessSecret: accessSecret,
      });
    } catch (error) {
      console.error('Failed to get Twitter client:', error);
      return null;
    }
  }

  private buildTravelQuery(city: string): string {
    const BASE_FILTERS = " -is:retweet -is:reply -is:quote lang:en";
    const SPAM_FILTERS = " -giveaway -win -crypto -bot -deal -discount";

    // Intent-based phrasing
    const intents = [
      `"planning a trip to ${city}"`,
      `"recommendations for ${city}"`,
      `"anyone been to ${city}"`,
      `"visiting ${city}"`,
      `"best restaurants in ${city}"`,
      `"must see in ${city}"`
    ].join(" OR ");

    return `(${intents}) ${BASE_FILTERS} ${SPAM_FILTERS}`;
  }

  async searchTwitter(keyword: string, maxResults: number = 10, strictMode: boolean = false): Promise<SearchResult[]> {
    const twitterClient = await this.getTwitterClient();

    if (!twitterClient) {
      throw new Error('X/Twitter API not available for keyword search.');
    }

    try {
      // Use v2 search API recent endpoint
      const query = strictMode ? this.buildTravelQuery(keyword) : keyword;
      console.log(`Searching X using v2 API for query: ${query} (Strict: ${strictMode})`);

      const searchResults = await twitterClient.v2.search(query, {
        max_results: Math.max(10, Math.min(maxResults, 100)), // v2 API requires 10-100
        'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
        'user.fields': ['username'],
        expansions: ['author_id']
      });

      const results: SearchResult[] = [];

      // Get data from the search results - handle both array and object responses
      let tweets: any[] = [];
      let users: any[] = [];

      if (Array.isArray(searchResults.data)) {
        tweets = searchResults.data;
      } else if (searchResults.data && Array.isArray(searchResults.data.data)) {
        tweets = searchResults.data.data;
        users = searchResults.data.includes?.users || [];
      } else if (searchResults.data) {
        tweets = [searchResults.data];
      }

      if (searchResults.includes?.users) {
        users = searchResults.includes.users;
      }

      console.log(`Found ${tweets.length} tweets and ${users.length} users`);

      const SPAM_KEYWORDS = ["giveaway", "nft", "crypto", "win", "contest", "airdrop", "whitelist", "mint"];
      let filteredCount = 0;

      for (const tweet of tweets) {
        const author = users.find((user: any) => user.id === tweet.author_id);
        const text = tweet.text.toLowerCase();

        // 1. Filter out spam keywords (even in strict mode, extra safety)
        if (SPAM_KEYWORDS.some(keyword => text.includes(keyword))) {
          filteredCount++;
          continue;
        }

        // 2. Filter out hashtag stuffing (more than 5 hashtags)
        const hashtagCount = (tweet.text.match(/#/g) || []).length;
        if (hashtagCount > 5) {
          filteredCount++;
          continue;
        }

        // 3. Filter out replies (if it's a reply, it usually starts with @)
        // Note: A better way is checking in_reply_to_user_id but we didn't request that field. 
        // For now, simple heuristic: if it starts with @ and isn't a self-thread, skip.
        if (tweet.text.startsWith("@")) {
          filteredCount++;
          continue;
        }

        // 4. Filter out brand/promotional accounts
        const authorUsername = (author?.username || '').toLowerCase();
        const authorName = (author?.name || '').toLowerCase();
        const authorDescription = (author?.description || '').toLowerCase();

        // Brand indicators in username or name
        const BRAND_KEYWORDS = [
          'travel', 'tours', 'agency', 'booking', 'hotel', 'resort',
          'official', 'promo', 'deals', 'discount', 'airline',
          'cruises', 'vacations', 'holidays', 'getaway'
        ];

        const isBrandAccount = BRAND_KEYWORDS.some(keyword =>
          authorUsername.includes(keyword) ||
          authorName.includes(keyword) ||
          authorDescription.includes(keyword)
        );

        if (isBrandAccount) {
          console.log(`Skipping brand account: @${author?.username}`);
          filteredCount++;
          continue;
        }

        const createdAt = new Date(tweet.created_at || new Date());
        const metrics = tweet.public_metrics || {};
        const replyCount = metrics.reply_count || 0;

        // Calculate base score
        let score = this.calculateRelevanceScore(tweet.text, createdAt, replyCount);

        // 5. Adjust score based on account size (prioritize real people)
        const followerCount = author?.public_metrics?.followers_count || 0;
        if (followerCount < 500) score += 15;       // Small account = likely real person
        else if (followerCount < 1000) score += 10; // Still small
        else if (followerCount > 50000) score -= 15; // Influencer - less likely to engage
        else if (followerCount > 100000) score -= 25; // Big influencer - skip

        results.push({
          platform: 'twitter',
          id: tweet.id,
          author: author?.username || 'unknown',
          content: tweet.text,
          url: `https://twitter.com/${author?.username || 'unknown'}/status/${tweet.id}`,
          createdAt: createdAt,
          score: Math.round(score),
          metadata: {
            likes: metrics.like_count,
            replies: metrics.reply_count,
            shares: metrics.retweet_count,
            views: metrics.impression_count
          }
        });
      }

      console.log(`Filtered out ${filteredCount} low-quality/spam tweets.`);

      return results;
    } catch (error: any) {
      console.error('Twitter search error:', error);

      // Check for usage cap exceeded in API response
      if (error.data && error.data.title === 'UsageCapExceeded') {
        throw new Error('X API search blocked: Your app needs to be associated with a Twitter Developer Project. AIDebate works because its app is Project-associated. Check Twitter Developer Portal > Projects > Associate your app.');
      }

      // Provide specific error messages for common issues
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error('X API search requires elevated permissions. Your posting works but search needs Academic Research or Premium access. Contact X for search API access.');
        } else if (error.message.includes('403')) {
          throw new Error('Twitter API access forbidden. Your app may not have the required permissions for search. Check your Twitter Developer Portal settings.');
        } else if (error.message.includes('429')) {
          throw new Error('X API rate limit exceeded. Please wait a few minutes before trying again.');
        }
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Twitter API error: ${errorMessage}`);
    }
  }

  async searchReddit(keyword: string, subreddit?: string, maxResults: number = 10): Promise<SearchResult[]> {
    try {
      // Use Reddit's JSON API (no auth required for public posts)
      const searchUrl = subreddit
        ? `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=${maxResults}`
        : `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=${maxResults}`;

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'VibeAppZ/1.0'
        }
      });

      if (!response.ok) {
        let errorMessage = `Reddit API failed: ${response.status} ${response.statusText}`;

        if (response.status === 403) {
          errorMessage = 'Reddit API blocked this request. Reddit may be limiting automated searches or your IP may be flagged. Try again later or consider using Reddit API credentials.';
        } else if (response.status === 429) {
          errorMessage = 'Reddit API rate limit exceeded. Please wait a few minutes before trying again.';
        } else if (response.status === 401) {
          errorMessage = 'Reddit API authentication required. Some searches may need proper API credentials.';
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      for (const post of data.data?.children || []) {
        const postData = post.data;
        const createdAt = new Date(postData.created_utc * 1000);
        const replyCount = postData.num_comments || 0;

        results.push({
          platform: 'reddit',
          id: postData.id,
          author: postData.author,
          content: postData.title + (postData.selftext ? '\n\n' + postData.selftext : ''),
          url: `https://reddit.com${postData.permalink}`,
          createdAt: createdAt,
          score: this.calculateRelevanceScore(postData.title, createdAt, replyCount),
          metadata: {
            likes: postData.score,
            replies: postData.num_comments
          }
        });
      }

      return results;
    } catch (error) {
      console.error('Reddit search error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Reddit API error: ${errorMessage}`);
    }
  }

  async searchDiscord(keyword: string): Promise<SearchResult[]> {
    // Discord doesn't have a public search API, so this would require bot integration
    throw new Error('Discord search not implemented - requires Discord bot integration with server access');
  }

  async searchAllPlatforms(keyword: string, platforms: string[] = ['twitter', 'reddit'], strictMode: boolean = false): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];
    const errors: string[] = [];

    // Search Twitter if requested
    if (platforms.includes('twitter')) {
      try {
        const twitterResults = await this.searchTwitter(keyword, 10, strictMode);
        allResults.push(...twitterResults);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown Twitter error';
        errors.push(`Twitter: ${errorMsg}`);
      }
    }

    // Search Reddit if requested
    if (platforms.includes('reddit')) {
      // Updated to relevant travel subreddits
      const subreddits = ['travel', 'solotravel', 'Paris', 'JapanTravel', 'digitalnomad'];

      for (const subreddit of subreddits) {
        try {
          const redditResults = await this.searchReddit(keyword, subreddit);
          allResults.push(...redditResults);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown Reddit error';
          errors.push(`Reddit (r/${subreddit}): ${errorMsg}`);
        }
      }
    }

    // Search Discord if requested
    if (platforms.includes('discord')) {
      try {
        const discordResults = await this.searchDiscord(keyword);
        allResults.push(...discordResults);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown Discord error';
        errors.push(`Discord: ${errorMsg}`);
      }
    }

    // If we have no results but have errors, throw the actual errors
    if (allResults.length === 0 && errors.length > 0) {
      throw new Error(`Search failed on all platforms:\n${errors.join('\n')}`);
    }

    // If we have some results but also errors, log the errors but return results
    if (errors.length > 0) {
      console.warn(`Some searches failed: ${errors.join('; ')}`);
    }

    // Deduplicate results by ID (prevent same post from appearing multiple times if cross-posted or fetched twice)
    const uniqueResults = Array.from(new Map(allResults.map(item => [item.id, item])).values());

    // Sort by Relevance Score (descending)
    return uniqueResults.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  async replyToTwitterPost(postId: string, replyText: string): Promise<boolean> {
    const twitterClient = await this.getTwitterClient();

    if (!twitterClient) {
      console.log('Twitter API not configured');
      return false;
    }

    try {
      await twitterClient.v2.reply(replyText, postId);
      return true;
    } catch (error) {
      console.error('Twitter reply error:', error);
      return false;
    }
  }

  async fetchTweetReplies(tweetId: string, maxResults: number = 10): Promise<SearchResult[]> {
    const twitterClient = await this.getTwitterClient();

    if (!twitterClient) {
      console.log('Twitter API not configured for fetching replies');
      return [];
    }

    try {
      console.log(`🔍 Fetching replies to tweet ${tweetId}...`);

      const query = `conversation_id:${tweetId} is:reply -is:retweet`;

      const searchResults = await twitterClient.v2.search(query, {
        max_results: Math.max(10, Math.min(maxResults, 100)),
        'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'in_reply_to_user_id'],
        'user.fields': ['username', 'public_metrics', 'description'],
        expansions: ['author_id']
      });

      const results: SearchResult[] = [];

      let tweets: any[] = [];
      let users: any[] = [];

      if (Array.isArray(searchResults.data)) {
        tweets = searchResults.data;
      } else if (searchResults.data && Array.isArray(searchResults.data.data)) {
        tweets = searchResults.data.data;
        users = searchResults.data.includes?.users || [];
      } else if (searchResults.data) {
        tweets = [searchResults.data];
      }

      if (searchResults.includes?.users) {
        users = searchResults.includes.users;
      }

      console.log(`   Found ${tweets.length} replies to tweet ${tweetId}`);

      const BOT_INDICATORS = ['bot', 'auto', 'spam', 'promo', 'deals', 'crypto', 'nft'];

      for (const tweet of tweets) {
        const author = users.find((user: any) => user.id === tweet.author_id);
        const authorUsername = (author?.username || '').toLowerCase();
        const authorDescription = (author?.description || '').toLowerCase();

        if (BOT_INDICATORS.some(indicator => 
          authorUsername.includes(indicator) || authorDescription.includes(indicator)
        )) {
          continue;
        }

        if ((tweet.text.match(/#/g) || []).length > 5) {
          continue;
        }

        const createdAt = new Date(tweet.created_at || new Date());
        const metrics = tweet.public_metrics || {};

        let score = 50;
        const lowerText = tweet.text.toLowerCase();

        if (tweet.text.includes("?")) score += 15;
        if (lowerText.includes("recommend") || lowerText.includes("suggest")) score += 10;
        if (lowerText.includes("visit") || lowerText.includes("trip")) score += 10;
        if (lowerText.includes("love") || lowerText.includes("amazing")) score += 5;

        const followerCount = author?.public_metrics?.followers_count || 0;
        if (followerCount >= 100 && followerCount < 5000) score += 15;
        else if (followerCount < 100) score += 5;
        else if (followerCount > 50000) score -= 10;

        if (metrics.like_count > 0) score += 5;
        if (metrics.reply_count > 0) score += 5;

        results.push({
          platform: 'twitter',
          id: tweet.id,
          author: author?.username || 'unknown',
          content: tweet.text,
          url: `https://twitter.com/${author?.username || 'unknown'}/status/${tweet.id}`,
          createdAt: createdAt,
          score: Math.round(score),
          metadata: {
            likes: metrics.like_count,
            replies: metrics.reply_count,
            shares: metrics.retweet_count,
            views: metrics.impression_count
          }
        });
      }

      return results.sort((a, b) => (b.score || 0) - (a.score || 0));
    } catch (error: any) {
      console.error('Error fetching tweet replies:', error);
      return [];
    }
  }

  async replyToRedditPost(postId: string, replyText: string): Promise<boolean> {
    // Reddit replies require OAuth and more complex setup
    console.log('Reddit replies not implemented - requires OAuth setup');
    return false;
  }
}

export const keywordSearchEngine = new KeywordSearchEngine();