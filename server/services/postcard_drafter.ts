import { db } from "../db";
import { postcardDrafts } from "@shared/schema";
import { GoogleGenAI, Modality } from "@google/genai";
import { eq } from "drizzle-orm";
import { CampaignType, CAMPAIGN_CONFIGS, LogicArtStrategy, getActiveLogicArtStrategy, LOGICART_STRATEGIES } from "../campaign-config";
import { runArena } from "./arena_service";
import * as fs from "fs";
import * as path from "path";

// Initialize Gemini for text generation (uses regular API key)
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. AI features will fail.");
}
const genAI = new GoogleGenAI({ apiKey: apiKey || "dummy" });

// Initialize Gemini for image generation (uses Replit AI Integrations)
const imageGenAI = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "dummy",
    httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
});

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

        if (campaignType === 'logicart') {
            prompt = `Analyze this social media post and determine if it's relevant for a coding/developer audience where someone is:
- Discussing AI coding tools (Cursor, Windsurf, Copilot, Claude, v0, Replit, Lovable, Bolt, etc.)
- Talking about "vibe coding" or AI-assisted development
- Comparing AI models for coding (Claude vs GPT, etc.)
- Having issues with AI-generated code or debugging
- Sharing coding experiences, struggles, or wins
- Learning to code or discussing programming

Post: "${tweetText}"

Answer with ONLY "YES" or "NO":
- YES = Developer/coder discussing coding, AI tools, vibe coding, or programming experiences
- NO = Pure job posting, spam, promotional ads, unrelated content, or just a retweet with no commentary

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

    // Intent verification - SKIPPED for force=true (manual sends from Topic Search)
    if (force) {
        console.log(`⚡ Skipping intent verification (force=true) for @${authorHandle}`);
    } else {
        console.log(`🔍 Verifying ${config.name} intent for @${authorHandle}...`);
        console.log(`   Tweet: "${tweet.text.substring(0, 80)}..."`);
        const hasIntent = await verifyIntent(tweet.text, campaignType);
        if (!hasIntent) {
            console.log(`❌ FILTERED: No ${config.name} intent - @${authorHandle}: "${tweet.text.substring(0, 50)}..."`);
            return false;
        }
        console.log(`✅ ${config.name} intent verified for @${authorHandle}`);
    }

    // 1. Extract context based on campaign type
    let contextInfo: string | null = null;

    if (campaignType === 'turai') {
        // For travel: extract location
        contextInfo = await drafter.extractLocation(tweet.text);
        if (!contextInfo) {
            console.log("No location detected in tweet. Skipping.");
            return false;
        }
    } else if (campaignType === 'logicart') {
        // For LogicArt: extract the coding topic/language
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
    } else if (campaignType === 'logicart') {
        // For LogicArt: use a code visualization themed image
        imageUrl = await drafter.generateLogicArtImage(contextInfo!);
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

    // Skip leads below threshold - LOWERED TO 70% FOR TESTING
    // TODO: Raise back to 95% once search prompts are finalized
    const SCORE_THRESHOLD = 70;
    if (score < SCORE_THRESHOLD && !force) {
        console.log(`⏭️ FILTERED: Low score (${score} < ${SCORE_THRESHOLD}) - @${authorHandle}: "${tweet.text.substring(0, 50)}..."`);
        return false;
    }

    if (force && score < SCORE_THRESHOLD) {
        console.log(`⚠️ Manual draft bypass: Saving lead with Score ${score}`);
    }

    // 5. Save to DB with campaign type
    console.log("Saving draft to DB...");
    
    // Determine strategy for LogicArt campaigns (default to current active strategy)
    const activeStrategy = campaignType === 'logicart' ? getActiveLogicArtStrategy() : null;
    
    try {
        await db.insert(postcardDrafts).values({
            campaignType: campaignType,
            strategy: activeStrategy, // Track which strategy generated this draft
            originalTweetId: tweet.id,
            originalAuthorHandle: authorHandle,
            originalTweetText: tweet.text,
            detectedLocation: contextInfo, // Reusing location field for context
            status: "pending_review",
            draftReplyText: draftReplyText,
            turaiImageUrl: imageUrl,
            imageAttribution: imageAttribution,
            actionType: "reply", // Standard reply action
            score: score,
        });
        console.log(`✅ ${config.emoji} Draft saved for ${contextInfo} (Score: ${score}, Campaign: ${campaignType}, Strategy: ${activeStrategy || 'n/a'})`);
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

    // ===== LOGICART-SPECIFIC METHODS =====

    // LogicArt deployed app URLs
    private static readonly LOGICART_LINK = "https://logic.art/x"; // Simple landing page
    private static readonly LOGICART_EMBED_BASE = "https://logicart.replit.app"; // For embed links with code
    
    // Arena URL for Quote Tweets - logic.art/x landing page
    public static readonly ARENA_URL = "https://logic.art/x";

    // Extract code snippet from a tweet
    extractCodeFromTweet(text: string): string | null {
        // Try to find code blocks (```code```)
        const codeBlockMatch = text.match(/```[\s\S]*?```/);
        if (codeBlockMatch) {
            return codeBlockMatch[0].replace(/```/g, '').trim();
        }
        
        // Try to find inline code (`code`)
        const inlineCodeMatch = text.match(/`[^`]+`/g);
        if (inlineCodeMatch && inlineCodeMatch.length > 0) {
            // Join multiple inline code segments
            return inlineCodeMatch.map(c => c.replace(/`/g, '')).join('\n');
        }
        
        // Look for common code patterns (function declarations, variable assignments, etc.)
        const codePatterns = [
            /(?:function|const|let|var|def|class|import|export|return|if|for|while)\s+\w+/,
            /\w+\s*=\s*(?:function|\(|{|\[)/,
            /\w+\.\w+\(/,
            /=>\s*{/,
        ];
        
        for (const pattern of codePatterns) {
            if (pattern.test(text)) {
                // The whole tweet might be code-like, return it
                // But only if it looks code-ish (has brackets, semicolons, etc.)
                if (/[{}\[\]();=]/.test(text)) {
                    return text;
                }
            }
        }
        
        return null;
    }

    // Generate a LogicArt URL - with code pre-loaded in clean embed view if we extracted code
    generateArenaUrl(code: string | null): string {
        if (!code) {
            // No code extracted - link to main landing page
            return PostcardDrafter.LOGICART_LINK;
        }
        
        // Encode code for URL parameter
        try {
            const encodedCode = encodeURIComponent(code);
            // If the encoded URL would be too long (>800 chars), fall back to simple landing
            // Twitter has URL limits and very long URLs look spammy
            if (encodedCode.length > 800) {
                console.log("   ⚠️ Code too long for URL, using simple link");
                return PostcardDrafter.LOGICART_LINK;
            }
            // Create embed URL with code pre-loaded in clean view
            // embed=true gives clean fullscreen with code editor + flowchart
            // autorun=true auto-starts the visualization
            return `${PostcardDrafter.LOGICART_EMBED_BASE}/?embed=true&autorun=true&code=${encodedCode}`;
        } catch (e) {
            return PostcardDrafter.LOGICART_LINK;
        }
    }

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

    // Fallback curated LogicArt-themed images (code, tech, flowcharts)
    private static readonly LOGICART_IMAGES = [
        "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=800&fit=crop", // Code on screen
        "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&h=800&fit=crop", // Developer coding
        "https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=800&h=800&fit=crop", // Code close-up
        "https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=800&h=800&fit=crop", // Code with coffee
        "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=800&h=800&fit=crop", // Syntax highlighting
        "https://images.unsplash.com/photo-1607798748738-b15c40d33d57?w=800&h=800&fit=crop", // Modern IDE
    ];
    
    // Generate a LogicArt-themed image using Gemini AI
    async generateLogicArtImage(context: string): Promise<string> {
        try {
            const imagePrompt = `Create a professional, modern image for a coding/developer brand. 
Theme: ${context}
Style: Clean, modern code flowchart or abstract data visualization. Dark theme with glowing neon accents (blue, green, purple). 
Must include: Abstract geometric code patterns, flowing data lines, technology aesthetic.
No text, no letters, no words - pure visual art.`;

            console.log("Generating LogicArt image via Gemini...");
            const response = await imageGenAI.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE],
                },
            });

            const candidate = response.candidates?.[0];
            const imagePart = candidate?.content?.parts?.find(
                (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
            );

            if (imagePart?.inlineData?.data) {
                // Save the image and return a URL
                const imageUrl = await this.saveGeneratedImage(imagePart.inlineData.data, "logicart");
                console.log("LogicArt image generated successfully:", imageUrl);
                return imageUrl;
            }
        } catch (error) {
            console.error("Error generating LogicArt image via Gemini:", error);
        }

        // Fallback to curated images
        console.log("Falling back to curated LogicArt image");
        const randomIndex = Math.floor(Math.random() * PostcardDrafter.LOGICART_IMAGES.length);
        return PostcardDrafter.LOGICART_IMAGES[randomIndex];
    }
    
    // Save a base64 image to disk and return the URL
    private async saveGeneratedImage(base64Data: string, prefix: string): Promise<string> {
        const imagesDir = path.join(process.cwd(), "public", "generated-images");
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        const filename = `${prefix}-${Date.now()}.png`;
        const filepath = path.join(imagesDir, filename);
        
        const buffer = Buffer.from(base64Data, "base64");
        fs.writeFileSync(filepath, buffer);
        
        return `/generated-images/${filename}`;
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

    // Extract a visual theme from AI debate tweets for image generation variety
    async extractDebateVisualTheme(tweetText: string): Promise<string> {
        try {
            const response = await genAI.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [{
                    role: 'user',
                    parts: [{
                        text: `Extract the visual theme/topic from this AI debate tweet for image generation.
                        
Return a short 2-5 word description of the visual concept, like:
- "code generation battle"
- "creative writing showdown"  
- "medical diagnosis competition"
- "legal reasoning duel"
- "math problem solving"
- "philosophical debate"
- "image recognition contest"
- "language translation match"

Tweet: "${tweetText.substring(0, 500)}"

Visual theme (2-5 words):` }]
                }]
            });
            const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            return result || "AI intelligence showdown";
        } catch (error) {
            console.error("Error extracting debate visual theme:", error);
            return "AI intelligence showdown";
        }
    }

    // Generate campaign-specific reply
    async generateCampaignReply(
        author: string,
        context: string,
        originalText: string,
        campaignType: CampaignType
    ): Promise<{ text: string; score: number; extractedCode?: string; arenaUrl?: string }> {
        if (campaignType === 'logicart') {
            // Extract code from the original tweet
            const extractedCode = this.extractCodeFromTweet(originalText);
            // Generate dynamic Arena URL with code pre-loaded (if found)
            const arenaUrl = this.generateArenaUrl(extractedCode);
            
            console.log(`   📝 Code extraction: ${extractedCode ? `Found ${extractedCode.length} chars` : 'No code found'}`);
            console.log(`   🔗 Arena URL: ${arenaUrl.length > 50 ? arenaUrl.substring(0, 50) + '...' : arenaUrl}`);
            
            const result = await this.generateLogicArtReply(author, context, originalText, arenaUrl);
            return {
                ...result,
                extractedCode: extractedCode || undefined,
                arenaUrl
            };
        }
        // Default to Turai travel reply
        return this.generateReplyText(author, context, originalText);
    }

    // LogicArt-specific reply generation
    async generateLogicArtReply(author: string, context: string, originalText: string, arenaUrl?: string): Promise<{ text: string; score: number }> {
        // Use the dynamic URL if we extracted code, otherwise use the simple landing page
        const linkToUse = arenaUrl || PostcardDrafter.LOGICART_LINK;
        const hasCodePreloaded = arenaUrl?.includes('code=');
        
        try {
            // Adjust messaging based on whether we pre-loaded their code
            const codeSpecificInstructions = hasCodePreloaded
                ? `You have already extracted and visualized their code! The link will show them the flowchart of THEIR code instantly.
                   Use phrases like "I visualized your code", "Check out what I found", "Look at the flow here"`
                : `Encourage them to paste their code into the tool for instant visualization.
                   Use phrases like "Paste your code into", "Try throwing your code into", "Drop your code here"`;
            
            const systemPrompt = `
            You are "The Code Sage", a wise and friendly senior developer who helps fellow coders.
            
            Your Goal: 
            1. Analyze the tweet for "Coding Lead Quality" and assign a Score (0-99).
               - 80-99: Strong Lead. Genuine frustration, asking for help, struggling with specific code problem.
               - 60-79: Moderate Lead. General coding discussion, might need tools.
               - 0-59: Weak Lead. Promotional, hiring, or not actually seeking help.
            
            2. Write a short, helpful reply that provides value AND includes the LogicArt link.
            
            ${codeSpecificInstructions}
            
            Rules:
            1. Tone: Friendly senior developer, empathetic, confident. Use emojis sparingly: 🧠, 💡, ⚡, 🔍, 📊
            2. Structure your reply:
               - Acknowledge their struggle (empathy first)
               - Mention how visualizing code as a flowchart helps spot issues
               - Include the link naturally
            3. Example patterns (adapt based on whether code is pre-loaded):
               - WITH code: "I threw your code into a visualizer - look at the flow here: [LINK] 🧠"
               - WITH code: "Interesting! I mapped out that logic - check the flowchart: [LINK] 💡"
               - NO code: "Debugging [X] is rough. Try pasting your code into [LINK] - the chart shows exactly where things break 🧠"
               - NO code: "Visualizing helps! Drop your code into [LINK] and watch the flow unfold ⚡"
            4. **CRITICAL**: You MUST include "[LINK]" placeholder - I will replace it with the actual URL.
            5. **CRITICAL**: Be genuinely helpful, not salesy.
            6. Length: Keep it under 240 characters (Twitter limit with link).

            Output Format: JSON
            {
                "score": 85,
                "reply": "Your example reply with [LINK] placeholder"
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
                let replyText = parsed.reply || `That's a tricky one, @${author}! Paste your code into [LINK] - the flowchart shows exactly where things break 🧠`;
                
                // Replace [LINK] placeholder with actual Arena URL
                if (/\[LINK\]/gi.test(replyText)) {
                    replyText = replyText.replace(/\[LINK\]/gi, linkToUse);
                } else {
                    // Safeguard: If Gemini omitted [LINK], append it
                    console.log("   ⚠️ Gemini omitted [LINK] placeholder, appending URL");
                    replyText = replyText.trim() + ` ${linkToUse}`;
                }
                
                return {
                    text: replyText,
                    score: parsed.score || 50
                };
            } catch (e) {
                console.error("Failed to parse LogicArt AI JSON response:", resultText);
                return {
                    text: `That's a tricky one, @${author}! Paste your code into ${linkToUse} - the flowchart shows exactly where things break 🧠`,
                    score: 50
                };
            }

        } catch (error) {
            console.error("Error generating LogicArt reply:", error);
            return {
                text: `That's a tricky one, @${author}! Paste your code into ${linkToUse} - seeing the flow as a chart makes issues pop out 🧠`,
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

        let imageUrl: string;
        let attribution: string | null = null;

        // Generate appropriate image based on campaign type
        if (draft.campaignType === 'turai') {
            if (!draft.detectedLocation) throw new Error("Location not detected for this draft");
            const imageResult = await this.generateTuraiImage(draft.detectedLocation);
            imageUrl = imageResult.imageUrl;
            attribution = imageResult.attribution;
        } else if (draft.strategy === 'arena_referee') {
            // Arena Referee: AI debate themed image - pass tweet content for variety
            imageUrl = await this.generateArenaRefereeImage(
                draft.detectedLocation || 'AI models',
                draft.originalTweetText || undefined
            );
        } else {
            // LogicArt: coding/flowchart themed image
            imageUrl = await this.generateLogicArtImage(draft.detectedLocation || 'code debugging');
        }

        await db.update(postcardDrafts)
            .set({
                turaiImageUrl: imageUrl,
                imageAttribution: attribution
            })
            .where(eq(postcardDrafts.id, draftId));

        return imageUrl;
    }

    // Fallback curated Arena Referee images (AI, robots, futuristic battle)
    private static readonly ARENA_IMAGES = [
        "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=800&fit=crop", // AI brain concept
        "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&h=800&fit=crop", // Robot face
        "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=800&fit=crop", // Humanoid robot
        "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=800&h=800&fit=crop", // AI visualization
        "https://images.unsplash.com/photo-1555255707-c07966088b7b?w=800&h=800&fit=crop", // Tech abstract
        "https://images.unsplash.com/photo-1673187789243-c09d2c91b7f0?w=800&h=800&fit=crop", // Futuristic AI
    ];
    
    // Generate AI debate/cage match themed image using Gemini AI
    async generateArenaRefereeImage(winnerModel: string, tweetContent?: string): Promise<string> {
        try {
            // Extract a topic from the tweet for visual variety
            const topicContext = tweetContent 
                ? await this.extractDebateVisualTheme(tweetContent)
                : "artificial intelligence debate";
            
            // Vary the visual style based on a random seed for uniqueness
            const visualStyles = [
                "futuristic neon colosseum with floating holographic screens",
                "cyberpunk arena with glowing circuit board floor",
                "ethereal digital battleground with particle effects",
                "high-tech stadium with laser light show",
                "abstract data visualization showing competing algorithms",
                "crystalline cyber arena with prismatic light refractions"
            ];
            const randomStyle = visualStyles[Math.floor(Math.random() * visualStyles.length)];
            
            const imagePrompt = `Create a unique, dramatic AI competition image.
Topic being debated: ${topicContext}
Winner: ${winnerModel}
Visual setting: ${randomStyle}
Style: Two distinct AI entities (robots, holograms, or abstract digital beings) in competition. One clearly victorious.
Colors: Neon accents (pick 2-3: blue, purple, red, cyan, gold, green based on topic).
Mood: Epic, dramatic, technological triumph.
Must include: Dynamic energy effects, digital particles, sense of motion and victory.
No text, no letters, no words, no writing - pure visual art.`;

            console.log("Generating Arena Referee image via Gemini...");
            const response = await imageGenAI.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE],
                },
            });

            const candidate = response.candidates?.[0];
            const imagePart = candidate?.content?.parts?.find(
                (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
            );

            if (imagePart?.inlineData?.data) {
                // Save the image and return a URL
                const imageUrl = await this.saveGeneratedImage(imagePart.inlineData.data, "arena");
                console.log("Arena Referee image generated successfully:", imageUrl);
                return imageUrl;
            }
        } catch (error) {
            console.error("Error generating Arena Referee image via Gemini:", error);
        }

        // Fallback to curated images
        console.log("Falling back to curated Arena image");
        const randomIndex = Math.floor(Math.random() * PostcardDrafter.ARENA_IMAGES.length);
        return PostcardDrafter.ARENA_IMAGES[randomIndex];
    }
}

/**
 * Arena Referee Strategy - Generate Quote Tweet drafts with AI verdicts
 * 
 * Flow:
 * 1. Find viral AI debate tweet (e.g., "Grok vs Claude")
 * 2. Run the debate through our Arena (4 AI models respond)
 * 3. Get the Chairman's verdict
 * 4. Generate a Quote Tweet draft with the verdict
 */
export async function generateArenaRefereeDraft(
    tweet: { id: string; text: string; author_id?: string },
    authorHandle: string,
    force: boolean = false
): Promise<boolean> {
    const strategy = LOGICART_STRATEGIES.arena_referee;
    console.log(`${strategy.emoji} Arena Referee: Processing debate tweet ${tweet.id} from @${authorHandle}`);

    // Check if draft already exists
    const existing = await db.query.postcardDrafts.findFirst({
        where: eq(postcardDrafts.originalTweetId, tweet.id),
    });

    if (existing) {
        console.log(`Draft already exists for tweet ${tweet.id}. Skipping.`);
        return false;
    }

    try {
        // Extract the debate question/topic from the tweet
        const debateTopic = tweet.text;
        
        console.log(`🏛️ Running debate through Arena: "${debateTopic.substring(0, 80)}..."`);
        
        // Run through the Arena - use "question" mode for debates
        let arenaResult;
        try {
            arenaResult = await runArena({
                problemDescription: debateTopic,
                mode: "question"  // Use question mode for AI debates
            });
        } catch (arenaError) {
            console.error(`❌ Arena service failed for tweet ${tweet.id}:`, arenaError);
            return false;
        }
        
        if (!arenaResult || !arenaResult.winner || arenaResult.winner === "None") {
            console.log(`❌ Arena failed to produce verdict. Skipping draft.`);
            return false;
        }
        
        console.log(`🏆 Arena Winner: ${arenaResult.winner}`);
        console.log(`📝 Reasoning: ${arenaResult.winnerReason?.substring(0, 100)}...`);
        
        // Generate the Quote Tweet text
        const quoteText = generateArenaVerdictText({
            winner: arenaResult.winner,
            winnerReason: arenaResult.winnerReason,
            responses: arenaResult.responses
        }, authorHandle);
        
        // Calculate a score based on engagement potential
        // High engagement topics (model debates) get higher scores
        const validResponses = arenaResult.responses.filter(r => !r.error).length;
        const score = Math.min(95, 70 + (validResponses * 5)); // 70-95 range based on response quality
        
        // Save the draft
        await db.insert(postcardDrafts).values({
            campaignType: "logicart",
            strategy: "arena_referee",
            originalTweetId: tweet.id,
            originalAuthorHandle: authorHandle,
            originalTweetText: tweet.text,
            detectedLocation: arenaResult.winner, // Reusing field for "winner model"
            status: "pending_review",
            draftReplyText: quoteText,
            turaiImageUrl: "", // No image for Quote Tweets (optional: add scorecard)
            actionType: "quote_tweet",
            arenaVerdict: {
                winner: arenaResult.winner,
                reasoning: arenaResult.winnerReason || "",
                responses: arenaResult.responses.map(r => ({
                    model: r.model,
                    response: r.response.substring(0, 500), // Truncate for storage
                    responseTime: r.responseTime
                }))
            },
            score: score,
        });
        
        console.log(`✅ ${strategy.emoji} Arena Referee draft saved! Winner: ${arenaResult.winner}, Score: ${score}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Arena Referee draft failed:`, error);
        return false;
    }
}

/**
 * Generate the Quote Tweet text for an Arena verdict
 */
function generateArenaVerdictText(
    arenaResult: { winner: string; winnerReason?: string; responses: any[] },
    authorHandle: string
): string {
    const winner = arenaResult.winner;
    const reasoning = arenaResult.winnerReason || "Based on clarity, accuracy, and helpfulness.";
    
    // Get response times for fun stats
    const validResponses = arenaResult.responses.filter(r => !r.error);
    const fastestTime = Math.min(...validResponses.map(r => r.responseTime));
    const fastestModel = validResponses.find(r => r.responseTime === fastestTime)?.model || "Unknown";
    
    // Build the Quote Tweet text
    // Twitter's Quote Tweet UI shows the original tweet, so we just need our commentary
    const arenaUrl = PostcardDrafter.ARENA_URL;
    const templates = [
        `We ran this through the AI Council. 🏛️\n\nThe verdict? ${winner} wins!\n\n${reasoning.length > 150 ? reasoning.substring(0, 147) + "..." : reasoning}\n\n🏆 Try your own debate: ${arenaUrl}`,
        `🏟️ AI CAGE MATCH VERDICT 🏟️\n\n@${authorHandle} asked, we delivered!\n\n🏆 Winner: ${winner}\n\n"${reasoning.length > 120 ? reasoning.substring(0, 117) + "..." : reasoning}"\n\n⚡ Fastest: ${fastestModel} (${fastestTime}ms)\n\n🔗 ${arenaUrl}`,
        `The AI Council has spoken! 🏛️\n\n${winner} takes this round. Here's why:\n\n${reasoning.length > 140 ? reasoning.substring(0, 137) + "..." : reasoning}\n\n👉 Run your own AI battle: ${arenaUrl}`,
    ];
    
    // Pick a random template for variety
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    return template;
}

export const postcardDrafter = new PostcardDrafter();
