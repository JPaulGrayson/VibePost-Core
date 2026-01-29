import { TwitterApi } from "twitter-api-v2";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { PostcardDraft } from "@shared/schema";
import { storage } from "../storage";
import { postcardDrafter } from "./postcard_drafter";
import { getQuackLaunchMediaPath, LOGICART_STRATEGIES } from "../campaign-config";
import * as fs from "fs/promises";
import * as path from "path";

// Rate limiting to prevent Twitter 429 errors
const MIN_DELAY_BETWEEN_TWEETS_MS = 30000; // 30 seconds
let lastTweetTimestamp = 0;

async function waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastTweetTimestamp;
    if (elapsed < MIN_DELAY_BETWEEN_TWEETS_MS && lastTweetTimestamp > 0) {
        const waitTime = MIN_DELAY_BETWEEN_TWEETS_MS - elapsed;
        console.log(`⏳ Rate limiting: waiting ${Math.round(waitTime / 1000)}s before next tweet...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
}
export async function publishDraft(draft: PostcardDraft) {
    console.log(`Starting publish for draft ${draft.id}`);
    try {
        // Wait for rate limit cooldown before attempting to publish
        await waitForRateLimit();
        // Try to get credentials from DB first, fall back to env vars
        const twitterConnection = await storage.getPlatformConnection("twitter");
        const dbCreds = twitterConnection?.credentials || {};

        const appKey = dbCreds.apiKey || process.env.TWITTER_API_KEY;
        const appSecret = dbCreds.apiSecret || process.env.TWITTER_API_SECRET;
        const accessToken = dbCreds.accessToken || process.env.TWITTER_ACCESS_TOKEN;
        const accessSecret = dbCreds.accessTokenSecret || process.env.TWITTER_ACCESS_TOKEN_SECRET;

        if (!appKey || !appSecret || !accessToken || !accessSecret) {
            throw new Error("Missing Twitter API credentials. Please configure them in Settings.");
        }

        const client = new TwitterApi({
            appKey,
            appSecret,
            accessToken,
            accessSecret,
        });

        // Verify credentials first
        const me = await client.v2.me();
        console.log(`Authenticated as @${me.data.username}`);

        // Check if this is a Quack campaign draft - use video instead of image
        const isQuackLaunch = draft.strategy === 'quack_launch';
        const isQuackQuack = draft.strategy === 'quack_quack';
        const isQuackCampaign = isQuackLaunch || isQuackQuack;
        let mediaId;
        
        if (isQuackCampaign) {
            // Use the configured video for the respective campaign
            const videoPath = isQuackQuack 
                ? (LOGICART_STRATEGIES.quack_quack.mediaPath || 'attached_assets/Video_Generation_Quack_Quack__1769695167312.mp4')
                : getQuackLaunchMediaPath();
            console.log(`🎥 ${isQuackQuack ? 'Quack Quack' : 'Quack Launch'} draft - uploading video: ${videoPath}`);
            
            try {
                const fullPath = path.join(process.cwd(), videoPath);
                const videoBuffer = await fs.readFile(fullPath);
                console.log(`Video loaded: ${videoBuffer.length} bytes`);
                
                // Upload video using chunked upload
                mediaId = await client.v1.uploadMedia(videoBuffer, { 
                    mimeType: 'video/mp4',
                    target: 'tweet'
                });
                console.log(`✅ Video uploaded successfully, ID: ${mediaId}`);
            } catch (videoError: any) {
                console.error(`❌ Failed to upload video:`, videoError);
                return { success: false, error: `Video upload failed: ${videoError.message}` };
            }
        } else {
            // Standard image flow for other strategies
            // Generate image on-demand if missing (deferred image generation)
            let imageUrl = draft.turaiImageUrl;
            if (!imageUrl) {
                console.log(`🎨 No image in draft - generating on-demand before posting...`);
                try {
                    imageUrl = await postcardDrafter.regenerateImage(draft.id);
                    console.log(`✅ Image generated on-demand: ${imageUrl}`);
                } catch (imgError) {
                    console.error(`❌ Failed to generate image on-demand:`, imgError);
                    return { success: false, error: "Failed to generate image for posting" };
                }
            }

            // 1. Upload the Image
            console.log(`Fetching image from ${imageUrl}`);

        let buffer: Buffer;
        let mimeType = 'image/jpeg'; // Default

        if (imageUrl.startsWith('http')) {
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);

            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);

            // Try to detect mime type from headers
            const contentType = response.headers.get('content-type');
            if (contentType) mimeType = contentType;

        } else if (imageUrl.startsWith('data:')) {
            // Extract base64 data
            const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) throw new Error('Invalid data URI format');

            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
        } else if (imageUrl.startsWith('/generated-images/')) {
            // Local file path - read from filesystem
            const fs = await import('fs/promises');
            const path = await import('path');
            const localPath = path.join(process.cwd(), 'public', imageUrl);
            
            try {
                buffer = await fs.readFile(localPath);
                // Detect mime type from extension
                if (imageUrl.endsWith('.png')) mimeType = 'image/png';
                else if (imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg')) mimeType = 'image/jpeg';
                else if (imageUrl.endsWith('.gif')) mimeType = 'image/gif';
                else if (imageUrl.endsWith('.webp')) mimeType = 'image/webp';
                console.log(`Read local image: ${localPath} (${buffer.length} bytes)`);
            } catch (fsError: any) {
                throw new Error(`Failed to read local image file: ${localPath} - ${fsError.message}`);
            }
        } else {
            throw new Error("Unsupported image format (must be HTTP URL, Data URI, or local /generated-images/ path)");
        }

        console.log(`Image prepared, size: ${buffer.length} bytes, type: ${mimeType}. Uploading to Twitter...`);

        // Validate buffer before upload
        if (buffer.length < 1000) {
            throw new Error(`Image too small (${buffer.length} bytes) - likely a failed download`);
        }

        // Upload media using v1 API (Buffer method is safest)
        try {
            mediaId = await client.v1.uploadMedia(buffer, { mimeType });
            console.log(`Media uploaded successfully, ID: ${mediaId}`);
        } catch (uploadError: any) {
            // If upload fails with segment error, retry with fresh download
            if (uploadError.code === 131 || uploadError.message?.includes('Segments')) {
                console.log('⚠️ Segment error, retrying with fresh image download...');

                // Wait a bit and re-download the image
                await new Promise(resolve => setTimeout(resolve, 2000));

                const retryResponse = await fetch(imageUrl);
                if (!retryResponse.ok) throw new Error(`Retry download failed: ${retryResponse.statusText}`);

                const retryBuffer = Buffer.from(await retryResponse.arrayBuffer());
                console.log(`Retry image size: ${retryBuffer.length} bytes`);

                mediaId = await client.v1.uploadMedia(retryBuffer, { mimeType });
                console.log(`Retry upload successful, ID: ${mediaId}`);
            } else {
                throw uploadError;
            }
        }
        } // End of else block for non-quack-launch image uploads

        // 2. Prepare the Payload
        let tweetText = draft.draftReplyText || "";
        const isQuoteTweet = draft.actionType === 'quote_tweet';

        // For regular replies (not Quote Tweets), prepend @mention for proper threading
        // Quote Tweets don't need the @mention since the quoted tweet provides context
        if (!isQuoteTweet && draft.originalTweetId && draft.originalAuthorHandle) {
            const authorHandle = draft.originalAuthorHandle.startsWith('@')
                ? draft.originalAuthorHandle
                : `@${draft.originalAuthorHandle}`;

            // Only prepend if not already mentioned at the start
            if (!tweetText.toLowerCase().startsWith(authorHandle.toLowerCase())) {
                tweetText = `${authorHandle} ${tweetText}`;
            }
        }

        if (draft.imageAttribution) {
            tweetText += `\n\n📸 ${draft.imageAttribution}`;
        }

        const payload: any = {
            text: tweetText,
            media: { media_ids: [mediaId] }
        };

        // Determine tweet type: Quote Tweet vs Reply
        if (isQuoteTweet && draft.originalTweetId && /^\d+$/.test(draft.originalTweetId)) {
            // Quote Tweet with media attachment
            payload.quote_tweet_id = draft.originalTweetId;
            console.log(`📝 Publishing as Quote Tweet with media (quoting tweet ${draft.originalTweetId})`);
        } else if (draft.originalTweetId && /^\d+$/.test(draft.originalTweetId)) {
            // Standard reply
            payload.reply = { in_reply_to_tweet_id: draft.originalTweetId };
        }

        // 3. Handle Community Targeting
        if (draft.targetCommunityId) {
            payload.community_id = draft.targetCommunityId;
        }

        console.log("Sending tweet payload:", JSON.stringify(payload));

        // 4. Send Tweet
        let result;
        try {
            result = await client.v2.tweet(payload);
        } catch (tweetError: any) {
            // Check for "Tweet not visible" or "Deleted" error (403)
            if (tweetError.code === 403 || (tweetError.data && tweetError.data.status === 403)) {
                console.warn("⚠️ Reply failed (Tweet deleted or hidden). Falling back to Quote Tweet...");

                // Remove reply field
                delete payload.reply;

                // Add quote tweet link to text
                // We need the original author handle to construct the link
                // If we don't have it, we can't quote, so we just post as standalone
                if (draft.originalAuthorHandle) {
                    payload.quote_tweet_id = draft.originalTweetId;
                    // Alternatively, append URL: payload.text += ` https://twitter.com/${draft.originalAuthorHandle}/status/${draft.originalTweetId}`;
                } else {
                    console.warn("⚠️ No author handle for quote link, posting as standalone.");
                }

                result = await client.v2.tweet(payload);
            } else {
                throw tweetError; // Re-throw other errors
            }
        }

        console.log(`Tweet published! ID: ${result.data.id}`);

        // Update rate limit timestamp after successful tweet
        lastTweetTimestamp = Date.now();

        return { success: true, tweetId: result.data.id };
    } catch (error: any) {
        console.error("Error publishing draft:", error);

        // Log to console in a way that Replit captures
        if (error.data) {
            console.error("Twitter API Error Data:", JSON.stringify(error.data, null, 2));
        }

        // Try to write to a log file
        try {
            const fs = await import('fs');
            fs.appendFileSync('publish_error.log', `${new Date().toISOString()} - Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`);
            if (error.data) {
                fs.appendFileSync('publish_error.log', `${new Date().toISOString()} - API Data: ${JSON.stringify(error.data)}\n`);
            }
        } catch (fsError) {
            console.error("Failed to write to log file:", fsError);
        }

        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

/**
 * Publish a tweet with a video file
 * Uses chunked upload for video (required by Twitter)
 */
export async function publishDraftWithVideo(
    videoPath: string,
    text: string,
    replyToTweetId?: string
): Promise<{ success: boolean; tweetId?: string; error?: string }> {
    console.log(`Starting video publish: ${videoPath}`);

    try {
        // Wait for rate limit cooldown
        await waitForRateLimit();

        // Get credentials
        const twitterConnection = await storage.getPlatformConnection("twitter");
        const dbCreds = twitterConnection?.credentials || {};

        const appKey = dbCreds.apiKey || process.env.TWITTER_API_KEY;
        const appSecret = dbCreds.apiSecret || process.env.TWITTER_API_SECRET;
        const accessToken = dbCreds.accessToken || process.env.TWITTER_ACCESS_TOKEN;
        const accessSecret = dbCreds.accessTokenSecret || process.env.TWITTER_ACCESS_TOKEN_SECRET;

        if (!appKey || !appSecret || !accessToken || !accessSecret) {
            throw new Error("Missing Twitter API credentials");
        }

        const client = new TwitterApi({
            appKey,
            appSecret,
            accessToken,
            accessSecret,
        });

        // Read video file
        const fs = await import('fs');
        const videoBuffer = fs.readFileSync(videoPath);
        const videoSize = videoBuffer.length;

        console.log(`Uploading video: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);

        // Upload video using chunked upload (required for videos)
        const mediaId = await client.v1.uploadMedia(videoBuffer, {
            mimeType: 'video/mp4',
            target: 'tweet',
            longVideo: videoSize > 15 * 1024 * 1024 // For videos > 15MB
        });

        console.log(`Video uploaded, media ID: ${mediaId}`);

        // Build tweet payload
        const tweetPayload: any = {
            text,
            media: { media_ids: [mediaId] }
        };

        if (replyToTweetId) {
            tweetPayload.reply = { in_reply_to_tweet_id: replyToTweetId };
        }

        console.log(`Sending tweet with video...`);
        const result = await client.v2.tweet(tweetPayload);

        console.log(`Video tweet published! ID: ${result.data.id}`);
        lastTweetTimestamp = Date.now();

        return { success: true, tweetId: result.data.id };

    } catch (error: any) {
        console.error("Error publishing video:", error);

        if (error.data) {
            console.error("Twitter API Error:", JSON.stringify(error.data, null, 2));
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}

// Thread posting interface
export interface ThreadTweet {
    text: string;
    mediaPath: string; // Path to local file (image or video)
    mediaType: 'image' | 'video';
}

// Post a thread (multiple tweets in sequence)
export async function postThread(tweets: ThreadTweet[]): Promise<{ success: boolean; tweetIds?: string[]; error?: string }> {
    try {
        // Get Twitter credentials
        const twitterConnection = await storage.getPlatformConnection("twitter");
        const dbCreds = twitterConnection?.credentials || {};
        
        const appKey = dbCreds.apiKey || process.env.TWITTER_API_KEY;
        const appSecret = dbCreds.apiSecret || process.env.TWITTER_API_SECRET;
        const accessToken = dbCreds.accessToken || process.env.TWITTER_ACCESS_TOKEN;
        const accessSecret = dbCreds.accessTokenSecret || process.env.TWITTER_ACCESS_TOKEN_SECRET;
        
        if (!appKey || !appSecret || !accessToken || !accessSecret) {
            throw new Error("Missing Twitter API credentials");
        }
        
        const client = new TwitterApi({
            appKey,
            appSecret,
            accessToken,
            accessSecret,
        });
        
        // Verify credentials
        const me = await client.v2.me();
        console.log(`🧵 Starting thread as @${me.data.username}`);
        
        const tweetIds: string[] = [];
        let previousTweetId: string | null = null;
        
        for (let i = 0; i < tweets.length; i++) {
            const tweet = tweets[i];
            console.log(`📝 Posting tweet ${i + 1}/${tweets.length}: "${tweet.text.substring(0, 50)}..."`);
            
            // Wait for rate limit between tweets
            if (i > 0) {
                console.log(`⏳ Waiting 30s before next tweet...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
            
            // Upload media
            const fullPath = path.join(process.cwd(), tweet.mediaPath);
            const mediaBuffer = await fs.readFile(fullPath);
            console.log(`📎 Uploading media: ${tweet.mediaPath} (${(mediaBuffer.length / 1024).toFixed(1)} KB)`);
            
            const mimeType = tweet.mediaType === 'video' ? 'video/mp4' : 
                            tweet.mediaPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
            
            const mediaId = await client.v1.uploadMedia(mediaBuffer, {
                mimeType,
                target: 'tweet'
            });
            console.log(`✅ Media uploaded: ${mediaId}`);
            
            // Build tweet payload
            const payload: any = {
                text: tweet.text,
                media: { media_ids: [mediaId] }
            };
            
            // If this is a reply in the thread, add reply_to
            if (previousTweetId) {
                payload.reply = { in_reply_to_tweet_id: previousTweetId };
            }
            
            // Post the tweet
            const result = await client.v2.tweet(payload);
            console.log(`✅ Tweet ${i + 1} posted: ${result.data.id}`);
            
            tweetIds.push(result.data.id);
            previousTweetId = result.data.id;
            lastTweetTimestamp = Date.now();
        }
        
        console.log(`🎉 Thread complete! ${tweetIds.length} tweets posted`);
        return { success: true, tweetIds };
        
    } catch (error: any) {
        console.error("Error posting thread:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}
