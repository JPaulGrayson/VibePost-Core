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

        if (draft.turaiImageUrl.startsWith('http')) {
            const response = await fetch(draft.turaiImageUrl);
            if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            console.log(`Image downloaded, size: ${buffer.length} bytes. Uploading to Twitter...`);

            // Upload media using v1 API
            mediaId = await client.v1.uploadMedia(buffer, { mimeType: 'image/jpeg' });
            console.log(`Media uploaded successfully, ID: ${mediaId}`);
        } else if (draft.turaiImageUrl.startsWith('data:')) {
            console.log("Detected data URI image. Converting to buffer...");
            // Extract base64 data
            const matches = draft.turaiImageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

            if (!matches || matches.length !== 3) {
                throw new Error('Invalid data URI format');
            }

            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');

            console.log(`Image converted, size: ${buffer.length} bytes. Uploading to Twitter...`);
            mediaId = await client.v1.uploadMedia(buffer, { mimeType });
            console.log(`Media uploaded successfully, ID: ${mediaId}`);
        } else {
            // Local file path (unlikely in this context but good to keep)
            mediaId = await client.v1.uploadMedia(draft.turaiImageUrl);
        }

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
        const fs = require('fs');
        fs.appendFileSync('publish_error.log', `${new Date().toISOString()} - Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`);

        // Extract more details from Twitter API errors
        if (error.data) {
            console.error("Twitter API Error Data:", JSON.stringify(error.data, null, 2));
            fs.appendFileSync('publish_error.log', `${new Date().toISOString()} - API Data: ${JSON.stringify(error.data)}\n`);
        }

        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}
