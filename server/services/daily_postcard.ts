import { db } from "../db";
import { posts } from "@shared/schema";
import { GoogleGenAI } from "@google/genai";
import { publishDraft } from "./twitter_publisher";

// Initialize Gemini
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: apiKey || "dummy" });

// Curated list of photogenic destinations for daily posts
const FEATURED_DESTINATIONS = [
    // Classic favorites
    "Kyoto, Japan",
    "Santorini, Greece",
    "Machu Picchu, Peru",
    "Paris, France",
    "Bali, Indonesia",
    "Cinque Terre, Italy",
    "Banff, Canada",
    "Iceland Northern Lights",

    // Hidden gems
    "Chefchaouen, Morocco",
    "Hallstatt, Austria",
    "Dubrovnik, Croatia",
    "Petra, Jordan",
    "Cappadocia, Turkey",
    "Plitvice Lakes, Croatia",
    "Faroe Islands",

    // Adventure destinations
    "Queenstown, New Zealand",
    "Swiss Alps",
    "Patagonia, Argentina",
    "Norwegian Fjords",
    "Scottish Highlands",

    // Trending for 2025
    "Okinawa, Japan",
    "Albanian Riviera",
    "Tbilisi, Georgia",
    "Bogotá, Colombia",
    "Raja Ampat, Indonesia"
];

// Hashtags for travel posts
const TRAVEL_HASHTAGS = [
    "#TravelTips",
    "#Wanderlust",
    "#TravelCommunity",
    "#BucketList",
    "#TravelInspiration"
];

// Get a destination based on the day (cycles through the list)
function getTodaysDestination(): string {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    return FEATURED_DESTINATIONS[dayOfYear % FEATURED_DESTINATIONS.length];
}

// Generate engaging caption for the destination
async function generateCaption(destination: string): Promise<string> {
    try {
        const prompt = `Write a short, engaging tweet (under 200 characters) about traveling to ${destination}. 
Include one emoji. Make it inspiring and encourage people to visit.
Do NOT include hashtags - those will be added separately.
Example style: "The ancient temples of Kyoto whisper stories of samurai and geisha. A city where tradition meets tranquility 🏯"

Destination: ${destination}
Caption:`;

        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        return result.text?.trim() || `Discover the magic of ${destination}! ✨`;
    } catch (error) {
        console.error("Error generating caption:", error);
        return `Discover the magic of ${destination}! ✨`;
    }
}

// Generate image via Turai API (same endpoint as sniper drafts - THE FIX!)
async function generateTuraiImage(destination: string): Promise<{ imageUrl: string | null; attribution: string | null }> {
    const turaiApiUrl = process.env.TURAI_API_URL || "http://localhost:5002";
    const turaiApiKey = process.env.TURAI_API_KEY || "any-key-for-dev";

    try {
        console.log(`🔍 Calling Turai API for: ${destination}`);
        const response = await fetch(`${turaiApiUrl}/api/postcards/generate-by-topic`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": turaiApiKey
            },
            body: JSON.stringify({
                location: { name: destination },
                topic: "Travel and Tourism",
                aspectRatio: "1:1",
                stylePreset: "vibrant"
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data.imageUrl) {
                let attribution = null;
                if (data.data.attribution) {
                    const { name } = data.data.attribution;
                    attribution = `Photo by ${name} on Unsplash`;
                }
                console.log(`✅ Turai image generated: ${data.data.imageUrl}`);
                return { imageUrl: data.data.imageUrl, attribution };
            }
        } else {
            console.log(`⚠️ Turai API returned ${response.status}`);
        }
    } catch (error) {
        console.log(`⚠️ Turai API error: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    return { imageUrl: null, attribution: null };
}

// Fallback image sources
function getUnsplashImageUrl(destination: string): string {
    const query = encodeURIComponent(destination.split(',')[0].trim());
    return `https://source.unsplash.com/1200x800/?${query},travel,landscape`;
}

function getLoremFlickrImageUrl(destination: string): string {
    const query = encodeURIComponent(destination.split(',')[0].trim().toLowerCase().replace(/\s+/g, ','));
    return `https://loremflickr.com/1200/800/${query},travel,landscape`;
}

function getPicsumImageUrl(): string {
    return `https://picsum.photos/1200/800`;
}

// Try to get a working image URL, with multiple fallbacks
async function getWorkingImageUrl(destination: string): Promise<{ imageUrl: string; attribution: string | null }> {
    // First, try Turai (the correct way - same as sniper drafts)
    const turaiResult = await generateTuraiImage(destination);
    if (turaiResult.imageUrl) {
        return { imageUrl: turaiResult.imageUrl, attribution: turaiResult.attribution };
    }

    // Fallback sources (if Turai fails)
    const fallbackSources = [
        { name: 'Unsplash', url: getUnsplashImageUrl(destination) },
        { name: 'LoremFlickr', url: getLoremFlickrImageUrl(destination) },
        { name: 'Picsum', url: getPicsumImageUrl() }
    ];

    for (const source of fallbackSources) {
        try {
            console.log(`🔍 Trying ${source.name}...`);
            const response = await fetch(source.url, {
                signal: AbortSignal.timeout(10000),
                redirect: 'follow'
            });

            if (!response.ok) {
                console.log(`⚠️ ${source.name} returned ${response.status}, trying next...`);
                continue;
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('image')) {
                console.log(`⚠️ ${source.name} returned non-image content, trying next...`);
                continue;
            }

            console.log(`✅ Using ${source.name} fallback image`);
            return { imageUrl: response.url || source.url, attribution: null };

        } catch (error) {
            console.log(`⚠️ ${source.name} failed: ${error instanceof Error ? error.message : 'unknown'}`);
        }
    }

    // Last resort
    console.log(`⚠️ All sources failed, using Picsum`);
    return { imageUrl: getPicsumImageUrl(), attribution: null };
}

export interface DailyPostcardResult {
    success: boolean;
    destination: string;
    caption: string;
    imageUrl: string;
    tweetId?: string;
    error?: string;
    attribution?: string | null;
}

// Main function to generate and optionally post the daily postcard
export async function generateDailyPostcard(autoPost: boolean = false): Promise<DailyPostcardResult> {
    console.log("🌅 Generating Daily Postcard...");

    const destination = getTodaysDestination();
    console.log(`📍 Today's destination: ${destination}`);

    // Generate caption
    const caption = await generateCaption(destination);
    console.log(`📝 Caption: ${caption}`);

    // Get image URL (try Turai first, then fallbacks)
    const { imageUrl, attribution } = await getWorkingImageUrl(destination);

    // Build full tweet text with hashtags
    const destinationHashtag = `#${destination.split(',')[0].replace(/\s+/g, '')}`;
    const randomHashtags = TRAVEL_HASHTAGS.sort(() => 0.5 - Math.random()).slice(0, 3);
    let fullCaption = `${caption}\n\n📜 Claim your magical guide: turai.org/claim\n\n${destinationHashtag} ${randomHashtags.join(' ')}`;

    // Add attribution if present
    if (attribution) {
        fullCaption += `\n\n📸 ${attribution}`;
    }

    console.log(`🖼️ Image URL: ${imageUrl}`);

    const result: DailyPostcardResult = {
        success: true,
        destination,
        caption: fullCaption,
        imageUrl,
        attribution
    };

    // Auto-post if requested
    if (autoPost) {
        console.log("📤 Auto-posting to Twitter...");
        try {
            // Create a mock draft for the publisher
            const mockDraft = {
                id: -1,
                originalTweetId: `daily-${Date.now()}`,
                originalAuthorHandle: "",
                originalTweetText: "",
                detectedLocation: destination,
                turaiImageUrl: imageUrl,
                imageAttribution: attribution,
                draftReplyText: fullCaption,
                targetCommunityId: null,
                status: "pending_review" as const,
                score: 100,
                createdAt: new Date(),
                publishedAt: null,
                publishAttempts: 0,
                lastError: null
            };

            const publishResult = await publishDraft(mockDraft);

            if (publishResult.success) {
                result.tweetId = publishResult.tweetId;
                console.log(`✅ Daily postcard posted! Tweet ID: ${publishResult.tweetId}`);
            } else {
                result.success = false;
                result.error = publishResult.error;
                console.error("❌ Failed to post daily postcard:", publishResult.error);
            }
        } catch (error) {
            result.success = false;
            result.error = error instanceof Error ? error.message : "Unknown error";
            console.error("❌ Error posting daily postcard:", error);
        }
    }

    return result;
}

// Generate postcard without posting (for preview)
export async function previewDailyPostcard(): Promise<DailyPostcardResult> {
    return generateDailyPostcard(false);
}

// Force a specific destination (for manual testing)
export async function generatePostcardForDestination(destination: string, autoPost: boolean = false): Promise<DailyPostcardResult> {
    console.log(`🌅 Generating Postcard for: ${destination}`);

    const caption = await generateCaption(destination);
    const { imageUrl, attribution } = await getWorkingImageUrl(destination);

    const destinationHashtag = `#${destination.split(',')[0].replace(/\s+/g, '')}`;
    const randomHashtags = TRAVEL_HASHTAGS.sort(() => 0.5 - Math.random()).slice(0, 3);
    let fullCaption = `${caption}\n\n📜 Claim your magical guide: turai.org/claim\n\n${destinationHashtag} ${randomHashtags.join(' ')}`;

    if (attribution) {
        fullCaption += `\n\n📸 ${attribution}`;
    }

    const result: DailyPostcardResult = {
        success: true,
        destination,
        caption: fullCaption,
        imageUrl,
        attribution
    };

    if (autoPost) {
        console.log("📤 Posting would happen here...");
    }

    return result;
}

// List all available destinations
export function getAvailableDestinations(): string[] {
    return [...FEATURED_DESTINATIONS];
}
