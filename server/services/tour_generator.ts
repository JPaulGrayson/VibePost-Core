import { db } from "../db";
import { postcardDrafts } from "@shared/schema";
import type { TourRequest } from "./intent_parser";

async function createClaim(data: { city: string; theme: string; userHandle: string }) {
    try {
        // In production, this URL should be configurable
        const turaiApiUrl = process.env.TURAI_API_URL || "http://localhost:5003";

        const response = await fetch(`${turaiApiUrl}/api/claims/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                source: "x_vibe_post",
                userHandle: data.userHandle,
                detectedCity: data.city,
                detectedTheme: data.theme
            })
        });

        if (!response.ok) {
            throw new Error(`TuraiSocial API Error: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Failed to create claim:", error);
        // Fallback for dev/demo if TuraiSocial isn't running
        return {
            claimUrl: `http://localhost:5003/claim/demo-${Math.random().toString(36).substring(7)}`,
            token: "demo-token"
        };
    }
}

export async function processTourRequest(requestData: TourRequest, originalTweet: any) {
    if (!requestData.isRequest || !requestData.city) return;

    console.log(`✨ Creating Tour Claim: ${requestData.city} / ${requestData.theme}`);

    try {
        // 1. Call TuraiSocial to create a Claim
        const claimResponse = await createClaim({
            city: requestData.city,
            theme: requestData.theme || "General",
            userHandle: requestData.userHandle
        });

        // 2. Draft the Reply
        const replyText = `I've queued up your ${requestData.city} ${requestData.theme || ""} tour! 🗾\n\nClick here to customize the stops and duration: ${claimResponse.claimUrl}`;

        // 3. Save to Sniper Queue (Pending Review)
        await db.insert(postcardDrafts).values({
            originalTweetId: originalTweet.id,
            originalAuthorHandle: requestData.userHandle,
            originalTweetText: originalTweet.text,
            detectedLocation: requestData.city,
            draftReplyText: replyText,
            status: "pending_review",
            // We use a generic travel image for the card preview since the tour isn't generated yet
            turaiImageUrl: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80"
        });

        console.log("✅ Tour Claim Queued for Review");

    } catch (error) {
        console.error("Tour Processing Error:", error);
    }
}
