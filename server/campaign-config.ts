/**
 * Campaign Configuration for VibePost Multi-Product Lead Generation
 * 
 * Each campaign type defines:
 * - Keywords to search for on X/Twitter
 * - Intent detection rules
 * - Reply templates and tone
 * - Product-specific assets (images, links)
 * 
 * LogiGo campaigns support multiple STRATEGIES:
 * - vibe_scout: Target Vibe Coders with Founder Account offers
 * - spaghetti_detective: Find devs complaining about complex code
 * - stack_visualizer: Find questions needing visual explanations
 */

export type CampaignType = 'turai' | 'logigo';
export type LogiGoStrategy = 'vibe_scout' | 'spaghetti_detective' | 'stack_visualizer';

export interface StrategyConfig {
    id: LogiGoStrategy;
    name: string;
    emoji: string;
    description: string;
    keywords: string[];
    intentType: string;  // What kind of intent we're detecting
    intentSignals: {
        positive: string[];
        negative: string[];
    };
    replyPersona: {
        tone: string;
        hook: string;  // The special offer or approach
        templateExample: string;
    };
}

export interface CampaignConfig {
    id: CampaignType;
    name: string;
    emoji: string;
    description: string;

    // Keywords to search for on X/Twitter (default set)
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
        frustrationBonus: number;
        recentHoursDecay: number;
    };

    // Optional: Strategies (for LogiGo multi-strategy support)
    strategies?: StrategyConfig[];
    activeStrategy?: LogiGoStrategy;
}

// ============= LOGIGO STRATEGIES =============
export const LOGIGO_STRATEGIES: Record<LogiGoStrategy, StrategyConfig> = {
    vibe_scout: {
        id: 'vibe_scout',
        name: 'Vibe Coding Scout',
        emoji: '🎯',
        description: 'Find early adopters of AI coding tools - offer Founder accounts',
        keywords: [
            // High-signal Vibe Coding tags
            "#vibecoding",
            "#replitagent",
            "cursor ai",
            "google antigravity",
            "built this with AI",
            "replit agent",
            "windsurf ai",
            "claude sonnet",
            "ai pair programming",
            "vibe coded this",
            "let the AI cook",
            "ai wrote this",
            "agent built",
            "natural language to code",
            "no code ai",
            "ai dev tools",
        ],
        intentType: 'Show and Tell / Workflow Sharing',
        intentSignals: {
            positive: [
                "built", "made", "created", "shipped", "launched",
                "workflow", "using", "tried", "love", "amazing",
                "first app", "side project", "prototype", "mvp",
                "ai coding", "vibe", "agent", "cursor", "copilot"
            ],
            negative: [
                "hiring", "job", "course", "tutorial", "sponsor",
                "discount", "affiliate", "ad", "promo"
            ]
        },
        replyPersona: {
            tone: 'Impressed and collaborative. Builder to Builder.',
            hook: 'Offer a Founder Account (Free Lifetime Access) because they are an early adopter',
            templateExample: "This looks great! Since you're building with agents, I'd love to give you a Founder account on LogiGo (my AI flowchart tool). It helps visualize the agent's logic when it gets stuck. DM me if you want an invite!"
        }
    },

    spaghetti_detective: {
        id: 'spaghetti_detective',
        name: 'Spaghetti Detective',
        emoji: '🍝',
        description: 'Find developers complaining about complex code - offer visual solution',
        keywords: [
            "spaghetti code",
            "refactoring hell",
            "codebase is a mess",
            "lost in the code",
            "debugging nightmare",
            "can't understand this legacy code",
            "inherited this codebase",
            "code archaeology",
            "who wrote this",
            "wtf is this code",
            "technical debt mountain",
            "undocumented code",
            "no comments anywhere",
            "callback hell",
            "nested if statements",
            "unmaintainable code",
        ],
        intentType: 'Complexity Pain',
        intentSignals: {
            positive: [
                "frustrated", "nightmare", "mess", "spaghetti", "legacy",
                "inherited", "refactor", "understand", "confusing", "complex",
                "debugging", "stuck", "hours", "days", "help"
            ],
            negative: [
                "tutorial", "course", "hiring", "job posting",
                "just kidding", "meme", "joke"
            ]
        },
        replyPersona: {
            tone: 'Empathetic developer (not a sales bot)',
            hook: 'Share the pain, then offer a visual mapping solution',
            templateExample: "I feel that pain. I usually have to map it out visually to make sense of it. I built a tool called LogiGo to do that automatically - turns messy code into flowcharts. Happy to share if you want to try it."
        }
    },

    stack_visualizer: {
        id: 'stack_visualizer',
        name: 'Stack Overflow Visualizer',
        emoji: '📊',
        description: 'Find technical questions that need visual explanations',
        keywords: [
            "architecture diagram",
            "how does oauth work",
            "react state flow",
            "mvc vs mvvm",
            "visualize the request",
            "explain this flow",
            "data flow diagram",
            "system design help",
            "api architecture",
            "microservices diagram",
            "state machine",
            "event flow",
            "sequence diagram needed",
            "how do these connect",
            "what's the flow",
        ],
        intentType: 'Visual Curiosity',
        intentSignals: {
            positive: [
                "diagram", "visualize", "flow", "architecture", "understand",
                "explain", "how does", "what's the", "state", "design",
                "connect", "sequence", "structure"
            ],
            negative: [
                "selling", "course", "udemy", "bootcamp ad",
                "sponsor", "affiliate"
            ]
        },
        replyPersona: {
            tone: 'Helpful expert offering to visualize',
            hook: 'Offer to generate a diagram for their specific question',
            templateExample: "That's a tricky flow to understand in text. It helps to see it mapped out. I can generate a flowchart for that specific architecture using LogiGo if you're interested?"
        }
    }
};

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
        description: 'Target developers with code visualization - multiple strategies available',

        // Default keywords (merged from all strategies for broad hunting)
        keywords: [
            // From Vibe Scout
            "#vibecoding", "#replitagent", "cursor ai", "built this with AI",
            "replit agent", "ai pair programming", "vibe coded",
            
            // From Spaghetti Detective
            "spaghetti code", "refactoring hell", "debugging nightmare",
            "legacy code", "code makes no sense", "inherited codebase",
            
            // From Stack Visualizer
            "architecture diagram", "code flow", "visualize algorithm",
            "system design", "state flow",
            
            // General coding pain
            "vibe coding help", "cursor ai help", "claude coding help",
            "can someone explain this code", "struggling to understand",
            "can't figure out this bug", "flowchart from code",
            "code visualization", "learning to code frustrated",
            "I hate debugging", "spent hours on this bug",
            "why doesn't this work", "code not working"
        ],

        intentSignals: {
            positive: [
                "help", "struggling", "confused", "don't understand", "can't figure",
                "stuck", "frustrated", "nightmare", "hours", "debug",
                "explain", "visualize", "understand", "learn", "why doesn't",
                "code", "programming", "developer", "coding", "algorithm",
                "built", "made", "shipped", "vibe", "agent", "ai"
            ],
            negative: [
                "hiring", "job posting", "we're looking for", "apply now",
                "course sale", "discount code", "affiliate", "sponsor",
                "retweet", "giveaway", "follow me"
            ]
        },

        replySettings: {
            tone: 'helpful senior developer friend',
            productLink: 'https://logigo.studio',
            callToAction: 'Try visualizing your code flow - it really helps!',
            hashTags: ['#coding', '#developer', '#VibeCoding', '#AI']
        },

        scoring: {
            questionBonus: 15,
            frustrationBonus: 25,
            recentHoursDecay: 3
        },

        // LogiGo-specific: Multiple strategies
        strategies: Object.values(LOGIGO_STRATEGIES),
        activeStrategy: 'vibe_scout'  // Default to Vibe Coding Scout
    }
};

// ============= STATE MANAGEMENT =============
// Track active strategy (persisted via API calls)
let currentLogiGoStrategy: LogiGoStrategy = 'vibe_scout';

export function getActiveLogiGoStrategy(): LogiGoStrategy {
    return currentLogiGoStrategy;
}

export function setActiveLogiGoStrategy(strategy: LogiGoStrategy): void {
    if (LOGIGO_STRATEGIES[strategy]) {
        currentLogiGoStrategy = strategy;
        console.log(`🎯 LogiGo strategy switched to: ${LOGIGO_STRATEGIES[strategy].name}`);
    }
}

export function getActiveStrategyConfig(): StrategyConfig {
    return LOGIGO_STRATEGIES[currentLogiGoStrategy];
}

// ============= HELPER FUNCTIONS =============

// Get keywords for campaign (respects active strategy for LogiGo)
export function getKeywordsForCampaign(type: CampaignType): string[] {
    if (type === 'logigo') {
        // Use active strategy keywords
        return LOGIGO_STRATEGIES[currentLogiGoStrategy].keywords;
    }
    return CAMPAIGN_CONFIGS[type].keywords;
}

// Get all keywords for a campaign (ignores strategy filtering)
export function getAllKeywordsForCampaign(type: CampaignType): string[] {
    return CAMPAIGN_CONFIGS[type].keywords;
}

// Helper to check if content has positive intent
export function hasPositiveIntent(content: string, type: CampaignType): boolean {
    const lower = content.toLowerCase();
    
    // For LogiGo, use strategy-specific signals
    if (type === 'logigo') {
        const strategy = LOGIGO_STRATEGIES[currentLogiGoStrategy];
        
        for (const signal of strategy.intentSignals.negative) {
            if (lower.includes(signal.toLowerCase())) {
                return false;
            }
        }
        
        let positiveCount = 0;
        for (const signal of strategy.intentSignals.positive) {
            if (lower.includes(signal.toLowerCase())) {
                positiveCount++;
            }
        }
        return positiveCount >= 1;
    }
    
    // For Turai, use default config
    const config = CAMPAIGN_CONFIGS[type];

    for (const signal of config.intentSignals.negative) {
        if (lower.includes(signal.toLowerCase())) {
            return false;
        }
    }

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

    // LogiGo-specific: Boost for strategy-relevant signals
    if (type === 'logigo') {
        const strategy = LOGIGO_STRATEGIES[currentLogiGoStrategy];
        
        // Extra boost if content matches strategy keywords
        for (const keyword of strategy.keywords.slice(0, 5)) {  // Check top 5 keywords
            if (lower.includes(keyword.toLowerCase().replace('#', ''))) {
                score += 10;
                break;
            }
        }
    }

    return Math.min(100, Math.max(0, score));
}

// Get reply persona for current campaign/strategy
export function getReplyPersona(type: CampaignType): {
    tone: string;
    hook: string;
    template: string;
    productLink: string;
} {
    if (type === 'logigo') {
        const strategy = LOGIGO_STRATEGIES[currentLogiGoStrategy];
        return {
            tone: strategy.replyPersona.tone,
            hook: strategy.replyPersona.hook,
            template: strategy.replyPersona.templateExample,
            productLink: CAMPAIGN_CONFIGS.logigo.replySettings.productLink
        };
    }
    
    return {
        tone: CAMPAIGN_CONFIGS[type].replySettings.tone,
        hook: CAMPAIGN_CONFIGS[type].replySettings.callToAction,
        template: '',  // Turai uses dynamic generation
        productLink: CAMPAIGN_CONFIGS[type].replySettings.productLink
    };
}

export default CAMPAIGN_CONFIGS;
