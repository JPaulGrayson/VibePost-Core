import { publishDraft, publishDraftWithVideo } from "./twitter_publisher";
import { createStopVideo, createSimpleStopVideo } from "./stop_video_generator";

// Configuration
// Use production Turai API so tours exist on turai.org and links work
const TURAI_API_URL = process.env.TURAI_API_URL || "https://turai.org";
// Public URL for tour links
const TURAI_PUBLIC_URL = process.env.TURAI_PUBLIC_URL || "turai.org";
const MAX_STOPS = 5;
const USE_VIDEO_MODE = true; // Enable video generation for stops

// Curated destinations (same as daily postcard)
const FEATURED_DESTINATIONS = [
    "Kyoto, Japan",
    "Santorini, Greece",
    "Machu Picchu, Peru",
    "Paris, France",
    "Bali, Indonesia",
    "Cinque Terre, Italy",
    "Banff, Canada",
    "Iceland Northern Lights",
    "Chefchaouen, Morocco",
    "Hallstatt, Austria",
    "Dubrovnik, Croatia",
    "Petra, Jordan",
    "Cappadocia, Turkey",
    "Plitvice Lakes, Croatia",
    "Faroe Islands",
    "Queenstown, New Zealand",
    "Swiss Alps",
    "Patagonia, Argentina",
    "Norwegian Fjords",
    "Scottish Highlands",
    "Okinawa, Japan",
    "Albanian Riviera",
    "Tbilisi, Georgia",
    "Bogotá, Colombia",
    "Raja Ampat, Indonesia"
];

// Interfaces
interface POI {
    id: string;
    name: string;
    description: string;
    latitude: number;
    longitude: number;
    photoUrls?: string[];
    narrationText?: string;
    heroImageUrl?: string;
}

interface TourData {
    id: string;
    name: string;
    destination: string;
    shareCode: string;
    pointsOfInterest: POI[];
    aiImageUrl?: string;
}

interface Narration {
    id: string;
    poiIndex: number;
    text: string;
    audioUrl?: string;
    photoUrls: string[];
}

interface ThreadTweet {
    tweetId?: string;
    text: string;
    imageUrl: string;
    stopNumber?: number;
    status: 'pending' | 'posted' | 'failed';
    error?: string;
}

export interface ThreadTourResult {
    success: boolean;
    destination: string;
    threadId?: string;
    tweets: ThreadTweet[];
    error?: string;
}

/**
 * Get today's destination from the curated list
 */
function getTodaysDestination(): string {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    // Offset by 1 so we don't repeat the daily postcard destination
    return FEATURED_DESTINATIONS[(dayOfYear + 1) % FEATURED_DESTINATIONS.length];
}

/**
 * Generate a tour via Turai API
 */
async function generateTour(destination: string, theme: string = 'hidden_gems'): Promise<{ success: boolean; tour?: TourData; shareCode?: string; error?: string }> {
    try {
        console.log(`🗺️ Generating tour for: ${destination}`);

        const response = await fetch(`${TURAI_API_URL}/api/tour-maker/wizard/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                location: destination,
                theme: theme,
                email: "vibepost@turai.org" // System email for tracking
            }),
            signal: AbortSignal.timeout(60000) // 60 second timeout
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Turai API error: ${response.status} - ${errorText}`);
            return { success: false, error: `Turai API error: ${response.status}` };
        }

        const data = await response.json();

        if (!data.success || !data.data?.shareCode) {
            return { success: false, error: 'Invalid response from Turai API' };
        }

        console.log(`✅ Tour created with share code: ${data.data.shareCode}`);

        return {
            success: true,
            shareCode: data.data.shareCode
        };
    } catch (error) {
        console.error('Tour generation failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Fetch tour data by share code
 */
async function fetchTourData(shareCode: string): Promise<{ success: boolean; tour?: TourData; narrations?: Narration[]; error?: string }> {
    try {
        console.log(`📥 Fetching tour data for: ${shareCode}`);

        const response = await fetch(`${TURAI_API_URL}/api/tours/share/${shareCode}`, {
            signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
            return { success: false, error: `Failed to fetch tour: ${response.status}` };
        }

        const data = await response.json();

        if (!data.success || !data.data) {
            return { success: false, error: 'Invalid tour data' };
        }

        const tour: TourData = {
            id: data.data.id,
            name: data.data.name,
            destination: data.data.destination || data.data.startPoint,
            shareCode: shareCode,
            pointsOfInterest: data.data.pointsOfInterest || [],
            aiImageUrl: data.data.aiImageUrl
        };

        // Get narrations if available
        const rawNarrations = data.data.narrations || [];
        console.log(`📜 Found ${rawNarrations.length} narrations`);

        const narrations: Narration[] = rawNarrations.map((n: any, idx: number) => {
            // Turai uses stopNumber (1-indexed), convert to 0-indexed for matching
            const poiIndex = n.poiIndex !== undefined ? n.poiIndex :
                n.stopNumber !== undefined ? n.stopNumber - 1 : idx;

            const text = n.narrationText || n.text || '';
            console.log(`   Narration ${idx}: poiIndex=${poiIndex}, text="${text.substring(0, 50)}..."`);

            return {
                id: n.id,
                poiIndex,
                text,
                audioUrl: n.audioUrl,
                photoUrls: n.photoUrls || []
            };
        });

        return { success: true, tour, narrations };
    } catch (error) {
        console.error('Failed to fetch tour data:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Wait for tour to be ready (narrations + cover image)
 * @param minNarrations - minimum number of narrations required (default: at least half of POIs or 3)
 */
async function waitForTourReady(
    shareCode: string,
    expectedPOIs: number = 5,
    maxWaitMs: number = 180000 // 3 minutes
): Promise<{ ready: boolean; tour?: any; narrations?: any[] }> {
    const startTime = Date.now();
    const pollInterval = 8000; // 8 seconds
    const minNarrations = Math.min(expectedPOIs, Math.max(3, Math.ceil(expectedPOIs / 2)));

    console.log(`⏳ Waiting for tour to be ready (need ${minNarrations}+ narrations, cover image)...`);

    while (Date.now() - startTime < maxWaitMs) {
        const result = await fetchTourData(shareCode);

        if (result.success && result.tour) {
            const narrationCount = result.narrations?.length || 0;
            const hasCoverImage = !!result.tour.aiImageUrl;

            console.log(`   📊 ${narrationCount}/${minNarrations} narrations, cover: ${hasCoverImage ? '✓' : '✗'} (${Math.round((Date.now() - startTime) / 1000)}s)`);

            // Ready if we have enough narrations AND cover image
            if (narrationCount >= minNarrations && hasCoverImage) {
                console.log(`✅ Tour ready! ${narrationCount} narrations, cover image available`);
                return { ready: true, tour: result.tour, narrations: result.narrations };
            }

            // Also ready if we have all narrations even without cover (fallback to generated postcard)
            if (narrationCount >= expectedPOIs) {
                console.log(`✅ All ${narrationCount} narrations ready (cover image may still be generating)`);
                return { ready: true, tour: result.tour, narrations: result.narrations };
            }
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout - return what we have
    console.log('⚠️ Timeout waiting for full tour, proceeding with available content');
    const finalResult = await fetchTourData(shareCode);
    return {
        ready: false,
        tour: finalResult.tour,
        narrations: finalResult.narrations
    };
}

/**
 * Get all available photos for a POI (for video generation)
 */
function getAllPOIPhotos(poi: POI, narration?: Narration): string[] {
    const photos: string[] = [];

    // Add hero image first if available
    if (poi.heroImageUrl) {
        photos.push(poi.heroImageUrl);
    }

    // Add narration photos
    if (narration?.photoUrls && narration.photoUrls.length > 0) {
        photos.push(...narration.photoUrls);
    }

    // Add POI photos
    if (poi.photoUrls && poi.photoUrls.length > 0) {
        photos.push(...poi.photoUrls);
    }

    // Remove duplicates and limit to 6 photos
    const uniquePhotos = Array.from(new Set(photos));

    console.log(`   📷 Photos for ${poi.name}: ${uniquePhotos.length} unique (from ${photos.length} total)`);
    if (uniquePhotos.length < 3) {
        console.log(`   ⚠️ Low photo count - hero: ${poi.heroImageUrl ? 1 : 0}, narration: ${narration?.photoUrls?.length || 0}, poi: ${poi.photoUrls?.length || 0}`);
    }

    return uniquePhotos.slice(0, 6);
}

/**
 * Get a destination-specific fallback image URL using LoremFlickr
 */
function getDestinationFallbackImage(destination: string): string {
    // URL-encode the destination for search
    const query = encodeURIComponent(destination.split(',')[0].trim() + ',travel');
    // Use LoremFlickr which is more reliable than Unsplash source
    return `https://loremflickr.com/1200/800/${query}`;
}

/**
 * Truncate text for tweet (280 char limit with room for hashtags)
 */
function truncateForTweet(text: string, maxLength: number = 200): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Convert relative URLs to absolute URLs using Turai base URL
 */
function toAbsoluteUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    // Already absolute URL
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
    }
    // Relative URL - prepend Turai base
    return `${TURAI_API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Get the best image URL for a POI (with absolute URL conversion)
 */
function getPOIImageUrl(poi: POI, narration?: Narration): string | null {
    // Priority: heroImageUrl > narration photoUrls > poi photoUrls
    let url: string | null = null;

    if (poi.heroImageUrl) {
        url = poi.heroImageUrl;
    } else if (narration?.photoUrls && narration.photoUrls.length > 0) {
        url = narration.photoUrls[0];
    } else if (poi.photoUrls && poi.photoUrls.length > 0) {
        url = poi.photoUrls[0];
    }

    // Convert to absolute URL if needed
    return toAbsoluteUrl(url);
}

/**
 * Get the first 1-2 sentences of narration text
 */
function getFirstSentences(text: string, maxSentences: number = 2): string {
    if (!text) return '';
    // Match up to maxSentences sentences
    const sentences: string[] = [];
    const regex = /[^.!?]+[.!?]+/g;
    let match;
    while ((match = regex.exec(text)) !== null && sentences.length < maxSentences) {
        sentences.push(match[0].trim());
    }
    return sentences.join(' ') || text.substring(0, 180);
}

/**
 * Get narration text for a POI (check multiple sources)
 */
function getNarrationText(poi: POI, narration?: Narration): string {
    // Priority: narration.text > poi.narrationText > poi.description
    if (narration?.text && narration.text.trim()) {
        return narration.text;
    }
    if (poi.narrationText && poi.narrationText.trim()) {
        return poi.narrationText;
    }
    if (poi.description && poi.description.trim()) {
        return poi.description;
    }
    return '';
}

/**
 * Post a thread tour to Twitter
 */
export async function postThreadTour(
    destination: string,
    options: {
        maxStops?: number;
        theme?: string;
        existingShareCode?: string; // Use existing tour instead of generating
    } = {}
): Promise<ThreadTourResult> {
    const { maxStops = MAX_STOPS, theme = 'hidden_gems', existingShareCode } = options;

    console.log(`🧵 Starting Thread Tour for: ${destination}`);

    const result: ThreadTourResult = {
        success: false,
        destination,
        tweets: []
    };

    try {
        // Step 1: Generate or fetch tour
        let shareCode = existingShareCode;

        if (!shareCode) {
            const tourResult = await generateTour(destination, theme);
            if (!tourResult.success) {
                result.error = tourResult.error;
                return result;
            }
            shareCode = tourResult.shareCode!;
        }

        // Step 2: Wait for tour to be fully ready (narrations + cover image)
        const tourReadyResult = await waitForTourReady(shareCode, maxStops, 180000);

        if (!tourReadyResult.tour) {
            result.error = 'Failed to get tour data after waiting';
            return result;
        }

        const tour = tourReadyResult.tour;
        const narrations = tourReadyResult.narrations || [];
        const pois = tour.pointsOfInterest.slice(0, maxStops);

        console.log(`📍 Found ${pois.length} stops, ${narrations.length} narrations ready`);

        // Step 3: Post Intro Tweet
        // Use tour cover image, or first POI's image as fallback (avoid LoremFlickr placeholders)
        let introImageUrl = toAbsoluteUrl(tour.aiImageUrl);
        if (!introImageUrl && pois.length > 0) {
            // Try first POI's hero image or first photo
            introImageUrl = toAbsoluteUrl(pois[0].heroImageUrl)
                || toAbsoluteUrl(pois[0].photoUrls?.[0])
                || getDestinationFallbackImage(destination);
        }
        if (!introImageUrl) {
            introImageUrl = getDestinationFallbackImage(destination);
        }
        const introText = `🗺️ Explore ${destination}! 🧵\n\nA ${pois.length}-stop AI-guided tour... 👇`;

        console.log('📤 Posting intro tweet...');

        const introDraft = {
            id: -1,
            originalTweetId: `thread-intro-${Date.now()}`,
            originalAuthorHandle: "",
            originalTweetText: "",
            detectedLocation: destination,
            turaiImageUrl: introImageUrl,
            imageAttribution: null,
            draftReplyText: introText,
            targetCommunityId: null,
            status: "pending_review" as const,
            score: 100,
            createdAt: new Date(),
            publishedAt: null,
            publishAttempts: 0,
            lastError: null
        };

        const introResult = await publishDraft(introDraft);

        if (!introResult.success) {
            result.error = `Failed to post intro: ${introResult.error}`;
            result.tweets.push({
                text: introText,
                imageUrl: introImageUrl,
                status: 'failed',
                error: introResult.error
            });
            return result;
        }

        const threadId = introResult.tweetId!;
        result.threadId = threadId;
        result.tweets.push({
            tweetId: threadId,
            text: introText,
            imageUrl: introImageUrl,
            status: 'posted'
        });

        console.log(`✅ Intro posted: ${threadId}`);

        // Step 5: Post each stop as a reply
        let lastTweetId = threadId;

        for (let i = 0; i < pois.length; i++) {
            const poi = pois[i];
            const narration = narrations.find(n => n.poiIndex === i);

            // Get image for this stop - fallback uses POI name for relevance
            const poiFallback = getDestinationFallbackImage(poi.name);
            const imageUrl = getPOIImageUrl(poi, narration) || poiFallback;

            // Get photos for potential video (multiple photos with Ken Burns effect)
            const photos = getAllPOIPhotos(poi, narration);

            // Build tweet text (video has full audio, so no need for external link)
            const stopNum = i + 1;
            // Get narration from multiple sources
            const fullNarration = getNarrationText(poi, narration);
            const narrationSnippet = getFirstSentences(fullNarration, 2);
            // Clean tweet format: POI name + narration preview + counter
            const stopText = `📍 Stop ${stopNum}: ${poi.name}\n\n${truncateForTweet(narrationSnippet, 200)}\n\n${stopNum}/${pois.length}`;

            console.log(`📤 Posting stop ${stopNum}/${pois.length}: ${poi.name}`);

            // Small delay between posts to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));

            let stopResult: { success: boolean; tweetId?: string; error?: string };

            // Try to create video if we have audio narration
            if (USE_VIDEO_MODE && narration?.audioUrl && photos.length > 0) {
                console.log(`   🎬 Generating video with audio narration...`);

                // Convert photo URLs to absolute
                const absolutePhotos = photos.map(p => toAbsoluteUrl(p) || p).filter(Boolean) as string[];
                const absoluteAudioUrl = toAbsoluteUrl(narration.audioUrl) || narration.audioUrl;

                const videoResult = await createStopVideo(
                    absolutePhotos,
                    absoluteAudioUrl,
                    `stop_${stopNum}_${poi.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}`,
                    poi.name
                );

                if (videoResult.success && videoResult.videoPath) {
                    // Post with video
                    stopResult = await publishDraftWithVideo(
                        videoResult.videoPath,
                        stopText,
                        lastTweetId
                    );
                } else {
                    console.log(`   ⚠️ Video generation failed, falling back to image`);
                    // Fall back to image
                    const stopDraft = {
                        id: -1,
                        originalTweetId: lastTweetId,
                        originalAuthorHandle: "",
                        originalTweetText: "",
                        detectedLocation: poi.name,
                        turaiImageUrl: imageUrl,
                        imageAttribution: null,
                        draftReplyText: stopText,
                        targetCommunityId: null,
                        status: "pending_review" as const,
                        score: 100,
                        createdAt: new Date(),
                        publishedAt: null,
                        publishAttempts: 0,
                        lastError: null
                    };
                    stopResult = await publishDraft(stopDraft);
                }
            } else {
                // No audio available - post with image only
                const stopDraft = {
                    id: -1,
                    originalTweetId: lastTweetId,
                    originalAuthorHandle: "",
                    originalTweetText: "",
                    detectedLocation: poi.name,
                    turaiImageUrl: imageUrl,
                    imageAttribution: null,
                    draftReplyText: stopText,
                    targetCommunityId: null,
                    status: "pending_review" as const,
                    score: 100,
                    createdAt: new Date(),
                    publishedAt: null,
                    publishAttempts: 0,
                    lastError: null
                };
                stopResult = await publishDraft(stopDraft);
            }

            if (stopResult.success) {
                lastTweetId = stopResult.tweetId!;
                result.tweets.push({
                    tweetId: lastTweetId,
                    text: stopText,
                    imageUrl: imageUrl,
                    stopNumber: stopNum,
                    status: 'posted'
                });
                console.log(`✅ Stop ${stopNum} posted: ${lastTweetId}`);
            } else {
                result.tweets.push({
                    text: stopText,
                    imageUrl: imageUrl,
                    stopNumber: stopNum,
                    status: 'failed',
                    error: stopResult.error
                });
                console.error(`❌ Stop ${stopNum} failed: ${stopResult.error}`);
                // Continue with remaining stops even if one fails
            }
        }

        // Step 6: Post CTA reply
        console.log('📤 Posting CTA...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Updated CTA - they already got audio, so offer more exploration
        const ctaText = `✨ Enjoyed this tour?\n\nExplore more destinations with AI audio guides:\n${TURAI_PUBLIC_URL}\n\n#${destination.split(',')[0].replace(/\s+/g, '')} #TravelThread #AITravel`;

        const ctaDraft = {
            id: -1,
            originalTweetId: lastTweetId,
            originalAuthorHandle: "",
            originalTweetText: "",
            detectedLocation: destination,
            turaiImageUrl: toAbsoluteUrl(tour.aiImageUrl) || introImageUrl,
            imageAttribution: null,
            draftReplyText: ctaText,
            targetCommunityId: null,
            status: "pending_review" as const,
            score: 100,
            createdAt: new Date(),
            publishedAt: null,
            publishAttempts: 0,
            lastError: null
        };

        const ctaResult = await publishDraft(ctaDraft);

        if (ctaResult.success) {
            result.tweets.push({
                tweetId: ctaResult.tweetId,
                text: ctaText,
                imageUrl: tour.aiImageUrl || introImageUrl,
                status: 'posted'
            });
            console.log(`✅ CTA posted: ${ctaResult.tweetId}`);
        } else {
            result.tweets.push({
                text: ctaText,
                imageUrl: tour.aiImageUrl || introImageUrl,
                status: 'failed',
                error: ctaResult.error
            });
        }

        // Count successful posts
        const successCount = result.tweets.filter(t => t.status === 'posted').length;
        result.success = successCount > 0;

        console.log(`🧵 Thread complete! ${successCount}/${result.tweets.length} tweets posted`);

        return result;

    } catch (error) {
        console.error('Thread tour failed:', error);
        result.error = error instanceof Error ? error.message : 'Unknown error';
        return result;
    }
}

/**
 * Get available destinations for thread tours
 */
export function getThreadTourDestinations(): string[] {
    return [...FEATURED_DESTINATIONS];
}

/**
 * Get today's scheduled destination
 */
export function getTodaysThreadDestination(): string {
    return getTodaysDestination();
}

/**
 * Fetch famous tours from Turai
 */
export async function fetchFamousTours(): Promise<{ id: string; name: string; destination: string; shareCode: string; stops: number }[]> {
    try {
        const response = await fetch(`${TURAI_API_URL}/api/tour-maker/famous`, {
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            console.error('Failed to fetch famous tours:', response.status);
            return [];
        }

        const data = await response.json();

        if (!data.success || !data.data) {
            return [];
        }

        return data.data.map((tour: any) => ({
            id: tour.id,
            name: tour.name,
            destination: tour.destination || tour.startPoint,
            shareCode: tour.shareCode,
            stops: tour.stops || 5
        }));
    } catch (error) {
        console.error('Error fetching famous tours:', error);
        return [];
    }
}
