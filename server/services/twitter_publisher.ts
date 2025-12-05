import { TwitterApi } from "twitter-api-v2";
import { PostcardDraft } from "@shared/schema";

export async function publishDraft(draft: PostcardDraft) {
    console.log(`Starting publish for draft ${draft.id}`);
    try {
        const client = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY!,
            appSecret: process.env.TWITTER_API_SECRET!,
            accessToken: process.env.TWITTER_ACCESS_TOKEN!,
            accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
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

        // Upload media using v1 API (Buffer method is safest for Replit)
        mediaId = await client.v1.uploadMedia(buffer, { mimeType });
        console.log(`Media uploaded successfully, ID: ${mediaId}`);

        // 2. Prepare the Payload
        let tweetText = draft.draftReplyText;
        if (draft.imageAttribution) {
            tweetText += `\n\n📸 ${draft.imageAttribution}`;
        }

        const payload: any = {
            text: tweetText,
            media: { media_ids: [mediaId] }
        };

        if (draft.originalTweetId) {
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

        return { success: true, tweetId: result.data.id };
    } catch (error: any) {
        console.error("Error publishing draft:", error);

        // Log to console in a way that Replit captures
        if (error.data) {
            console.error("Twitter API Error Data:", JSON.stringify(error.data, null, 2));
        }

        // Try to write to a log file, but don't crash if it fails
        try {
            const fs = await import('fs');
            fs.appendFileSync('publish_error.log', `${new Date().toISOString()} - Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`);
            if (error.data) {
                fs.appendFileSync('publish_error.log', `${new Date().toISOString()} - API Data: ${JSON.stringify(error.data)}\n`);
            }
        } catch (fsError) {
            console.error("Failed to write to log file:", fsError);
        }

        // Extract more details from Twitter API errors
        if (error.data) {
            console.error("Twitter API Error Data:", JSON.stringify(error.data, null, 2));
            fs.appendFileSync('publish_error.log', `${new Date().toISOString()} - API Data: ${JSON.stringify(error.data)}\n`);
        }

        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}
