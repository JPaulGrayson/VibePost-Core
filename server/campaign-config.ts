/**
 * Campaign Configuration for VibePost Multi-Product Lead Generation
 * 
 * Each campaign type defines:
 * - Keywords to search for on X/Twitter
 * - Intent detection rules
 * - Reply templates and tone
 * - Product-specific assets (images, links)
 */

export type CampaignType = 'turai' | 'logigo';

export interface CampaignConfig {
    id: CampaignType;
    name: string;
    emoji: string;
    description: string;

    // Keywords to search for on X/Twitter
    keywords: string[];

    // Intent detection - what phrases indicate genuine interest
    intentSignals: {
        positive: string[];  // Boost score
        negative: string[];  // Reduce score or skip
    };

    // Reply generation settings
    replySettings: {
        tone: string;
        productLink: string;
        callToAction: string;
        hashTags: string[];
    };

    // Scoring adjustments
    scoring: {
        questionBonus: number;
        frustrationBonus: number;  // e.g., "I hate debugging" = high intent for LogiGo
        recentHoursDecay: number;  // Points lost per hour
    };
}

export const CAMPAIGN_CONFIGS: Record<CampaignType, CampaignConfig> = {
    turai: {
        id: 'turai',
        name: 'Turai Travel',
        emoji: '✈️',
        description: 'Target travelers planning trips - promote AI Tour Guide',

        keywords: [
            // ===== HIGHEST QUALITY: People explicitly asking for tips/help =====
            "visiting for the first time any tips",
            "any tips for visiting",
            "first time visiting any recommendations",
            "traveling to any recommendations",
            "going to need advice",
            "anyone been to any tips",

            // ===== Specific trip planning questions =====
            "planning my first trip to",
            "help planning trip to",
            "where should I stay",
            "what should I see in",
            "is it worth visiting",
            "how many days should I spend",
            "best time of year to visit",
            "solo trip to need advice",
            "family trip recommendations",
            "honeymoon destination advice",

            // ===== TRANSPORTATION - Flights & Airlines =====
            "flight tips",
            "first time flying advice",
            "airport tips",
            "what airport should I fly into",
            "direct flight to",
            "booking flights to",
            "best airline for",
            "first class upgrade",
            "seat selection advice",
            "long haul flight tips",
            "layover in",
            "connecting flight help",

            // ===== TRANSPORTATION - Ground =====
            "train from",
            "train to",
            "train tips",
            "bus from",
            "rental car at",
            "should I rent a car",
            "driving in",
            "airport transfer",
            "uber or taxi",
            "public transport tips",

            // ===== ACCOMMODATIONS =====
            "hotel recommendations",
            "where to stay in",
            "best area to stay",
            "Airbnb vs hotel",
            "hostel recommendations",
            "resort recommendations",
            "hotel near",
            "booking hotel",

            // ===== FOOD & DINING =====
            "restaurant recommendations",
            "where to eat in",
            "best food in",
            "must try food",
            "dining recommendations",
            "local food tips",
            "street food",
            "food tour recommendations",

            // ===== POPULAR DESTINATIONS - Americas =====
            "visiting New York",
            "NYC tips",
            "visiting Los Angeles",
            "visiting Miami",
            "visiting Las Vegas",
            "visiting Chicago",
            "visiting San Francisco",
            "visiting Hawaii",
            "visiting Alaska",
            "visiting Mexico",
            "visiting Cancun",
            "visiting Canada",
            "visiting Toronto",
            "visiting Vancouver",

            // ===== POPULAR DESTINATIONS - Europe =====
            "visiting London",
            "visiting Paris",
            "visiting Rome",
            "visiting Barcelona",
            "visiting Amsterdam",
            "visiting Berlin",
            "visiting Prague",
            "visiting Vienna",
            "visiting Dublin",
            "visiting Edinburgh",
            "visiting Lisbon",
            "visiting Athens",
            "visiting Santorini",
            "visiting Croatia",

            // ===== POPULAR DESTINATIONS - Asia & Pacific =====
            "visiting Tokyo",
            "visiting Japan",
            "visiting Thailand",
            "visiting Bangkok",
            "visiting Singapore",
            "visiting Hong Kong",
            "visiting Korea",
            "visiting Seoul",
            "visiting Bali",
            "visiting Vietnam",
            "visiting Australia",
            "visiting Sydney",
            "visiting New Zealand",

            // ===== POPULAR DESTINATIONS - Other =====
            "visiting Dubai",
            "visiting Egypt",
            "visiting Morocco",
            "visiting South Africa",
            "visiting Israel",
            "visiting Turkey",
            "visiting Istanbul",

            // ===== TRAVEL LOGISTICS =====
            "packing for",
            "what to pack for",
            "travel insurance for",
            "visa for",
            "do I need visa",
            "currency exchange",
            "sim card for",
            "wifi abroad",
            "travel adapter",

            // ===== TRAVEL EXPERIENCE =====
            "tourist trap or worth it",
            "overrated or underrated",
            "hidden gems in",
            "off the beaten path",
            "local experience",
            "best time to visit",
            "weather in",
            "crowd levels",
        ],

        intentSignals: {
            positive: [
                // Trip planning
                "planning", "trip", "travel", "visiting", "vacation", "holiday",
                "recommendations", "tips", "advice", "help", "suggestions",
                "first time", "never been", "bucket list", "dream destination",
                // Transportation
                "flight", "airport", "airline", "flying", "train", "bus", "rental",
                // Accommodations
                "hotel", "hostel", "airbnb", "stay", "booking",
                // Food & Experience
                "restaurant", "dining", "eat", "food tour", "itinerary",
                // Common destinations (to match visiting [city])
                "new york", "paris", "london", "tokyo", "rome", "barcelona",
                "amsterdam", "dubai", "bali", "thailand", "japan", "italy"
            ],
            negative: [
                "selling", "book now", "discount", "promo", "affiliate",
                "retweet", "giveaway", "contest", "follow me"
            ]
        },

        replySettings: {
            tone: 'friendly travel enthusiast',
            productLink: 'https://turai.app',
            callToAction: 'Try our free AI tour guide',
            hashTags: ['#travel', '#TravelTips', '#AI']
        },

        scoring: {
            questionBonus: 20,
            frustrationBonus: 10,
            recentHoursDecay: 2
        }
    },

    logigo: {
        id: 'logigo',
        name: 'LogiGo Vibe Coding',
        emoji: '🧠',
        description: 'Target developers struggling with code - promote code visualization',

        keywords: [
            // VIBE CODING / AI CODING
            "vibe coding help",
            "vibe coder struggling",
            "cursor ai help",
            "claude coding help",
            "copilot not understanding",
            "ai wrote this code and I don't understand",

            // CODE UNDERSTANDING / DEBUGGING
            "can someone explain this code",
            "struggling to understand this codebase",
            "debugging nightmare",
            "this code makes no sense",
            "inherited legacy code help",
            "code review help",
            "can't figure out this bug",

            // VISUALIZATION NEEDS
            "flowchart from code",
            "code visualization",
            "visualize algorithm",
            "understand this logic",
            "diagram this code",

            // LEARNING / EDUCATION
            "learning to code frustrated",
            "coding bootcamp struggling",
            "self taught developer stuck",
            "junior developer help",

            // FRUSTRATION SIGNALS (high intent)
            "I hate debugging",
            "spent hours on this bug",
            "why doesn't this work",
            "code not working",
            "this should work but doesn't"
        ],

        intentSignals: {
            positive: [
                "help", "struggling", "confused", "don't understand", "can't figure",
                "stuck", "frustrated", "nightmare", "hours", "debug",
                "explain", "visualize", "understand", "learn", "why doesn't",
                "code", "programming", "developer", "coding", "algorithm"
            ],
            negative: [
                "hiring", "job posting", "we're looking for", "apply now",
                "course sale", "discount code", "affiliate", "sponsor",
                "retweet", "giveaway", "follow me"
            ]
        },

        replySettings: {
            tone: 'helpful senior developer friend',
            productLink: 'https://logigo.dev',
            callToAction: 'Try visualizing your code flow - it really helps!',
            hashTags: ['#coding', '#developer', '#VibeCoding', '#AI']
        },

        scoring: {
            questionBonus: 15,
            frustrationBonus: 25,  // High - frustrated devs are great leads!
            recentHoursDecay: 3   // Faster decay - coding questions go stale quicker
        }
    }
};

// Helper to get all keywords for a campaign
export function getKeywordsForCampaign(type: CampaignType): string[] {
    return CAMPAIGN_CONFIGS[type].keywords;
}

// Helper to check if content has positive intent
export function hasPositiveIntent(content: string, type: CampaignType): boolean {
    const lower = content.toLowerCase();
    const config = CAMPAIGN_CONFIGS[type];

    // Check for negative signals first (disqualify)
    for (const signal of config.intentSignals.negative) {
        if (lower.includes(signal.toLowerCase())) {
            return false;
        }
    }

    // Check for at least 1 positive signal (relaxed from 2 to catch more leads)
    let positiveCount = 0;
    for (const signal of config.intentSignals.positive) {
        if (lower.includes(signal.toLowerCase())) {
            positiveCount++;
        }
    }

    return positiveCount >= 1;
}

// Calculate campaign-specific score adjustments
export function calculateCampaignScore(
    content: string,
    type: CampaignType,
    baseScore: number
): number {
    const config = CAMPAIGN_CONFIGS[type];
    let score = baseScore;
    const lower = content.toLowerCase();

    // Question bonus
    if (content.includes('?')) {
        score += config.scoring.questionBonus;
    }

    // Frustration bonus (especially valuable for LogiGo)
    const frustrationKeywords = ['frustrated', 'struggle', 'hate', 'nightmare', 'stuck', 'hours'];
    if (frustrationKeywords.some(k => lower.includes(k))) {
        score += config.scoring.frustrationBonus;
    }

    return Math.min(100, Math.max(0, score));
}

export default CAMPAIGN_CONFIGS;
