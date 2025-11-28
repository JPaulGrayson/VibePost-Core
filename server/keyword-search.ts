import { TwitterApi } from 'twitter-api-v2';
import { storage } from './storage';

interface SearchResult {
  platform: string;
  id: string;
  author: string;
  content: string;
  url: string;
  createdAt: Date;
}

export class KeywordSearchEngine {
  private async getTwitterClient(): Promise<TwitterApi | null> {
    try {
      // Get stored Twitter credentials from database
      const twitterConnection = await storage.getPlatformConnection("twitter");

      if (!twitterConnection || !twitterConnection.credentials || Object.keys(twitterConnection.credentials).length === 0) {
        console.log('No stored credentials, cannot search X without authentication');
        return null;
      }

      const credentials = twitterConnection.credentials;

      // Use OAuth 1.0a User Context authentication (same as successful AIDebate app)
      console.log('Using OAuth 1.0a User Context authentication for X search');
      return new TwitterApi({
        appKey: credentials.apiKey,
        appSecret: credentials.apiSecret,
        accessToken: credentials.accessToken,
        accessSecret: credentials.accessTokenSecret,
      });
    } catch (error) {
      console.error('Failed to get Twitter client:', error);
      return null;
    }
  }

  async searchTwitter(keyword: string, maxResults: number = 10): Promise<SearchResult[]> {
    const twitterClient = await this.getTwitterClient();

    if (!twitterClient) {
      throw new Error('X/Twitter API not available for keyword search.');
    }

    try {
      // Use v2 search API recent endpoint
      console.log(`Searching X using v2 API for keyword: ${keyword}`);
      const searchResults = await twitterClient.v2.search(keyword, {
        max_results: Math.min(maxResults, 10), // v2 API limit
        'tweet.fields': ['created_at', 'author_id'],
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

      for (const tweet of tweets) {
        const author = users.find((user: any) => user.id === tweet.author_id);
        results.push({
          platform: 'twitter',
          id: tweet.id,
          author: author?.username || 'unknown',
          content: tweet.text,
          url: `https://twitter.com/${author?.username || 'unknown'}/status/${tweet.id}`,
          createdAt: new Date(tweet.created_at || new Date())
        });
      }

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

        results.push({
          platform: 'reddit',
          id: postData.id,
          author: postData.author,
          content: postData.title + (postData.selftext ? '\n\n' + postData.selftext : ''),
          url: `https://reddit.com${postData.permalink}`,
          createdAt: new Date(postData.created_utc * 1000)
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

  async searchAllPlatforms(keyword: string, platforms: string[] = ['twitter', 'reddit']): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];
    const errors: string[] = [];

    // Search Twitter if requested
    if (platforms.includes('twitter')) {
      try {
        const twitterResults = await this.searchTwitter(keyword);
        allResults.push(...twitterResults);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown Twitter error';
        errors.push(`Twitter: ${errorMsg}`);
      }
    }

    // Search Reddit if requested
    if (platforms.includes('reddit')) {
      const subreddits = ['ChatGPTCoding', 'learnprogramming', 'webdev'];

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

    // If we have no results but have errors, provide helpful guidance
    if (allResults.length === 0 && errors.length > 0) {
      let helpfulMessage = "Search unavailable: ";

      if (platforms.includes('twitter')) {
        helpfulMessage += "Twitter requires Academic Research or Enterprise API access for search. ";
      }

      if (platforms.includes('reddit')) {
        helpfulMessage += "Reddit blocks automated searches from script apps. ";
      }

      if (platforms.includes('discord')) {
        helpfulMessage += "Discord search requires bot permissions. ";
      }

      helpfulMessage += "These APIs work for posting but have restrictions for searching.";

      throw new Error(helpfulMessage);
    }

    // If we have some results but also errors, log the errors but return results
    if (errors.length > 0) {
      console.warn(`Some searches failed: ${errors.join('; ')}`);
    }

    return allResults.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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

  async replyToRedditPost(postId: string, replyText: string): Promise<boolean> {
    // Reddit replies require OAuth and more complex setup
    console.log('Reddit replies not implemented - requires OAuth setup');
    return false;
  }
}

export const keywordSearchEngine = new KeywordSearchEngine();