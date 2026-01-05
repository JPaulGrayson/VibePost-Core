import { db } from "../db";
import { postcardDrafts } from "@shared/schema";
import { GoogleGenAI } from "@google/genai";
import { eq } from "drizzle-orm";
import { CampaignType, CAMPAIGN_CONFIGS } from "../campaign-config";

// Initialize Gemini
// Ensure API key is present
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. AI features will fail.");
}
const genAI = new GoogleGenAI({ apiKey: apiKey || "dummy" });

// Helper function to calculate text similarity (Jaccard-like similarity based on word overlap)
function calculateSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    if (text1 === text2) return 1;

    const words1 = text1.split(' ').filter(w => w.length > 2);
    const words2 = text2.split(' ').filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const set2 = new Set(words2);
    const intersection = words1.filter(w => set2.has(w));
    const unionSize = new Set([...words1, ...words2]).size;

    return intersection.length / unionSize;
}

// Verify intent based on campaign type using Gemini AI
async function verifyIntent(tweetText: string, campaignType: CampaignType = 'turai'): Promise<boolean> {
    try {
        const config = CAMPAIGN_CONFIGS[campaignType];

        let prompt: string;

        if (campaignType === 'logigo') {
            prompt = `Analyze this social media post and determine if it's a GENUINE coding/development inquiry where someone is:
- Struggling with code or debugging
- Asking for help understanding code
- Frustrated with a programming problem
- Looking for coding tools or visualization help
- Learning to code and stuck

Post: "${tweetText}"

Answer with ONLY "YES" or "NO":
- YES = They genuinely need coding help, are struggling with code, or looking for developer tools
- NO = Job posting, promotional content, hiring announcement, course advertisement, or not actually seeking help

Answer:`;
        } else {
            prompt = `Analyze this social media post and determine if it's a GENUINE travel planning inquiry where someone is asking for help, recommendations, or advice about visiting a destination.

Post: "${tweetText}"

Answer with ONLY "YES" or "NO":
- YES = They are genuinely planning a trip or asking for travel help/recommendations
- NO = Casual mention of a place, astrology/horoscope, promotional content, news, jokes, or not actually seeking travel advice

Answer:`;
        }

        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const answer = result.text?.trim().toUpperCase() || "NO";
        return answer.startsWith("YES");
    } catch (error) {
        console.error(`Error verifying ${campaignType} intent:`, error);
        // On error, default to allowing (don't block due to API issues)
        return true;
    }
}

// Legacy function for backward compatibility
async function verifyTravelIntent(tweetText: string): Promise<boolean> {
    return verifyIntent(tweetText, 'turai');
}

export async function generateDraft(
    tweet: { id: string; text: string; author_id?: string },
    authorHandle: string,
    campaignType: CampaignType = 'turai',
    force: boolean = false
): Promise<boolean> {
    const config = CAMPAIGN_CONFIGS[campaignType];
    console.log(`${config.emoji} Drafting ${config.name} reply for tweet ${tweet.id} from ${authorHandle}`);

    // Check if draft already exists for this exact tweet
    const existing = await db.query.postcardDrafts.findFirst({
        where: eq(postcardDrafts.originalTweetId, tweet.id),
    });

    if (existing) {
        console.log(`Draft already exists for tweet ${tweet.id}. Skipping.`);
        return false;
    }

    // SPAM DETECTION: Check for duplicate/similar tweet text from different users
    // This catches spam campaigns where bots post identical content from multiple accounts
    const normalizedText = tweet.text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, '') // Remove URLs
        .replace(/\s+/g, ' ')           // Normalize whitespace
        .trim();

    // Get recent drafts to check for similarity (last 100)
    const recentDrafts = await db.query.postcardDrafts.findMany({
        limit: 100,
        orderBy: (drafts, { desc }) => [desc(drafts.createdAt)],
    });

    for (const draft of recentDrafts) {
        if (!draft.originalTweetText) continue;

        const existingNormalized = draft.originalTweetText
            .toLowerCase()
            .replace(/https?:\/\/\S+/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Check for very similar text (90% similarity or exact match)
        const similarity = calculateSimilarity(normalizedText, existingNormalized);
        if (similarity > 0.9) {
            console.log(`⚠️ Spam detected: Tweet "${tweet.text.substring(0, 50)}..." is ${Math.round(similarity * 100)}% similar to existing draft. Skipping.`);
            return false;
        }
    }

    const drafter = new PostcardDrafter();

    // Intent verification RE-ENABLED for quality filtering
    console.log(`Verifying ${config.name} intent...`);
    const hasIntent = await verifyIntent(tweet.text, campaignType);
    if (!hasIntent) {
        console.log(`❌ No ${config.name} intent detected. Skipping.`);
        return false;
    }
    console.log(`✅ ${config.name} intent verified.`);

    // 1. Extract context based on campaign type
    let contextInfo: string | null = null;

    if (campaignType === 'turai') {
        // For travel: extract location
        contextInfo = await drafter.extractLocation(tweet.text);
        if (!contextInfo) {
            console.log("No location detected in tweet. Skipping.");
            return false;
        }
    } else if (campaignType === 'logigo') {
        // For LogiGo: extract the coding topic/language
        contextInfo = await drafter.extractCodingContext(tweet.text);
        if (!contextInfo) {
            contextInfo = "code debugging"; // Default context
        }
    }

    // 2. Generate Image based on campaign
    let imageUrl = "";
    let imageAttribution: string | null = null;

    if (campaignType === 'turai') {
        const imageResult = await drafter.generateTuraiImage(contextInfo!);
        imageUrl = imageResult.imageUrl;
        imageAttribution = imageResult.attribution;
    } else if (campaignType === 'logigo') {
        // For LogiGo: use a code visualization themed image
        imageUrl = await drafter.generateLogiGoImage(contextInfo!);
    }

    // 2b. Extract Theme
    const theme = campaignType === 'turai'
        ? await drafter.extractTheme(tweet.text)
        : await drafter.extractCodingTheme(tweet.text);
    console.log(`Detected theme: ${theme}`);

    // 3. Generate Reply Text based on campaign
    console.log("Generating reply text...");
    const { text: draftReplyText, score } = await drafter.generateCampaignReply(
        authorHandle,
        contextInfo!,
        tweet.text,
        campaignType
    );
    console.log(`Generated reply text: ${draftReplyText.substring(0, 20)}... (Score: ${score})`);

    // Skip leads below 95% - not worth the API credits
    // UNLESS it's a manual draft (force=true)
    if (score < 95 && !force) {
        console.log(`⏭️ Skipping lead (Score: ${score} < 95) - only processing top-tier leads`);
        return false;
    }

    if (force && score < 95) {
        console.log(`⚠️ Manual draft bypass: Saving lead with Score ${score}`);
    }

    // 5. Save to DB with campaign type
    console.log("Saving draft to DB...");
    try {
        await db.insert(postcardDrafts).values({
            originalTweetId: tweet.id,
            originalAuthorHandle: authorHandle,
            originalTweetText: tweet.text,
            detectedLocation: contextInfo, // Reusing location field for context
            status: "pending_review",
            draftReplyText: draftReplyText,
            turaiImageUrl: imageUrl,
            imageAttribution: imageAttribution,
            score: score,
            // Campaign type stored in a metadata field or we'll add a column later
        });
        console.log(`✅ ${config.emoji} Draft saved for ${contextInfo} (Score: ${score})`);
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
        let attribution: string | null = null;

        // Use localhost:5050 as default for dev environment (since 5000 is often taken)
        const turaiApiUrl = process.env.TURAI_API_URL || "http://localhost:5050";
        console.log(`🗺️ Requesting Turai Image from: ${turaiApiUrl}`);
        const turaiApiKey = process.env.TURAI_API_KEY || "any-key-for-dev";

        // Try Turai API first (best quality)
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
                    // Format attribution string if data is present
                    if (data.data.attribution) {
                        const { name } = data.data.attribution;
                        attribution = `Photo by ${name} on Unsplash`;
                    }
                    console.log("Turai image generated successfully:", data.data.imageUrl);
                    return { imageUrl: data.data.imageUrl, attribution };
                }
            } else {
                console.error(`Turai API returned ${response.status}: ${await response.text()}`);
            }
        } catch (error) {
            console.error("Error calling Turai API:", error);
        }

        // Fallback: Try Pollinations AI with verification
        try {
            const imagePrompt = `${location} beautiful travel destination scenic landscape photography, no text, no words, no letters, no writing, no signs`;
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?nologo=true`;

            console.log("Trying Pollinations AI...");
            const pollinationsResponse = await fetch(pollinationsUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(45000) // 45 second timeout
            });

            if (pollinationsResponse.ok) {
                const contentType = pollinationsResponse.headers.get('content-type');
                if (contentType && contentType.startsWith('image/')) {
                    console.log("Pollinations image verified successfully");
                    return { imageUrl: pollinationsUrl, attribution: null };
                }
            }
            console.log("Pollinations failed or returned non-image, trying LoremFlickr...");
        } catch (error) {
            console.error("Pollinations timeout/error:", error);
        }

        // Final fallback: LoremFlickr (real photos, fast and reliable)
        const query = encodeURIComponent(location.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().replace(/\s+/g, ','));
        const flickrUrl = `https://loremflickr.com/800/800/${query}?random=${Date.now()}`;
        console.log("Using LoremFlickr fallback:", flickrUrl);
        return { imageUrl: flickrUrl, attribution: null };
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

    // ===== LOGIGO-SPECIFIC METHODS =====

    // Extract coding context from a tweet (language, problem type, etc.)
    async extractCodingContext(text: string): Promise<string | null> {
        try {
            const response = await genAI.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [{
                    role: 'user',
                    parts: [{
                        text: `Analyze this tweet about coding/programming. Extract the main technology or problem type.
                    
Return a short 1-4 word description like:
- "Python debugging"
- "React TypeScript"
- "Algorithm confusion"
- "JavaScript async"
- "Legacy code refactoring"

If no specific tech context is found, return "code debugging".

Tweet: "${text}"

Answer (1-4 words only):` }]
                }]
            });
            const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            return result || "code debugging";
        } catch (error) {
            console.error("Error extracting coding context:", error);
            return "code debugging";
        }
    }

    // Generate a LogiGo-themed image (flowchart visualization style)
    async generateLogiGoImage(context: string): Promise<string> {
        try {
            // Use Pollinations AI to generate a code visualization themed image
            const imagePrompt = `clean modern code flowchart diagram visualization, ${context}, dark theme IDE aesthetic, abstract geometric shapes and lines, glowing nodes, technology concept art, no text, no letters, no words, minimalist design`;
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?nologo=true`;

            console.log("Generating LogiGo image via Pollinations...");
            const response = await fetch(pollinationsUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(45000)
            });

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.startsWith('image/')) {
                    console.log("LogiGo image generated successfully");
                    return pollinationsUrl;
                }
            }
        } catch (error) {
            console.error("Error generating LogiGo image:", error);
        }

        // Fallback: Generic code visualization placeholder
        return `https://placehold.co/800x800/1a1a2e/00ff88?text=LogiGo+Visualization`;
    }

    // Extract coding theme (for categorization)
    async extractCodingTheme(text: string): Promise<string> {
        try {
            const response = await genAI.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [{
                    role: 'user',
                    parts: [{
                        text: `Categorize this coding-related tweet into one of these themes:
- "Debugging" (fixing bugs, errors)
- "Learning" (learning to code, tutorials)
- "Architecture" (system design, patterns)
- "Frustration" (angry at code, venting)
- "Help Seeking" (asking questions)
- "General" (none of the above)

Tweet: "${text}"

Answer (one word only):` }]
                }]
            });
            const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            return result || "General";
        } catch (error) {
            console.error("Error extracting coding theme:", error);
            return "General";
        }
    }

    // Generate campaign-specific reply
    async generateCampaignReply(
        author: string,
        context: string,
        originalText: string,
        campaignType: CampaignType
    ): Promise<{ text: string; score: number }> {
        if (campaignType === 'logigo') {
            return this.generateLogiGoReply(author, context, originalText);
        }
        // Default to Turai travel reply
        return this.generateReplyText(author, context, originalText);
    }

    // LogiGo-specific reply generation
    async generateLogiGoReply(author: string, context: string, originalText: string): Promise<{ text: string; score: number }> {
        try {
            const systemPrompt = `
            You are "The Code Sage", a wise and friendly senior developer who helps fellow coders.
            
            Your Goal: 
            1. Analyze the tweet for "Coding Lead Quality" and assign a Score (0-99).
               - 80-99: Strong Lead. Genuine frustration, asking for help, struggling with specific code problem.
               - 60-79: Moderate Lead. General coding discussion, might need tools.
               - 0-59: Weak Lead. Promotional, hiring, or not actually seeking help.
            
            2. Write a short, helpful reply that subtly hints at visualization helping.
            
            Rules:
            1. Tone: Friendly senior developer, empathetic, NOT salesy. Use emojis sparingly: 🧠, 💡, ⚡, 🔍, 📊
            2. Vocabulary:
               - "I feel you, debugging [X] can be tricky..."
               - "Have you tried visualizing the flow?"
               - "Sometimes a flowchart really helps see what's happening"
               - "That's a tough one! Breaking it down step by step helps"
               - NEVER sound like a bot or advertisement
            3. **CRITICAL**: Do NOT include any URLs or links in the text.
            4. **CRITICAL**: Be genuinely helpful first, product mention secondary.
            5. Length: Keep it under 200 characters.
            
            Structure:
            - Acknowledge their struggle (empathy first)
            - Offer a helpful tip related to visualization/understanding code flow
            - Optional: Very subtle mention that you use a tool for this

            Output Format: JSON
            {
                "score": 85,
                "reply": "Debugging async can be wild! 🧠 Try mapping out the flow visually..."
            }
            `;

            const userPrompt = originalText === "REGENERATE"
                ? `Write a fresh Code Sage reply to @${author} about ${context}. Return JSON.`
                : `Reply to @${author} who tweeted: "${originalText}". Context: ${context}. Return JSON.`;

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

            try {
                const jsonStr = resultText?.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(jsonStr || '{}');
                return {
                    text: (parsed.reply || `That's a tricky one, @${author}! Sometimes visualizing the code flow helps a ton. 🧠`) + " (Check my pinned post for the tool I use! 📊)",
                    score: parsed.score || 50
                };
            } catch (e) {
                console.error("Failed to parse LogiGo AI JSON response:", resultText);
                return {
                    text: (resultText || `That's a tricky one, @${author}! Sometimes visualizing the code flow helps. 🧠`) + " (Check my pinned post for the tool I use! 📊)",
                    score: 50
                };
            }

        } catch (error) {
            console.error("Error generating LogiGo reply:", error);
            return {
                text: `That's a tricky one, @${author}! Sometimes visualizing your code flow helps see where things go wrong. 🧠 (Check my pinned post! 📊)`,
                score: 50
            };
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
            2. Vocabulary (Use "Crystal Ball" or "Mystical" metaphors):
               - "The crystal ball reveals your desire for..."
               - "The stars have aligned over [Location]..."
               - "A magical scroll has appeared for your quest..."
               - "Whimsical winds whisper of [Location]..."
               - "The mystical mists have parted, showing me [Location]..."
               - "Safe travels on your grand adventure!"
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
