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

// Create a text fingerprint for quick duplicate detection
// This normalizes tweets aggressively to catch near-duplicates from bot networks
function createTextFingerprint(text: string): string {
    return text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, '')           // Remove URLs
        .replace(/@\w+/g, '')                      // Remove @mentions
        .replace(/#\w+/g, '')                      // Remove hashtags  
        .replace(/[^\w\s]/g, '')                   // Remove punctuation/emojis
        .replace(/\s+/g, ' ')                      // Normalize whitespace
        .trim()
        .split(' ')
        .filter(w => w.length > 3)                 // Keep only meaningful words
        .sort()                                     // Sort alphabetically (order-independent)
        .join(' ');
}

// Spam detection thresholds
const SPAM_CONFIG = {
    // Text similarity thresholds
    EXACT_FINGERPRINT_BLOCK: true,        // Block exact fingerprint matches
    SIMILARITY_THRESHOLD: 0.80,            // Block 80%+ similar text (lowered from 90%)
    
    // Account quality thresholds (if metadata available)
    MIN_FOLLOWERS: 10,                     // Minimum followers to pass
    MIN_ACCOUNT_AGE_DAYS: 7,               // Minimum account age
    MAX_FOLLOWING_RATIO: 10,               // Max following/followers ratio (spam signal)
    
    // Lookback settings
    RECENT_DRAFTS_COUNT: 200,              // Check more drafts for duplicates (was 100)
};

// In-memory session cache to prevent race condition duplicates within same hunt cycle
// This catches same-author duplicates that arrive before first one is saved to DB
const sessionFingerprintCache = new Map<string, { handle: string; tweetId: string; timestamp: number }>();
const SESSION_CACHE_TTL_MS = 60000; // 1 minute TTL

function cleanExpiredSessionCache() {
    const now = Date.now();
    const keysToDelete: string[] = [];
    sessionFingerprintCache.forEach((value, key) => {
        if (now - value.timestamp > SESSION_CACHE_TTL_MS) {
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(key => sessionFingerprintCache.delete(key));
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

    // Create fingerprint early for session cache check
    const fingerprint = createTextFingerprint(tweet.text);
    
    // Clean expired entries from session cache
    cleanExpiredSessionCache();
    
    // SESSION CACHE: Check if same/similar content was processed in this hunt cycle
    // This prevents race condition duplicates when same author posts multiple times
    const cachedEntry = sessionFingerprintCache.get(fingerprint);
    if (cachedEntry && fingerprint.length > 20) {
        console.log(`🚫 SESSION DUPLICATE: Same content already queued in this cycle`);
        console.log(`   First: @${cachedEntry.handle} (tweet ${cachedEntry.tweetId})`);
        console.log(`   Duplicate: @${authorHandle} (tweet ${tweet.id})`);
        return false;
    }
    
    // Add to session cache immediately (before any async operations)
    if (fingerprint.length > 20) {
        sessionFingerprintCache.set(fingerprint, {
            handle: authorHandle,
            tweetId: tweet.id,
            timestamp: Date.now()
        });
    }

    // SPAM DETECTION: Check for duplicate/similar tweet text from different users
    // This catches spam campaigns where bots post identical content from multiple accounts
    const normalizedText = tweet.text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, '') // Remove URLs
        .replace(/\s+/g, ' ')           // Normalize whitespace
        .trim();
    
    // Get recent drafts to check for similarity (increased lookback)
    const recentDrafts = await db.query.postcardDrafts.findMany({
        limit: SPAM_CONFIG.RECENT_DRAFTS_COUNT,
        orderBy: (drafts, { desc }) => [desc(drafts.createdAt)],
    });

    // Build a Set of existing fingerprints for O(1) lookup
    const existingFingerprints = new Set<string>();
    
    for (const draft of recentDrafts) {
        if (!draft.originalTweetText) continue;

        // Check fingerprint match first (catches bot networks with identical content)
        const existingFingerprint = createTextFingerprint(draft.originalTweetText);
        existingFingerprints.add(existingFingerprint);
        
        if (SPAM_CONFIG.EXACT_FINGERPRINT_BLOCK && fingerprint === existingFingerprint && fingerprint.length > 20) {
            console.log(`🚫 SPAM BLOCKED: Fingerprint match from different account`);
            console.log(`   Original: @${draft.originalAuthorHandle}: "${draft.originalTweetText?.substring(0, 50)}..."`);
            console.log(`   Duplicate: @${authorHandle}: "${tweet.text.substring(0, 50)}..."`);
            return false;
        }

        const existingNormalized = draft.originalTweetText
            .toLowerCase()
            .replace(/https?:\/\/\S+/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Check for similar text (lowered threshold to catch more spam)
        const similarity = calculateSimilarity(normalizedText, existingNormalized);
        if (similarity > SPAM_CONFIG.SIMILARITY_THRESHOLD) {
            console.log(`🚫 SPAM BLOCKED: ${Math.round(similarity * 100)}% similar to existing draft`);
            console.log(`   Original: @${draft.originalAuthorHandle}: "${draft.originalTweetText?.substring(0, 50)}..."`);
            console.log(`   Similar: @${authorHandle}: "${tweet.text.substring(0, 50)}..."`);
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
    // NOTE: Image generation DISABLED for LogicArt during testing to save tokens
    // Images can be generated on-demand when approving a draft
    let imageUrl = "";
    let imageAttribution: string | null = null;

    if (campaignType === 'turai') {
        const imageResult = await drafter.generateTuraiImage(contextInfo!);
        imageUrl = imageResult.imageUrl;
        imageAttribution = imageResult.attribution;
    } else if (campaignType === 'logicart') {
        // DISABLED: Image generation during hunt to save tokens
        // imageUrl = await drafter.generateLogicArtImage(contextInfo!);
        console.log("   📷 Image generation SKIPPED (generate on approval)");
    }

    // 2b. Extract Theme
    const theme = campaignType === 'turai'
        ? await drafter.extractTheme(tweet.text)
        : await drafter.extractCodingTheme(tweet.text);
    console.log(`Detected theme: ${theme}`);

    // Determine strategy for LogicArt campaigns BEFORE generating reply
    // (needed to choose x.quack.us.com vs x.logic.art link)
    const activeStrategy = campaignType === 'logicart' ? getActiveLogicArtStrategy() : null;

    // 3. Generate Reply Text based on campaign
    console.log("Generating reply text...");
    const { text: draftReplyText, score } = await drafter.generateCampaignReply(
        authorHandle,
        contextInfo!,
        tweet.text,
        campaignType,
        activeStrategy
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

    // LogicArt deployed app URLs - using custom domain with A record (preserves query params)
    private static readonly LOGICART_LINK = "https://x.logic.art/x"; // Branded landing page
    private static readonly LOGICART_EMBED_BASE = "https://x.logic.art"; // For embed links with code
    
    // Arena URL for replies - custom domain with A record preserves ?q= parameter
    public static readonly ARENA_URL = "https://x.logic.art/x";
    
    // Quack and Orchestrate product URLs - landing pages with first-visit tracking
    private static readonly QUACK_URL = "https://x.quack.us.com";
    private static readonly ORCHESTRATE_URL = "https://x.orchestrate.us.com";

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

    // Generate a LogicArt URL - pre-populate Arena with user's question/code
    generateArenaUrl(contentToPreload: string | null): string {
        if (!contentToPreload) {
            return PostcardDrafter.LOGICART_LINK;
        }
        
        try {
            // Truncate if too long (keep URL reasonable)
            const truncated = contentToPreload.length > 400 
                ? contentToPreload.substring(0, 400) + "..." 
                : contentToPreload;
            
            const encoded = encodeURIComponent(truncated);
            
            // Use ?q= parameter to pre-populate the Arena question field
            // This matches what Arena Referee uses and the Arena page expects
            return `${PostcardDrafter.ARENA_URL}?q=${encoded}`;
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
    async saveGeneratedImage(base64Data: string, prefix: string): Promise<string> {
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
        campaignType: CampaignType,
        strategy: LogicArtStrategy | null = null
    ): Promise<{ text: string; score: number; extractedCode?: string; arenaUrl?: string }> {
        if (campaignType === 'logicart') {
            // Quack Duck strategy uses x.quack.us.com instead of x.logic.art
            const isQuackStrategy = strategy === 'quack_duck';
            
            let targetUrl: string;
            if (isQuackStrategy) {
                targetUrl = PostcardDrafter.QUACK_URL;
                console.log(`   🦆 Quack Duck strategy - using x.quack.us.com`);
            } else {
                // Pre-populate Arena with the user's original tweet/question
                targetUrl = this.generateArenaUrl(originalText);
                console.log(`   🔗 Arena URL pre-populated with user's question`);
            }
            
            const result = await this.generateLogicArtReply(author, context, originalText, targetUrl, isQuackStrategy);
            return {
                ...result,
                arenaUrl: targetUrl
            };
        }
        // Default to Turai travel reply
        return this.generateReplyText(author, context, originalText);
    }

    // LogicArt-specific reply generation
    async generateLogicArtReply(author: string, context: string, originalText: string, arenaUrl?: string, isQuackStrategy: boolean = false): Promise<{ text: string; score: number }> {
        // Use the dynamic URL - it's pre-populated with their question
        const linkToUse = arenaUrl || PostcardDrafter.LOGICART_LINK;
        const isPreloaded = arenaUrl?.includes('q=');
        
        try {
            // Quack Duck strategy uses different messaging focused on agent-to-agent communication
            if (isQuackStrategy) {
                return this.generateQuackDuckReply(author, context, originalText, linkToUse);
            }
            
            // When pre-loaded, tell them we've set up their question - they just need to click
            const codeSpecificInstructions = isPreloaded
                ? `The link already has their question pre-loaded! When they click, they'll see 4 AI models compete to answer.
                   Use phrases like "I set this up for you", "Click to watch 4 AIs battle it out", "Your question is ready - hit the link"`
                : `Encourage them to try the AI Arena for their coding questions.
                   Use phrases like "Throw your question into", "Try asking", "Get 4 AI opinions"`;
            
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
            1. Tone: Friendly senior developer, empathetic, confident. Use emojis sparingly: 🧠, 💡, ⚡, 🔍, 🥊
            2. Structure your reply:
               - Acknowledge their struggle (empathy first)
               - Mention the AI Arena where 4 AI models compete to help
               - Include the link naturally
            3. Example patterns (question is pre-loaded in the link):
               - "I set up your question for the AI Arena - 4 models will battle it out: [LINK] 🥊"
               - "Let's see what 4 AIs think! I loaded your question here: [LINK] 💡"
               - "Interesting challenge! Watch 4 AIs compete to solve it: [LINK] 🧠"
               - "4 AI models enter, 1 answer wins. Your question is ready: [LINK] ⚡"
            4. **CRITICAL**: You MUST include "[LINK]" placeholder - I will replace it with the actual URL.
            5. **CRITICAL**: Be genuinely helpful, not salesy. The link has their question pre-loaded.
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
                let replyText = parsed.reply || `That's a tricky one, @${author}! I loaded your question into the AI Arena - 4 models will battle it out: [LINK] 🥊`;
                
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
                    text: `That's a tricky one, @${author}! I loaded your question for the AI Arena - watch 4 models compete: ${linkToUse} 🥊`,
                    score: 50
                };
            }

        } catch (error) {
            console.error("Error generating LogicArt reply:", error);
            return {
                text: `That's a tricky one, @${author}! Your question is ready in the AI Arena - 4 models will battle it out: ${linkToUse} 🥊`,
                score: 50
            };
        }
    }

    // Quack Duck strategy - focuses on agent-to-agent communication for multi-AI workflows
    async generateQuackDuckReply(author: string, context: string, originalText: string, quackUrl: string): Promise<{ text: string; score: number }> {
        try {
            const systemPrompt = `
            You are "The Quack Duck" 🦆 - a friendly helper who understands the pain of copying/pasting between AI tools.
            
            Your Goal: 
            1. Analyze the tweet for "Quack Lead Quality" and assign a Score (0-99).
               - 80-99: Strong Lead. Frustrated with switching between Claude/GPT/Cursor/Replit, multi-tool workflow pain.
               - 60-79: Moderate Lead. General AI tool discussion, might benefit from better workflows.
               - 0-59: Weak Lead. Not actually struggling with multi-AI workflows.
            
            2. Write a short, helpful reply that:
               - Acknowledges their multi-AI workflow frustration
               - Introduces Quack as the solution where AI agents talk directly
               - Includes the x.quack.us.com link
            
            Rules:
            1. Tone: Playful, relatable, uses duck references. Key emoji: 🦆 (always include!)
            2. Other emojis: 🔗 ⚡ 🚀
            3. Key messaging: "Agents talking to each other" / "No more copy/paste" / "Your AIs can communicate"
            4. Structure your reply:
               - Acknowledge their tool-switching frustration
               - Mention Quack as the solution
               - Include the link naturally
            5. Example patterns:
               - "Sounds like you're waddling between too many AI tabs! 🦆 Quack lets your agents talk directly: [LINK]"
               - "The clipboard fatigue is real! 🦆 What if your AIs could just... talk to each other? [LINK] 🔗"
               - "No more copy/paste relay race! 🦆 Quack connects your AI tools so they communicate: [LINK] ⚡"
            6. **CRITICAL**: You MUST include "[LINK]" placeholder - I will replace it with the actual URL.
            7. Length: Keep it under 240 characters (Twitter limit with link).

            Output Format: JSON
            {
                "score": 85,
                "reply": "Your example reply with [LINK] placeholder"
            }
            `;

            const userPrompt = `Reply to @${author} who tweeted: "${originalText}". Context: ${context}. Return JSON.`;

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
                let replyText = parsed.reply || `The tool-switching struggle is real, @${author}! 🦆 What if your AIs could just talk to each other? [LINK] ⚡`;
                
                // Replace [LINK] placeholder with x.quack.us.com URL
                if (/\[LINK\]/gi.test(replyText)) {
                    replyText = replyText.replace(/\[LINK\]/gi, quackUrl);
                } else {
                    console.log("   ⚠️ Gemini omitted [LINK] placeholder, appending URL");
                    replyText = replyText.trim() + ` ${quackUrl}`;
                }
                
                return {
                    text: replyText,
                    score: parsed.score || 50
                };
            } catch (e) {
                console.error("Failed to parse Quack Duck AI JSON response:", resultText);
                return {
                    text: `The clipboard fatigue is real, @${author}! 🦆 What if your AIs could just talk to each other? ${quackUrl} ⚡`,
                    score: 50
                };
            }

        } catch (error) {
            console.error("Error generating Quack Duck reply:", error);
            return {
                text: `No more copy/paste relay race, @${author}! 🦆 Quack connects your AI tools: ${quackUrl} ⚡`,
                score: 50
            };
        }
    }

    // Generate reply for Manual Post Creator (used from Campaign Details page)
    async generateManualReply(originalTweet: string, author: string, strategy: string): Promise<{ reply: string; arenaUrl: string }> {
        const arenaUrl = this.generateArenaUrl(originalTweet);
        
        // Strategy-specific personas with distinct tones and approaches
        const strategyConfig: Record<string, { persona: string; style: string; focus: string }> = {
            vibe_scout: {
                persona: "The Vibe Scout - a friendly senior developer who spots coders needing help",
                style: "Warm, encouraging, uses casual tech speak. Emojis: 🔍 💡 ⚡",
                focus: "Acknowledge their struggle, offer the AI Arena as a collaborative debugging tool"
            },
            spaghetti_detective: {
                persona: "The Spaghetti Detective - an expert at untangling messy, chaotic code",
                style: "Playful but sharp, uses food/detective metaphors. Emojis: 🍝 🔎 🧵",
                focus: "Reference the complexity of their code problem, promise to help untangle it"
            },
            bootcamp_savior: {
                persona: "The Bootcamp Savior - a patient mentor who helps struggling learners",
                style: "Nurturing, patient, no jargon. Emojis: 📚 🌟 💪",
                focus: "Be extra encouraging, acknowledge learning is hard, emphasize getting multiple perspectives"
            },
            arena_referee: {
                persona: "The Arena Referee - an expert at comparing different AI approaches",
                style: "Authoritative but fun, uses competition metaphors. Emojis: 🥊 🏆 ⚔️",
                focus: "Emphasize the AI competition aspect, which model will win for their problem"
            },
            code_flowchart: {
                persona: "The Flowchart Wizard - a specialist in visualizing and mapping code logic",
                style: "Methodical, visual thinker, diagram references. Emojis: 📊 🗺️ 🎨",
                focus: "Offer to break down their problem visually, map out the logic flow"
            },
            quack_duck: {
                persona: "The Quack Duck - a friendly helper who hates copy/paste between AI tools",
                style: "Playful, relatable, uses duck references. Emojis: 🦆 🔗 ⚡",
                focus: "Relate to their multi-AI frustration, introduce Quack as the solution to clipboard fatigue"
            }
        };
        
        const config = strategyConfig[strategy] || strategyConfig.vibe_scout;
        
        // Use x.quack.us.com for Quack strategy, Arena URL for others
        const isQuackStrategy = strategy === 'quack_duck';
        const linkUrl = isQuackStrategy ? PostcardDrafter.QUACK_URL : arenaUrl;
        const linkDomain = isQuackStrategy ? 'x.quack.us.com' : 'x.logic.art';
        
        // Different prompt structure for Quack vs Arena strategies
        const quackPrompt = `You are ${config.persona} on Twitter/X.

Style: ${config.style}
Focus: ${config.focus}

Write a helpful, engaging reply to this tweet from @${author}:
"${originalTweet}"

CRITICAL REQUIREMENTS:
1. Be genuinely helpful and match the persona's style
2. Relate to their frustration with switching between AI tools (Claude, GPT, Cursor, Replit, etc.)
3. Position Quack as the solution - agents can talk directly, no more copy/paste
4. YOU MUST include this EXACT link: ${linkUrl}
5. Use appropriate emojis for your persona (🦆 is key!)
6. Keep under 260 characters total (including the link!)

Just output the reply text with the link included, nothing else.`;

        const arenaPrompt = `You are ${config.persona} on Twitter/X.

Style: ${config.style}
Focus: ${config.focus}

Write a helpful, engaging reply to this tweet from @${author}:
"${originalTweet}"

CRITICAL REQUIREMENTS:
1. Be genuinely helpful and match the persona's style
2. Acknowledge their specific issue in a way that shows you understand
3. Mention that 4 AI models will compete to help them
4. YOU MUST include this EXACT link: ${linkUrl}
5. Use appropriate emojis for your persona
6. Keep under 260 characters total (including the link!)

Just output the reply text with the link included, nothing else.`;
        
        try {
            const response = await genAI.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [{
                    role: 'user',
                    parts: [{
                        text: isQuackStrategy ? quackPrompt : arenaPrompt
                    }]
                }]
            });
            
            let reply = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            
            // Ensure the correct URL is included (safeguard)
            if (reply && !reply.includes(linkDomain)) {
                reply = reply.trim() + ` ${linkUrl}`;
            }
            
            // Strategy-specific fallback messages
            const fallbackReply = isQuackStrategy 
                ? `Hey @${author}! Tired of copy/paste between AI tools? 🦆 Quack lets your agents talk directly - Claude to Replit, GPT to Cursor. ${linkUrl}`
                : `Hey @${author}! Interesting challenge. I set up your question for the AI Arena - watch 4 AIs battle it out: ${linkUrl} 🥊`;
            
            return {
                reply: reply || fallbackReply,
                arenaUrl: linkUrl
            };
        } catch (error) {
            console.error("Error generating manual reply:", error);
            const errorFallback = isQuackStrategy
                ? `Hey @${author}! Stop being a human clipboard! 🦆 Quack connects your AI tools directly: ${linkUrl}`
                : `Hey @${author}! That's a tricky one. I loaded your question for 4 AI models to compete on: ${linkUrl} 🥊`;
            return {
                reply: errorFallback,
                arenaUrl: linkUrl
            };
        }
    }

    // Generate image for Manual Post Creator
    async generateManualImage(context: string, customPrompt?: string): Promise<string> {
        try {
            let imagePrompt: string;
            
            // Use custom prompt if provided, otherwise generate from context
            if (customPrompt && customPrompt.trim()) {
                imagePrompt = customPrompt.trim();
                console.log("🎨 Using custom image prompt:", imagePrompt);
            } else {
                // Extract a visual theme from the context
                const themeResponse = await genAI.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: [{
                        role: 'user',
                        parts: [{
                            text: `Based on this coding/tech context: "${context.substring(0, 200)}"
                        
Generate a short image prompt for a tech-themed illustration.
Focus on: code, algorithms, AI, debugging, programming concepts.
Style: Modern, professional, abstract tech art.
Keep it under 50 words. Just output the image prompt, nothing else.`
                        }]
                    }]
                });
                
                imagePrompt = themeResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim() 
                    || "abstract technology visualization with code symbols and neural network patterns";
            }
            
            // Use Pollinations AI for image generation
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?nologo=true&width=800&height=450`;
            
            return pollinationsUrl;
        } catch (error) {
            console.error("Error generating manual image:", error);
            // Fallback to a generic tech image
            return `https://image.pollinations.ai/prompt/${encodeURIComponent("abstract coding technology visualization with glowing code symbols")}?nologo=true&width=800&height=450`;
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

        // Generate appropriate image based on campaign type and strategy
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
        } else if (draft.strategy === 'code_flowchart') {
            // Code Flowchart: Generate actual flowchart from the tweet's code
            const extracted = extractCodeFromTweet(draft.originalTweetText || '');
            if (extracted) {
                const language = extracted.language !== 'unknown' 
                    ? extracted.language 
                    : detectLanguage(extracted.code);
                imageUrl = await generateCodeFlowchartImage(extracted.code, language, extracted.isDescription);
            } else {
                // Fallback if code extraction fails
                imageUrl = await this.generateLogicArtImage('code flowchart');
            }
        } else {
            // LogicArt (other strategies): coding/flowchart themed image
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

    // Fallback curated Arena Referee images (variety of competition themes)
    private static readonly ARENA_IMAGES = [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=800&fit=crop", // Chess pieces
        "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800&h=800&fit=crop", // Cyclists racing
        "https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?w=800&h=800&fit=crop", // Boxing
        "https://images.unsplash.com/photo-1547347298-4074fc3086f0?w=800&h=800&fit=crop", // Runners
        "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=800&fit=crop", // Medieval castle
        "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=800&fit=crop", // Gym competition
    ];
    
    // Generate AI debate/cage match themed image using Gemini AI
    async generateArenaRefereeImage(winnerModel: string, tweetContent?: string): Promise<string> {
        try {
            // Extract a topic from the tweet for visual variety
            const topicContext = tweetContent 
                ? await this.extractDebateVisualTheme(tweetContent)
                : "artificial intelligence debate";
            
            // Wide variety of visual metaphors - not just futuristic!
            const visualScenes = [
                // Western
                { scene: "Old West high noon gunfight showdown", style: "two gunslingers facing off in a dusty frontier town, dramatic shadows, sepia and golden tones", subjects: "cowboys with distinctive hats" },
                { scene: "Wild West saloon poker game climax", style: "tense card game moment, whiskey glasses, dramatic lighting through swinging doors", subjects: "frontier gamblers" },
                
                // Medieval
                { scene: "Medieval knights jousting tournament", style: "armored knights on horseback charging with lances, royal banners flying, castle in background", subjects: "knights in shining armor" },
                { scene: "Epic sword duel in a stone castle courtyard", style: "two warriors clashing swords, sparks flying, torchlit medieval atmosphere", subjects: "medieval swordsmen" },
                { scene: "Chess masters in a grand medieval hall", style: "giant chess pieces, dramatic overhead lighting, strategic intensity", subjects: "robed scholars or kings" },
                
                // Sports & Competition
                { scene: "Olympic sprint finish line moment", style: "runners breaking the tape, stadium crowd blur, freeze-frame action", subjects: "athletes in motion" },
                { scene: "Boxing championship final round", style: "two boxers in the ring, dramatic spotlights, sweat and determination", subjects: "heavyweight champions" },
                { scene: "Formula 1 race photo finish", style: "two race cars neck and neck, speed blur, checkered flag waving", subjects: "racing machines" },
                { scene: "Tennis grand slam match point", style: "player mid-serve, packed stadium, intense concentration", subjects: "tennis champions" },
                
                // Nature & Animals
                { scene: "Lions facing off on African savanna", style: "two majestic lions, golden hour lighting, dramatic tension", subjects: "king of beasts" },
                { scene: "Eagles soaring and competing in mountain peaks", style: "majestic birds of prey, snow-capped mountains, blue sky drama", subjects: "powerful eagles" },
                { scene: "Wolves in a snowy forest standoff", style: "alpha wolves, winter forest, moonlit atmosphere", subjects: "noble wolves" },
                
                // Classical & Historical
                { scene: "Roman gladiators in the Colosseum", style: "ancient arena, roaring crowd, sand and blood, classical architecture", subjects: "legendary warriors" },
                { scene: "Samurai duel at cherry blossom shrine", style: "Japanese garden, falling petals, katanas drawn, zen intensity", subjects: "honorable samurai" },
                { scene: "Greek philosophers debating in the Agora", style: "marble columns, togas, animated discussion, Athenian architecture", subjects: "wise thinkers" },
                
                // Modern & Urban
                { scene: "Courtroom drama verdict moment", style: "wood-paneled courtroom, gavel raised, tense anticipation", subjects: "lawyers in suits" },
                { scene: "Corporate boardroom power negotiation", style: "glass skyscraper, city views, intense business meeting", subjects: "executives" },
                
                // Mythical & Fantasy
                { scene: "Dragons battling over a mountain fortress", style: "fire and ice dragons, epic fantasy, stormy skies", subjects: "mythical beasts" },
                { scene: "Wizard duel with magical energy", style: "robed mages, colorful spell effects, mystical arena", subjects: "powerful sorcerers" }
            ];
            
            const randomScene = visualScenes[Math.floor(Math.random() * visualScenes.length)];
            
            const imagePrompt = `Create a dramatic competition image representing an intellectual debate.
Scene: ${randomScene.scene}
Visual style: ${randomScene.style}
Subjects: ${randomScene.subjects}
Context: This represents a debate about "${topicContext}" - use this to influence color choices or subtle details.
Winner energy: One side should appear victorious or dominant.
Mood: Epic, dramatic, the thrill of competition and victory.
Quality: Cinematic, high contrast, professional photography or illustration style.
IMPORTANT: No text, no letters, no words, no logos, no writing anywhere - pure visual art only.`;

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

    // QUALITY FILTER: Skip retweets - they're always low quality
    const lowerText = tweet.text.toLowerCase();
    if (lowerText.startsWith('rt @') || lowerText.includes(' rt @')) {
        console.log(`❌ FILTERED: Retweet skipped - @${authorHandle}`);
        return false;
    }

    // QUALITY FILTER: Check negative intent signals for arena_referee strategy
    const negativeSignals = strategy.intentSignals.negative;
    for (const signal of negativeSignals) {
        if (lowerText.includes(signal.toLowerCase())) {
            console.log(`❌ FILTERED: Negative signal "${signal}" found - @${authorHandle}: "${tweet.text.substring(0, 50)}..."`);
            return false;
        }
    }

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
        
        // Generate the Quote Tweet text with pre-populated Arena link
        const quoteText = generateArenaVerdictText({
            winner: arenaResult.winner,
            winnerReason: arenaResult.winnerReason,
            responses: arenaResult.responses
        }, authorHandle, tweet.text);
        
        // DEFER image generation until post time to save compute
        // Image will be generated when the draft is approved and about to be posted
        console.log(`⏳ Skipping image generation - will generate on-demand before posting`);
        let imageUrl = "";
        
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
            turaiImageUrl: imageUrl, // AI-generated battle image
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
 * Build Arena URL with optional pre-populated question
 */
function buildArenaUrl(question?: string): string {
    const baseUrl = PostcardDrafter.ARENA_URL;
    if (!question) return baseUrl;
    
    // Truncate very long questions to avoid excessively long URLs
    const maxLength = 500;
    const truncated = question.length > maxLength 
        ? question.substring(0, maxLength) + "..." 
        : question;
    
    return `${baseUrl}?q=${encodeURIComponent(truncated)}`;
}

/**
 * Generate the Quote Tweet text for an Arena verdict
 * NOTE: Twitter limit is 280 chars. URL takes ~23 chars (t.co shortening).
 * Keep templates SHORT to avoid cutoff!
 */
function generateArenaVerdictText(
    arenaResult: { winner: string; winnerReason?: string; responses: any[] },
    authorHandle: string,
    originalQuestion?: string
): string {
    const winner = arenaResult.winner;
    const reasoning = arenaResult.winnerReason || "Best clarity and accuracy.";
    
    // For Quote Tweets, use simple URL - users can see the quoted tweet as the question
    // This keeps the tweet SHORT (no long encoded query param)
    const arenaUrl = PostcardDrafter.ARENA_URL;
    
    // Keep reasoning SHORT - max 60 chars to fit in tweet safely
    const shortReason = reasoning.length > 60 ? reasoning.substring(0, 57) + "..." : reasoning;
    
    // Templates designed to stay well under 280 chars
    // ~35 chars header + ~60 chars reason + ~25 chars CTA + ~15 chars URL = ~135 chars max
    const templates = [
        `🏛️ AI Council verdict: ${winner} wins!\n\n"${shortReason}"\n\n👉 ${arenaUrl}`,
        `The AI Council has spoken! 🏛️\n\n🏆 ${winner}\n\n${shortReason}\n\n${arenaUrl}`,
        `🏟️ VERDICT: ${winner}\n\n${shortReason}\n\n🔗 ${arenaUrl}`,
    ];
    
    // Pick a random template for variety
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    return template;
}

export const postcardDrafter = new PostcardDrafter();

// ============= CODE FLOWCHART STRATEGY =============

/**
 * Phrases that indicate promotional/educational content we should skip
 */
const PROMO_BLOCKLIST = [
    /free courses?/i, /paid courses?/i, /courses?\s+free/i, // "free course", "paid courses", "courses FREE"
    /free for first/i, /\bfree\b.*\btraining\b/i,
    /bootcamp/i, /scholarship/i, /enroll now/i, /sign up/i, /register now/i,
    /limited time/i, /discount/i, /\$\d+.*off/i, /sale\b/i,
    /learn \w+ in \d+ (days?|weeks?|months?)/i,
    /complete (course|guide|tutorial)/i,
    /masterclass/i, /webinar/i, /workshop/i,
    /please (learn|follow|subscribe|retweet)/i,
    /must know/i, /you need to learn/i, /every developer should/i,
    /\d+ (tips|tricks|skills|things)/i, // "10 tips", "5 things to know"
    /roadmap/i, /curriculum/i, /certification/i,
    /join (our|my|the)/i, /dm me/i, /link in bio/i,
    /first \d+ people/i, /part\s*-?\s*\d+\)/i, // "First 4500 People", "PART - 1)"
    /all paid/i, /course free/i, // "All Paid", "Course FREE"
    /\(free\s+for/i, // "(Free for First..."
];

/**
 * Check if tweet is promotional content we should skip
 */
function isPromoContent(text: string): boolean {
    for (const pattern of PROMO_BLOCKLIST) {
        if (pattern.test(text)) return true;
    }
    return false;
}

/**
 * Detect if a tweet contains ACTUAL code worth visualizing
 * Balanced detection - catches real code while rejecting promo content
 */
export function detectCodeInTweet(tweetText: string): boolean {
    // FIRST: Reject promotional/educational content
    if (isPromoContent(tweetText)) {
        console.log(`🚫 Code Flowchart: Rejected promo content`);
        return false;
    }
    
    // LANGUAGE FILTER: Skip tweets with high CJK/Thai/Korean content unless strong code signals
    // CJK characters often get misdetected due to symbol density
    const cjkPattern = /[\u3000-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/g;
    const cjkMatches = tweetText.match(cjkPattern) || [];
    const cjkRatio = cjkMatches.length / tweetText.length;
    
    // If >30% CJK characters, require VERY strong code signals (code fences or explicit keywords)
    const highCJKContent = cjkRatio > 0.3;
    
    if (highCJKContent) {
        // Only accept if it has code fences - the clearest signal
        if (tweetText.includes('```')) {
            console.log(`✅ Code Flowchart: CJK tweet accepted - has code fences`);
            return true;
        }
        console.log(`🚫 Code Flowchart: Rejected high CJK content (${Math.round(cjkRatio * 100)}% CJK chars)`);
        return false;
    }
    
    // SCORING SYSTEM: Require multiple code signals for confidence
    let codeScore = 0;
    const THRESHOLD = 3; // Need at least 3 points to be considered code
    
    // Code fences (strongest signal - 5 points)
    if (tweetText.includes('```')) codeScore += 5;
    
    // STRONG SIGNALS (2 points each) - Language-specific keywords with structure
    const strongPatterns = [
        /function\s+\w+\s*\(/,           // function declarations
        /const\s+\w+\s*=/,               // const declarations
        /let\s+\w+\s*=/,                 // let declarations
        /def\s+\w+\s*\(/,                // Python function def
        /class\s+\w+\s*[:{(]/,           // class definitions
        /import\s+[\w{]+\s+from/,        // ES6 imports
        /from\s+\w+\s+import/,           // Python from import
        /=>\s*[{(]/,                     // arrow functions
        /async\s+(function|\w+\s*=>?)/,  // async functions
        /try\s*{[\s\S]*catch/,           // try/catch blocks
        /pub\s+fn|fn\s+\w+\s*\(/,        // Rust fn
        /func\s+\w+\(/,                  // Go func
    ];
    
    for (const pattern of strongPatterns) {
        if (pattern.test(tweetText)) codeScore += 2;
    }
    
    // MEDIUM SIGNALS (1 point each) - Common code patterns
    const mediumPatterns = [
        /console\.log\(/,                // console.log
        /print\([^)]+\)/,                // Python print
        /return\s+\w+/,                  // return statements
        /\.map\(|\.filter\(|\.reduce\(/, // array methods
        /if\s*\(.+\)\s*{/,               // if statements with braces
        /for\s*\(.+\)\s*{/,              // for loops with braces
        /while\s*\(.+\)\s*{/,            // while loops
        /\[\s*\w+\s+for\s+\w+\s+in/,     // Python list comprehension
        /===|!==|===/,                   // strict equality operators
        /\+=|-=|\*=|\/=/,                // compound assignment
        /\w+\.\w+\(/,                    // method calls (obj.method())
    ];
    
    for (const pattern of mediumPatterns) {
        if (pattern.test(tweetText)) codeScore += 1;
    }
    
    // ERROR MESSAGES (2 points) - Stack traces and errors
    const errorPatterns = [
        /TypeError:|SyntaxError:|ReferenceError:/i,
        /NameError:|ValueError:|AttributeError:/i,
        /undefined is not|is not defined/i,
        /cannot read propert/i,
        /Traceback \(most recent/i,
        /Uncaught \w+Error:/i,
    ];
    
    for (const pattern of errorPatterns) {
        if (pattern.test(tweetText)) codeScore += 2;
    }
    
    // STRUCTURAL SIGNALS (1 point each) - Code-specific structures
    const hasBracePairs = /\{[^}]+\}/.test(tweetText);
    const hasParenWithContent = /\([^)]{3,}\)/.test(tweetText);
    const hasSemicolons = (tweetText.match(/;/g) || []).length >= 2;
    const hasIndentation = /\n\s{2,}\w/.test(tweetText);
    
    if (hasBracePairs) codeScore += 1;
    if (hasParenWithContent) codeScore += 0.5;
    if (hasSemicolons) codeScore += 1;
    if (hasIndentation) codeScore += 1;
    
    // Log the score for debugging
    if (codeScore > 0) {
        console.log(`📊 Code Flowchart: Score ${codeScore}/${THRESHOLD} for tweet`);
    }
    
    return codeScore >= THRESHOLD;
}

/**
 * Extract ACTUAL code from a tweet
 * Balanced extraction - handles multiple languages without false positives
 */
export function extractCodeFromTweet(tweetText: string): { code: string; language: string; isDescription?: boolean } | null {
    // Reject promo content first
    if (isPromoContent(tweetText)) {
        return null;
    }
    
    // Try to extract fenced code block first (best case)
    const fenceMatch = tweetText.match(/```(\w*)\n?([\s\S]*?)```/);
    if (fenceMatch) {
        const language = fenceMatch[1] || 'unknown';
        const code = fenceMatch[2].trim();
        if (code.length > 10) {
            return { code, language };
        }
    }
    
    // Try to extract inline code patterns - recognize multiple languages
    const lines = tweetText.split('\n');
    const codeLines = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        
        // JavaScript/TypeScript patterns
        const isJS = (
            trimmed.match(/^\s*(const|let|var)\s+\w+\s*=/) ||
            trimmed.match(/^\s*function\s+\w+\s*\(/) ||
            trimmed.match(/^\s*(if|for|while)\s*\(.+\)\s*{/) ||
            trimmed.includes(';') && trimmed.includes('=') ||
            trimmed.match(/console\.log\(/) ||
            trimmed.match(/=>\s*[{(]/)
        );
        
        // Python patterns (no semicolons/braces needed)
        const isPython = (
            trimmed.match(/^\s*def\s+\w+\s*\(/) ||
            trimmed.match(/^\s*class\s+\w+.*:/) ||
            trimmed.match(/^\s*(if|for|while|elif|else)\s+.*:/) ||
            trimmed.match(/^\s*(import|from)\s+\w+/) ||
            trimmed.match(/print\([^)]+\)/) ||
            trimmed.match(/\[\s*\w+\s+for\s+\w+\s+in/)
        );
        
        // Generic code patterns
        const isCode = (
            trimmed.includes('{') && trimmed.includes('}') ||
            trimmed.match(/^\s*return\s+/) ||
            trimmed.match(/^\s*\w+\s*=\s*\[.*\]/) // array assignment
        );
        
        return isJS || isPython || isCode;
    });
    
    if (codeLines.length >= 1) { // Even 1 line of clear code is enough
        return { code: codeLines.join('\n'), language: 'unknown' };
    }
    
    // Check for error message with stack trace (worthy of flowchart)
    const hasStackTrace = /TypeError:|SyntaxError:|ReferenceError:|NameError:|ValueError:|Traceback|at line \d+|Uncaught \w+Error:/i.test(tweetText);
    if (hasStackTrace) {
        const cleanText = tweetText
            .replace(/@\w+/g, '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/RT\s+/g, '')
            .trim();
        if (cleanText.length > 30) {
            return { code: cleanText, language: 'error', isDescription: true };
        }
    }
    
    // NO FALLBACK - don't create flowcharts for non-code tweets
    return null;
}

/**
 * Detect the programming language from code snippet
 */
export function detectLanguage(code: string): string {
    const patterns: { [key: string]: RegExp[] } = {
        python: [/def\s+\w+\(/, /print\(/, /import\s+\w+/, /from\s+\w+\s+import/, /:\s*$/, /elif\s+/],
        javascript: [/const\s+\w+/, /let\s+\w+/, /var\s+\w+/, /=>\s*{/, /console\.log/, /require\(/, /module\.exports/],
        typescript: [/:\s*(string|number|boolean|any|void)/, /interface\s+\w+/, /<\w+>/, /as\s+\w+/],
        java: [/public\s+class/, /public\s+static\s+void\s+main/, /System\.out\.print/],
        rust: [/fn\s+\w+/, /let\s+mut/, /impl\s+\w+/, /pub\s+fn/, /::new\(\)/],
        go: [/func\s+\w+/, /package\s+main/, /fmt\.Print/],
        ruby: [/def\s+\w+/, /end\s*$/, /puts\s+/, /@\w+\s*=/],
        php: [/<\?php/, /\$\w+\s*=/, /echo\s+/],
        sql: [/SELECT\s+/i, /FROM\s+/i, /WHERE\s+/i, /INSERT\s+INTO/i],
    };
    
    let maxMatches = 0;
    let detectedLang = 'unknown';
    
    for (const [lang, regexes] of Object.entries(patterns)) {
        const matches = regexes.filter(r => r.test(code)).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            detectedLang = lang;
        }
    }
    
    return detectedLang;
}

/**
 * Generate a flowchart image from code using Gemini
 * Handles both literal code and problem descriptions
 */
async function generateCodeFlowchartImage(code: string, language: string, isDescription: boolean = false): Promise<string> {
    try {
        console.log(`📊 Generating flowchart for ${isDescription ? 'problem description' : language + ' code'}...`);
        
        // Different prompts for actual code vs problem descriptions
        let analysisPrompt: string;
        
        if (isDescription || language === 'description') {
            // For problem descriptions, create a conceptual debugging flowchart
            analysisPrompt = `A developer is asking about this coding problem:

"${code.substring(0, 500)}"

Create a simple debugging/solution flowchart in 3-5 steps:
- Problem identification
- Possible causes
- Debug approach
- Solution path

Keep it simple and visual-friendly for a flowchart.`;
        } else {
            // For actual code, analyze the logic flow
            analysisPrompt = `Analyze this ${language} code and describe its logical flow in simple terms for a flowchart visualization:

\`\`\`${language}
${code.substring(0, 500)}
\`\`\`

Describe in 3-5 bullet points:
- What the code does
- The main control flow (loops, conditions, branches)
- Key steps/operations

Keep it simple and visual-friendly.`;
        }

        const analysisResult = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: analysisPrompt,
        });
        
        const flowDescription = analysisResult.text || "A code flowchart showing program logic";
        
        // Now generate the flowchart image
        const imagePrompt = `Create a clean, professional flowchart diagram visualizing this code logic:

${flowDescription}

Style:
- Clean, modern flowchart with boxes, diamonds (decisions), and arrows
- Use standard flowchart shapes: rectangles for processes, diamonds for conditions, ovals for start/end
- Color scheme: Professional blue and white, subtle gradients
- Clear directional arrows showing flow
- Minimal text labels inside shapes
- Dark background with light elements OR light background with dark elements
- High contrast for readability

DO NOT include any actual code text - just the visual flowchart diagram.
NO text, letters, or words that could be misread - use icons/symbols where needed.`;

        const imageGenAI = new GoogleGenAI({
            apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "dummy",
            httpOptions: {
                apiVersion: "",
                baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
            },
        });

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
            const imageUrl = await postcardDrafter.saveGeneratedImage(imagePart.inlineData.data, "flowchart");
            console.log("📊 Flowchart image generated successfully:", imageUrl);
            return imageUrl;
        }
    } catch (error) {
        console.error("Error generating flowchart image:", error);
    }

    // Fallback to a curated flowchart image
    console.log("Falling back to curated flowchart image");
    const fallbackImages = [
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=800&fit=crop", // Tech diagram
        "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=800&fit=crop", // Data flow
    ];
    return fallbackImages[Math.floor(Math.random() * fallbackImages.length)];
}

/**
 * Code Flowchart Strategy - Generate Quote Tweet drafts with flowchart visualizations
 * 
 * Flow:
 * 1. Find tweet containing code snippet
 * 2. Extract and analyze the code
 * 3. Generate a flowchart visualization
 * 4. Create a Quote Tweet draft with the flowchart + Arena CTA
 */
export async function generateCodeFlowchartDraft(
    tweet: { id: string; text: string; author_id?: string },
    authorHandle: string,
    force: boolean = false
): Promise<boolean> {
    const strategy = LOGICART_STRATEGIES.code_flowchart;
    console.log(`${strategy.emoji} Code Flowchart: Processing tweet ${tweet.id} from @${authorHandle}`);

    // QUALITY FILTER: Skip retweets - they're always low quality
    const lowerText = tweet.text.toLowerCase();
    if (lowerText.startsWith('rt @') || lowerText.includes(' rt @')) {
        console.log(`❌ FILTERED: Retweet skipped - @${authorHandle}`);
        return false;
    }

    // QUALITY FILTER: Check negative intent signals for code_flowchart strategy
    const negativeSignals = strategy.intentSignals.negative;
    for (const signal of negativeSignals) {
        if (lowerText.includes(signal.toLowerCase())) {
            console.log(`❌ FILTERED: Negative signal "${signal}" found - @${authorHandle}`);
            return false;
        }
    }

    // Check if draft already exists
    const existing = await db.query.postcardDrafts.findFirst({
        where: eq(postcardDrafts.originalTweetId, tweet.id),
    });

    if (existing) {
        console.log(`Draft already exists for tweet ${tweet.id}. Skipping.`);
        return false;
    }

    // Verify tweet actually contains code
    if (!detectCodeInTweet(tweet.text)) {
        console.log(`No code detected in tweet ${tweet.id}. Skipping.`);
        return false;
    }

    try {
        // Extract code from the tweet
        const extracted = extractCodeFromTweet(tweet.text);
        if (!extracted) {
            console.log(`Could not extract code from tweet ${tweet.id}. Skipping.`);
            return false;
        }
        
        // Detect language if not specified
        const language = extracted.language !== 'unknown' 
            ? extracted.language 
            : detectLanguage(extracted.code);
        
        console.log(`📊 Extracted ${language} ${extracted.isDescription ? 'problem description' : 'code'} (${extracted.code.length} chars)`);
        
        // DEFER image generation until post time to save compute
        // Image will be generated when the draft is approved and about to be posted
        console.log(`⏳ Skipping flowchart generation - will generate on-demand before posting`);
        let imageUrl = "";
        
        // Generate the Quote Tweet text
        const quoteText = generateFlowchartQuoteText(language, authorHandle);
        
        // Calculate score based on code complexity/interest
        const codeLength = extracted.code.length;
        const hasQuestion = tweet.text.includes('?');
        let score = 70;
        if (codeLength > 100) score += 5;
        if (codeLength > 200) score += 5;
        if (hasQuestion) score += 10;
        if (language !== 'unknown') score += 5;
        score = Math.min(95, score);
        
        // Save the draft
        await db.insert(postcardDrafts).values({
            campaignType: "logicart",
            strategy: "code_flowchart",
            originalTweetId: tweet.id,
            originalAuthorHandle: authorHandle,
            originalTweetText: tweet.text,
            detectedLocation: language, // Reusing field for detected language
            status: "pending_review",
            draftReplyText: quoteText,
            turaiImageUrl: imageUrl,
            actionType: "quote_tweet",
            arenaVerdict: {
                winner: "flowchart",
                reasoning: extracted.isDescription 
                    ? `Detected problem description in tweet, converted to visual flowchart for easier understanding`
                    : `Detected ${language.charAt(0).toUpperCase() + language.slice(1)} code in tweet, converted to visual flowchart`,
                responses: []
            },
            score: score,
        });
        
        console.log(`✅ ${strategy.emoji} Code Flowchart draft saved! Language: ${language}, Score: ${score}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Code Flowchart draft failed:`, error);
        return false;
    }
}

/**
 * Generate the Quote Tweet text for a code flowchart
 */
function generateFlowchartQuoteText(language: string, authorHandle: string): string {
    const arenaUrl = PostcardDrafter.ARENA_URL;
    const langDisplay = language !== 'unknown' ? language.charAt(0).toUpperCase() + language.slice(1) : 'Your';
    
    const templates = [
        `Your code mapped out 📊\n\nHere's the logic flow visualized.\n\nWant 4 AI models to analyze this? Run it through the gauntlet 👉 ${arenaUrl}`,
        `${langDisplay} logic flow 📊\n\nSometimes seeing the big picture helps!\n\n🤖 Want multiple AI opinions on your code? → ${arenaUrl}`,
        `Here's your code as a flowchart 📊\n\nLogic never looked so clear.\n\nNeed AI-powered debugging? Try the Arena → ${arenaUrl}`,
        `Code → Flowchart 📊\n\n@${authorHandle} sometimes visualization helps spot the issue!\n\n🏟️ Run it through 4 AIs: ${arenaUrl}`,
    ];
    
    return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * QUACK LAUNCH CAMPAIGN
 * 
 * Simple mystery campaign - just quote tweets code posts with "Quack?"
 * No AI generation needed - just the word "Quack?" with a video attachment (future)
 * The goal is to create curiosity - people will ask Grok what it means
 */
export async function generateQuackLaunchDraft(
    tweet: { id: string; text: string; author_id?: string },
    authorHandle: string
): Promise<boolean> {
    console.log(`🚀 Generating Quack Launch draft for tweet ${tweet.id} from @${authorHandle}`);
    
    // Check if draft already exists
    const existing = await db.query.postcardDrafts.findFirst({
        where: eq(postcardDrafts.originalTweetId, tweet.id),
    });
    
    if (existing) {
        console.log(`   Draft already exists for tweet ${tweet.id}. Skipping.`);
        return false;
    }
    
    // Simple "Quack?" text - no AI needed
    const draftText = "Quack?";
    
    // Score based on target tweet quality for agent swarm relevance
    const text = tweet.text.toLowerCase();
    let score = 80; // Base score - all quack_launch targets are pre-filtered by keywords
    
    // Boost for high-value agent swarm keywords
    const highValueKeywords = ['agent swarm', 'multi-agent', 'swarm intelligence', 'agent orchestration', 'agent-to-agent'];
    const mediumKeywords = ['autonomous agent', 'ai agent', 'agent framework', 'mcp', 'a2a', 'langchain', 'autogen', 'crewai'];
    
    if (highValueKeywords.some(kw => text.includes(kw))) score += 10;
    if (mediumKeywords.some(kw => text.includes(kw))) score += 5;
    
    // Boost for engagement signals
    if (text.includes('?')) score += 3; // Questions = engagement opportunity
    if (text.length > 100) score += 2; // Substantial content
    
    // Cap at 95
    score = Math.min(95, score);
    
    try {
        await db.insert(postcardDrafts).values({
            campaignType: "logicart",
            strategy: "quack_launch",
            originalTweetId: tweet.id,
            originalAuthorHandle: authorHandle,
            originalTweetText: tweet.text,
            detectedLocation: "quack_launch", // Reusing field for campaign marker
            status: "pending_review",
            draftReplyText: draftText,
            actionType: "quote_tweet",
            score: score,
            // Note: Video attachment will be handled separately in twitter_publisher
        });
        
        console.log(`   ✅ Quack Launch draft created: "${draftText}"`);
        return true;
    } catch (error) {
        console.error(`   ❌ Error creating Quack Launch draft:`, error);
        return false;
    }
}
