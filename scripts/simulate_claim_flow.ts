
import { processTourRequest } from "../server/services/tour_generator";
import { db } from "../server/db";
import { postcardDrafts } from "@shared/schema";
import { desc } from "drizzle-orm";

// Ensure we point to the correct local port
process.env.TURAI_API_URL = "http://localhost:5003";

async function runSimulation() {
    console.log("🚀 Starting Claim Funnel Simulation...");
    console.log(`🎯 Target API: ${process.env.TURAI_API_URL}`);

    // 1. Mock Data
    const mockRequest = {
        isRequest: true,
        city: "Kyoto",
        theme: "Cyberpunk",
        userHandle: "TestUser_123"
    };

    const mockTweet = {
        id: `tweet_${Date.now()}`, // Unique ID each run
        text: "@VibePost I need a cyberpunk tour of Kyoto!",
        user: {
            screen_name: "TestUser_123"
        }
    };

    // 2. Process Request
    console.log("\n--- Processing Tour Request ---");
    // This will now actually call the API because we set the ENV var above
    await processTourRequest(mockRequest, mockTweet);

    // 3. Verify Database Entry
    console.log("\n--- Verifying Database Entry ---");
    // Wait a moment for DB write
    await new Promise(resolve => setTimeout(resolve, 1000));

    const latestDraft = await db.query.postcardDrafts.findFirst({
        orderBy: [desc(postcardDrafts.createdAt)]
    });

    if (latestDraft && latestDraft.originalTweetId === mockTweet.id) {
        console.log("✅ Draft Created Successfully!");
        console.log("------------------------------------------------");
        console.log(`📍 City: ${latestDraft.detectedLocation}`);
        console.log(`📝 Reply Text:\n${latestDraft.draftReplyText}`);
        console.log("------------------------------------------------");

        const urlMatch = latestDraft.draftReplyText.match(/http:\/\/localhost:5003\/claim\/[a-zA-Z0-9]+/);

        if (urlMatch) {
            const claimUrl = urlMatch[0];
            console.log(`✅ VALID Claim URL found: ${claimUrl}`);
            const token = claimUrl.split('/').pop();
            console.log(`🔑 Token: ${token}`);

            console.log("\n--- Simulating User Conversion ---");
            console.log("⏳ Calling convert endpoint (this triggers AI generation)...");

            try {
                const convertResponse = await fetch(`${process.env.TURAI_API_URL}/api/claims/convert`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        token: token,
                        preferences: {
                            duration: 2,
                            pacing: "relaxed"
                        }
                    })
                });

                if (convertResponse.ok) {
                    const convertData = await convertResponse.json();
                    console.log("✅ Tour Generated Successfully!");
                    console.log(`🎉 Tour ID: ${convertData.tourId}`);
                    console.log(`👉 View Tour: http://localhost:5003/tour/${convertData.tourId}`);
                } else {
                    console.error("❌ Conversion Failed:", await convertResponse.text());
                }
            } catch (err) {
                console.error("❌ Network Error during conversion:", err);
            }

        } else {
            console.log("❌ Claim URL MISSING or INVALID in reply.");
        }

    } else {
        console.log("❌ Failed to find the created draft.");
    }

    process.exit(0);
}

runSimulation().catch(console.error);
