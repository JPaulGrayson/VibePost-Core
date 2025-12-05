import { db } from "../db";
import { postcardDrafts } from "@shared/schema";
import { GoogleGenAI } from "@google/genai";
import { eq } from "drizzle-orm";

// Initialize Gemini
// Ensure API key is present
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. AI features will fail.");
}
const genAI = new GoogleGenAI({ apiKey: apiKey || "dummy" });

// ... imports

export async function generateDraft(tweet: { id: string; text: string; author_id?: string }, authorHandle: string): Promise<boolean> {
    console.log(`Drafting reply for tweet ${tweet.id} from ${authorHandle}`);

    // Check if draft already exists
    const existing = await db.query.postcardDrafts.findFirst({
        where: eq(postcardDrafts.originalTweetId, tweet.id),
    });

    if (existing) {
        console.log(`Draft already exists for tweet ${tweet.id}. Skipping.`);
        return false;
    }

    const drafter = new PostcardDrafter();

    // 1. Analyze Tweet for Location
    const location = await drafter.extractLocation(tweet.text);
    if (!location) {
        console.log("No location detected in tweet. Skipping.");
        return false;
    }

    // 2. Generate Image (Call Turai API)
    let turaiImageUrl = `https://turai.com/mock-image/${encodeURIComponent(location)}`;
    let imageAttribution = null;

    const imageResult = await drafter.generateTuraiImage(location);
    turaiImageUrl = imageResult.imageUrl;
    imageAttribution = imageResult.attribution;

    // 2b. Extract Theme
    const theme = await drafter.extractTheme(tweet.text);
    console.log(`Detected theme: ${theme}`);

    // 3. Generate Reply Text
    console.log("Generating reply text...");
    const { text: draftReplyText, score } = await drafter.generateReplyText(authorHandle, location, tweet.text);
    console.log(`Generated reply text: ${draftReplyText.substring(0, 20)}... (Score: ${score})`);

    // 5. Save to DB
    console.log("Saving draft to DB...");
    try {
        await db.insert(postcardDrafts).values({
            originalTweetId: tweet.id,
            originalAuthorHandle: authorHandle,
            originalTweetText: tweet.text,
            detectedLocation: location,
            status: "pending_review",
            draftReplyText: draftReplyText,
            turaiImageUrl: turaiImageUrl,
            imageAttribution: imageAttribution, // New field
            score: score, // Save the score
        });
        console.log(`✅ Draft saved for ${location} (Score: ${score})`);
        return true;
    } catch (error) {
        console.error("Error saving draft to DB:", error);
        return false;
    }
}

export class PostcardDrafter {
    // ... existing methods ...

    // Helper to expose image generation logic if needed by generateDraft
    async generateTuraiImage(location: string): Promise<{ imageUrl: string; attribution: string | null }> {
        // Default to the mock URL initially
        // Use Pollinations AI as a reliable fallback for real images
        let turaiImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(location + " travel postcard scenic")}`;
        let attribution = null;

        // Use localhost:5003 as default for dev environment
        const turaiApiUrl = process.env.TURAI_API_URL || "http://localhost:5001";
        const turaiApiKey = process.env.TURAI_API_KEY || "any-key-for-dev";

        try {
            console.log(`Calling Turai API at ${turaiApiUrl} for location: ${location}`);
            const response = await fetch(`${turaiApiUrl}/api/postcards/generate-by-topic`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": turaiApiKey
                },
                body: JSON.stringify({
                    location: { name: location },
                    topic: "Travel and Tourism",
                    aspectRatio: "1:1",
                    stylePreset: "vibrant"
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data.imageUrl) {
                    turaiImageUrl = data.data.imageUrl;
                    // Format attribution string if data is present
                    if (data.data.attribution) {
                        const { name, link } = data.data.attribution;
                        attribution = `Photo by ${name} on Unsplash`;
                    }
                    console.log("Turai image generated successfully:", turaiImageUrl);
                }
            } else {
                console.error(`Turai API returned ${response.status}: ${await response.text()}`);
            }
        } catch (error) {
            console.error("Error calling Turai API:", error);
        }

        return { imageUrl: turaiImageUrl, attribution };
    }

    // ... extractLocation and generateReplyText methods (make them public or internal if needed) ...
    async extractLocation(text: string): Promise<string | null> {
        // ... (existing implementation) ...
        try {
            console.log(`Extracting location with Gemini. Key present: ${!!apiKey}`);
            // Try primary model
            try {
                const response = await genAI.models.generateContent({
                    model: 'gemini-pro-latest',
                    contents: [{
                        role: 'user',
                        parts: [{ text: `Identify the city and country/state mentioned in this tweet. Return ONLY the location name (e.g., "Paris, France"). If no specific location is mentioned, return "NULL". Tweet: "${text}"` }]
                    }]
                });
                const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (result && result !== "NULL" && !result.includes("NULL")) return result;
            } catch (e) {
                console.warn("gemini-pro-latest failed, trying gemini-flash-latest", e);
                // Fallback
                const response = await genAI.models.generateContent({
                    model: 'gemini-flash-latest',
                    contents: [{
                        role: 'user',
                        parts: [{ text: `Identify the city and country/state mentioned in this tweet. Return ONLY the location name (e.g., "Paris, France"). If no specific location is mentioned, return "NULL". Tweet: "${text}"` }]
                    }]
                });
                const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (result && result !== "NULL" && !result.includes("NULL")) return result;
            }

            return null;
        } catch (error) {
            console.error("Error extracting location:", error);
            return null;
        }
    }

    async extractTheme(text: string): Promise<string> {
        try {
            const response = await genAI.models.generateContent({
                model: 'gemini-pro-latest',
                contents: [{
                    role: 'user',
                    parts: [{ text: `Identify the travel theme or specific interest mentioned in this tweet. Return a short 1-3 word theme (e.g., "Cyberpunk", "Foodie", "History", "Relaxation"). If no specific theme is found, return "General". Tweet: "${text}"` }]
                }]
            });
            const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            return result || "General";
        } catch (error) {
            console.error("Error extracting theme:", error);
            return "General";
        }
    }

    async generateReplyText(author: string, location: string, originalText: string): Promise<{ text: string; score: number }> {
        try {
            const systemPrompt = `
            You are "The Vibe Wizard", a magical travel guide who casts "travel spells" (helpful tips) for explorers.
            
            Your Goal: 
            1. Analyze the tweet for "Travel Intent" and assign a Score (0-99).
               - 80-99: Strong Lead. Mentions a specific place (City, Country) OR a strong desire to travel. (e.g. "I want to go to Italy", "Paris is calling", "Need a vacation")
               - 60-79: Moderate Lead. General travel vibes or aesthetic appreciation. (e.g. "This view is nice", "Airport vibes")
               - 0-59: Weak Lead. Unrelated or negative.
            
            2. Write a short, magical reply.
            
            Rules:
            1. Tone: Magical, mysterious, but helpful. Use emojis like 🧙‍♂️, 🔮, ✨, 📜, 🗺️.
            2. Vocabulary (Use "Crystal Ball" metaphors, NEVER "Telescope" or "Spotted"):
               - "The crystal ball reveals your desire for..."
               - "The stars have aligned over [Location]..."
               - "A magical scroll has appeared for your quest..."
               - "Whimsical winds whisper of [Location]..."
               - "Safe travels on your grand adventure!"
               - NEVER say "My telescope spotted you" -> Say "The mystical winds brought news..."
            3. **CRITICAL SAFETY RULE**: Do NOT include any URLs or links in the text.
            4. **CRITICAL SAFETY RULE**: Do NOT sound like a bot. Be a character.
            5. Length: Keep it under 200 characters.
            
            Structure:
            - Start with a magical observation (e.g., "The mists have parted!").
            - Mention the specific location to show you read the tweet.
            - (Optional): Add a magical observation about the location.
            - Do NOT add a "Check bio" or "Link" CTA. I will add this programmatically.

            Output Format: JSON
            {
                "score": 85,
                "reply": "The crystal ball glows with visions of..."
            }
            `;

            const userPrompt = originalText === "REGENERATE"
                ? `Write a fresh Vibe Wizard reply to @${author} about ${location}. Return JSON.`
                : `Reply to @${author} who tweeted: "${originalText}". Location: ${location}. Return JSON.`;

            const response = await genAI.models.generateContent({
                model: 'gemini-pro-latest',
                contents: [{
                    role: 'user',
                    parts: [
                        { text: systemPrompt },
                        { text: userPrompt }
                    ]
                }]
            });

            const resultText = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

            // Parse JSON
            try {
                // Clean markdown code blocks if present
                const jsonStr = resultText?.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(jsonStr || '{}');
                return {
                    text: (parsed.reply || `The stars have aligned, @${author}! A magical journey to ${location} awaits. ✨🔮`) + " (Claim your full guide in my bio 🏰)",
                    score: parsed.score || 50
                };
            } catch (e) {
                console.error("Failed to parse AI JSON response:", resultText);
                return {
                    text: (resultText || `The stars have aligned, @${author}! A magical journey to ${location} awaits. ✨🔮`) + " (Claim your full guide in my bio 🏰)",
                    score: 50 // Default score on parse error
                };
            }

        } catch (error) {
            console.error("Error generating reply:", error);
            return {
                text: `The stars have aligned, @${author}! A magical journey to ${location} awaits. ✨🔮 (Claim your full guide in my bio 🏰)`,
                score: 50
            };
        }
    }

    // ... regenerate methods ...
    async regenerateReplyText(draftId: number): Promise<string> {
        const draft = await db.query.postcardDrafts.findFirst({
            where: eq(postcardDrafts.id, draftId),
        });

        if (!draft) throw new Error("Draft not found");
        if (!draft.detectedLocation) throw new Error("Location not detected for this draft");

        // Extract existing URL if present (to preserve the claim link)
        const urlMatch = draft.draftReplyText?.match(/https?:\/\/[^\s]+/);
        const existingUrl = urlMatch ? urlMatch[0] : null;

        const { text: generatedText } = await this.generateReplyText(draft.originalAuthorHandle, draft.detectedLocation, "REGENERATE");
        let newText = generatedText;

        // Append the link if we found one
        if (existingUrl) {
            newText = `${newText} 🗺️ ${existingUrl}`;
        }

        await db.update(postcardDrafts)
            .set({ draftReplyText: newText })
            .where(eq(postcardDrafts.id, draftId));

        return newText;
    }

    async regenerateImage(draftId: number): Promise<string> {
        const draft = await db.query.postcardDrafts.findFirst({
            where: eq(postcardDrafts.id, draftId),
        });

        if (!draft) throw new Error("Draft not found");
        if (!draft.detectedLocation) throw new Error("Location not detected for this draft");

        const { imageUrl, attribution } = await this.generateTuraiImage(draft.detectedLocation);

        await db.update(postcardDrafts)
            .set({
                turaiImageUrl: imageUrl,
                imageAttribution: attribution
            })
            .where(eq(postcardDrafts.id, draftId));

        return imageUrl;
    }
}

export const postcardDrafter = new PostcardDrafter();
