import { TwitterApi } from "twitter-api-v2";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { PostcardDraft } from "@shared/schema";
import { storage } from "../storage";

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

        if (!draft.turaiImageUrl) {
            return { success: false, error: "No image URL in draft" };
        }

        // 1. Upload the Image
        let mediaId;
        console.log(`Fetching image from ${draft.turaiImageUrl}`);

        let buffer: Buffer;
        let mimeType = 'image/jpeg'; // Default

        if (draft.turaiImageUrl.startsWith('http')) {
            const response = await fetch(draft.turaiImageUrl);
            if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);

            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);

            // Try to detect mime type from headers
            const contentType = response.headers.get('content-type');
            if (contentType) mimeType = contentType;

        } else if (draft.turaiImageUrl.startsWith('data:')) {
            // Extract base64 data
            const matches = draft.turaiImageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) throw new Error('Invalid data URI format');

            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            throw new Error("Unsupported image format (must be HTTP URL or Data URI)");
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

                const retryResponse = await fetch(draft.turaiImageUrl!);
                if (!retryResponse.ok) throw new Error(`Retry download failed: ${retryResponse.statusText}`);

                const retryBuffer = Buffer.from(await retryResponse.arrayBuffer());
                console.log(`Retry image size: ${retryBuffer.length} bytes`);

                mediaId = await client.v1.uploadMedia(retryBuffer, { mimeType });
                console.log(`Retry upload successful, ID: ${mediaId}`);
            } else {
                throw uploadError;
            }
        }

        // 2. Prepare the Payload
        let tweetText = draft.draftReplyText || "";

        // IMPORTANT: Prepend @mention for proper reply threading
        // Twitter API v2 should handle this with in_reply_to_tweet_id, but explicit mentions
        // help with visibility and reduce spam filter issues
        if (draft.originalTweetId && draft.originalAuthorHandle) {
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

        // Only add reply field if originalTweetId is a valid numeric tweet ID
        // (Daily postcards use non-numeric IDs like "daily-..." for standalone posts)
        if (draft.originalTweetId && /^\d+$/.test(draft.originalTweetId)) {
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
