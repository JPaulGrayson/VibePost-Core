/**
 * Comment Tracker Service
 * Fetches replies/comments on our published posts from Twitter
 * and stores them in the database for display in the UI
 */

import { TwitterApi, TweetV2 } from "twitter-api-v2";
import { storage } from "../storage";
import { db } from "../db";
import { postComments, postcardDrafts } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // Poll every 5 minutes
const MAX_RESULTS_PER_POLL = 20;

interface CommentData {
  platformCommentId: string;
  authorHandle: string;
  authorName?: string;
  content: string;
  metrics?: { likes?: number; replies?: number; retweets?: number };
  inReplyToTweetId?: string;
}

async function getTwitterClient(): Promise<TwitterApi | null> {
  try {
    const twitterConnection = await storage.getPlatformConnection("twitter");
    const dbCreds = twitterConnection?.credentials || {};

    const appKey = dbCreds.apiKey || process.env.TWITTER_API_KEY;
    const appSecret = dbCreds.apiSecret || process.env.TWITTER_API_SECRET;
    const accessToken = dbCreds.accessToken || process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = dbCreds.accessTokenSecret || process.env.TWITTER_ACCESS_TOKEN_SECRET;

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
      console.log("⚠️ Comment Tracker: Missing Twitter credentials");
      return null;
    }

    return new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });
  } catch (error) {
    console.error("Failed to create Twitter client:", error);
    return null;
  }
}

/**
 * Fetch replies to a specific tweet using the conversation_id approach
 */
export async function fetchRepliesForTweet(tweetId: string): Promise<CommentData[]> {
  const client = await getTwitterClient();
  if (!client) return [];

  try {
    // Use Twitter v2 search to find replies to this tweet
    // The conversation_id search is the most reliable way
    const searchQuery = `conversation_id:${tweetId} -is:retweet`;
    
    const result = await client.v2.search(searchQuery, {
      max_results: MAX_RESULTS_PER_POLL,
      "tweet.fields": ["author_id", "created_at", "public_metrics", "in_reply_to_user_id", "conversation_id"],
      "user.fields": ["username", "name"],
      expansions: ["author_id"],
    });

    if (!result.data || result.data.data.length === 0) {
      return [];
    }

    const users = result.includes?.users || [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const comments: CommentData[] = [];

    for (const tweet of result.data.data) {
      // Skip the original tweet itself
      if (tweet.id === tweetId) continue;

      const author = userMap.get(tweet.author_id || "");
      
      comments.push({
        platformCommentId: tweet.id,
        authorHandle: author?.username || "unknown",
        authorName: author?.name,
        content: tweet.text,
        metrics: tweet.public_metrics ? {
          likes: tweet.public_metrics.like_count,
          replies: tweet.public_metrics.reply_count,
          retweets: tweet.public_metrics.retweet_count,
        } : undefined,
        inReplyToTweetId: tweetId,
      });
    }

    return comments;
  } catch (error: any) {
    // Handle rate limiting gracefully
    if (error?.code === 429) {
      console.log("⏳ Comment Tracker: Rate limited, will retry later");
    } else {
      console.error("Error fetching tweet replies:", error?.message || error);
    }
    return [];
  }
}

/**
 * Check if a comment already exists in the database
 */
async function commentExists(platformCommentId: string): Promise<boolean> {
  const existing = await db.select()
    .from(postComments)
    .where(eq(postComments.platformCommentId, platformCommentId))
    .limit(1);
  return existing.length > 0;
}

/**
 * Save a comment to the database
 */
async function saveComment(
  postcardDraftId: number,
  comment: CommentData
): Promise<void> {
  if (await commentExists(comment.platformCommentId)) {
    return; // Already saved
  }

  await db.insert(postComments).values({
    postcardDraftId,
    platform: "twitter",
    platformCommentId: comment.platformCommentId,
    authorHandle: comment.authorHandle,
    authorName: comment.authorName,
    content: comment.content,
    metrics: comment.metrics,
    inReplyToTweetId: comment.inReplyToTweetId,
  });

  console.log(`💬 Saved comment from @${comment.authorHandle}`);
}

/**
 * Fetch and save comments for all published drafts
 */
export async function pollForComments(): Promise<{ total: number; new: number }> {
  console.log("💬 Comment Tracker: Polling for new comments...");

  // Get all published drafts that have a reply tweet ID
  const publishedDrafts = await db.select()
    .from(postcardDrafts)
    .where(eq(postcardDrafts.status, "published"));

  let totalFound = 0;
  let newSaved = 0;

  for (const draft of publishedDrafts) {
    // Use our reply tweet ID to find comments on OUR post, not the original
    // Fall back to original tweet ID if we don't have our reply ID stored yet
    const tweetIdToSearch = draft.replyTweetId || draft.originalTweetId;
    if (!tweetIdToSearch) continue;

    try {
      const comments = await fetchRepliesForTweet(tweetIdToSearch);
      totalFound += comments.length;

      for (const comment of comments) {
        const existed = await commentExists(comment.platformCommentId);
        if (!existed) {
          await saveComment(draft.id, comment);
          newSaved++;
        }
      }

      // Small delay between API calls to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error fetching comments for draft ${draft.id}:`, error);
    }
  }

  console.log(`💬 Comment Tracker: Found ${totalFound} comments, saved ${newSaved} new`);
  return { total: totalFound, new: newSaved };
}

/**
 * Get all comments for a specific draft
 */
export async function getCommentsForDraft(draftId: number): Promise<typeof postComments.$inferSelect[]> {
  return db.select()
    .from(postComments)
    .where(eq(postComments.postcardDraftId, draftId));
}

/**
 * Start the comment tracking background service
 */
export function startCommentTracker(): void {
  console.log("💬 Comment Tracker: Starting...");
  console.log(`   Polling every ${POLL_INTERVAL_MS / 60000} minutes`);

  // Initial poll after a short delay
  setTimeout(() => {
    pollForComments().catch(err => console.error("Comment poll error:", err));
  }, 30000);

  // Regular polling
  setInterval(() => {
    pollForComments().catch(err => console.error("Comment poll error:", err));
  }, POLL_INTERVAL_MS);
}

export const commentTracker = {
  startCommentTracker,
  pollForComments,
  fetchRepliesForTweet,
  getCommentsForDraft,
};
