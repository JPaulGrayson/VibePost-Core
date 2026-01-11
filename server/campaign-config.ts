/**
 * Campaign Configuration for VibePost Multi-Product Lead Generation
 * 
 * Each campaign type defines:
 * - Keywords to search for on X/Twitter
 * - Intent detection rules
 * - Reply templates and tone
 * - Product-specific assets (images, links)
 */

export type CampaignType = 'turai' | 'logicart';

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
        frustrationBonus: number;  // e.g., "I hate debugging" = high intent for LogicArt
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

    logicart: {
        id: 'logicart',
        name: 'LogicArt Vibe Coding',
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
            productLink: 'https://x.logic.art/x',
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

    // GLOBAL FILTER: Always skip retweets - they're low quality
    if (lower.startsWith('rt @') || lower.includes(' rt @')) {
        return false;
    }

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

    // Frustration bonus (especially valuable for LogicArt)
    const frustrationKeywords = ['frustrated', 'struggle', 'hate', 'nightmare', 'stuck', 'hours'];
    if (frustrationKeywords.some(k => lower.includes(k))) {
        score += config.scoring.frustrationBonus;
    }

    return Math.min(100, Math.max(0, score));
}

export default CAMPAIGN_CONFIGS;

// ============= LOGICART STRATEGY SYSTEM =============
export type LogicArtStrategy = 'vibe_scout' | 'spaghetti_detective' | 'bug_hunter' | 'arena_referee' | 'code_flowchart';

export interface StrategyConfig {
    id: string;
    name: string;
    emoji: string;
    description: string;
    keywords: string[];
    intentType: string;
    intentSignals: {
        positive: string[];
        negative: string[];
    };
    replyPersona: {
        tone: string;
        hook: string;
        templateExample: string;
    };
    replyImage?: string; // Optional image to attach to replies
    actionType?: 'reply' | 'quote_tweet'; // Default is 'reply', 'quote_tweet' triggers Quote Tweet flow
}

// Global Safety Rules - tweets matching these patterns should be DISCARDED
// Updated: Jan 7, 2026 - Bootcamp Savior strategy added
export const GLOBAL_SAFETY_FILTERS = {
    // No hate/politics - if tweet involves race, politics, gender war -> DISCARD
    hatePolitics: ["maga", "woke", "leftist", "rightist", "trump", "biden", "gender war", "pronouns", "racist", "fascist"],
    // No crypto - if profile has .eth or discusses tokens -> DISCARD
    crypto: [".eth", "crypto", "token", "nft", "blockchain", "web3", "defi", "hodl", "wagmi"],
    // Expert detection for Agent 3 (don't use bootcamp tone for seniors)
    expertSignals: ["staff engineer", "principal engineer", "tech lead", "CTO", "architect", "10+ years", "senior dev", "founding engineer"]
};

export const LOGICART_STRATEGIES: Record<LogicArtStrategy, StrategyConfig> = {
    vibe_scout: {
        id: 'vibe_scout',
        name: 'Vibe Coding Scout',
        emoji: '🎯',
        description: 'Find users debating AI model performance - Cage Match reply',
        keywords: [
            // ===== VIBE CODING PLATFORMS =====
            "vibe coding", "vibe coder", "vibecoding",
            "Cursor AI", "Cursor vs", "Cursor hallucinating", "Cursor agent",
            "Windsurf ai", "Windsurf vs", "Windsurf code",
            "Replit agent", "Replit AI", "Replit ghostwriter",
            "Bolt ai", "Bolt.new", "bolt new",
            "v0 dev", "v0 ai", "Vercel v0",
            "Lovable ai", "Lovable dev", "lovable.dev",
            "Claude artifacts", "Claude code", "Claude coding",
            "GitHub Copilot", "Copilot vs", "Copilot hallucinating",
            "Codeium", "Codeium vs",
            "Aider ai", "aider code",
            "Continue dev", "continue.dev",
            
            // ===== MODEL DEBATES =====
            "Claude vs GPT", "Grok code", "which model is best",
            "Claude is dumb", "Grok is better", "Claude lazy code",
            "GPT not working", "best coding AI", "model comparison",
            "AI coding assistant", "AI pair programming",
            "model keeps failing", "tried Claude and", "switched to GPT",
            "hallucination", "hallucinating code"
        ],
        intentType: 'Model Comparison / Debate',
        intentSignals: {
            positive: ["vs", "better", "worse", "compared", "hallucinating", "frustrated", "dumb", "lazy", "not working", "which one", "struggling", "broken", "buggy", "help", "issue", "problem", "switched"],
            negative: ["hiring", "job", "course", "tutorial", "sponsor", "discount", "affiliate", "founder", "CEO", "we're building", "launching", ...GLOBAL_SAFETY_FILTERS.hatePolitics, ...GLOBAL_SAFETY_FILTERS.crypto]
        },
        replyPersona: {
            tone: 'Competitive, Fun - "Let\'s settle this in the Cage Match"',
            hook: 'Position the Cage Match as the ultimate tie-breaker between AI models',
            templateExample: "I noticed you're debating Claude vs GPT. 🥊 Why not settle it? I just ran a similar problem in the AI Cage Match - the results might surprise you: [Link]"
        },
        replyImage: 'attached_assets/TheWinnerIs_1767810718250.jpg' // Winner Card screenshot
    },

    spaghetti_detective: {
        id: 'spaghetti_detective',
        name: 'Spaghetti Detective',
        emoji: '🍝',
        description: 'Find senior devs suffering from legacy code complexity',
        keywords: [
            "spaghetti code", "legacy codebase", "technical debt", "refactoring hell",
            "can't understand this code", "inherited this codebase", "code archaeology",
            "who wrote this", "wtf is this code", "unmaintainable code",
            "codebase is a mess", "lost in the code", "debugging nightmare"
        ],
        intentType: 'Complexity Pain / Suffering',
        intentSignals: {
            positive: ["nightmare", "mess", "spaghetti", "legacy", "inherited", "refactor", "confusing", "complex", "stuck", "lost", "wtf", "hate this code"],
            negative: ["tutorial", "course", "hiring", "job posting", "meme", "joke", ...GLOBAL_SAFETY_FILTERS.hatePolitics, ...GLOBAL_SAFETY_FILTERS.crypto]
        },
        replyPersona: {
            tone: 'Professional - "Here is a map out of the woods"',
            hook: 'Offer clarity through visualization - not just empathy',
            templateExample: "I feel your pain with that legacy codebase. 🗺️ I threw a similar mess into LogicArt and it generated a visual map that made the logic crystal clear. Might help you find your way: [Link]"
        },
        replyImage: 'attached_assets/image_1767810707484.png' // Flowchart Split-View screenshot
    },

    bug_hunter: {
        id: 'bug_hunter',
        name: 'Bootcamp Savior',
        emoji: '🎓',
        description: 'Find beginners stuck on basic bugs - mentor with kindness [PRIORITY]',
        keywords: [
            "#100DaysOfCode", "#CodeNewbie", "stuck on loop", "why isn't this working",
            "syntax error", "python help", "javascript help", "learning to code",
            "first project", "beginner question", "new to programming", "help please",
            "TypeError", "undefined is not a function", "can someone explain",
            "what am I doing wrong", "stuck for hours", "coding bootcamp"
        ],
        intentType: 'Beginner Struggling / Asking for Help',
        intentSignals: {
            positive: ["stuck", "help", "beginner", "newbie", "learning", "first time", "don't understand", "confused", "error", "not working", "please"],
            negative: ["hiring", "job", "course ad", "promo", "tutorial sale", ...GLOBAL_SAFETY_FILTERS.hatePolitics, ...GLOBAL_SAFETY_FILTERS.crypto, ...GLOBAL_SAFETY_FILTERS.expertSignals]
        },
        replyPersona: {
            tone: 'Mentor, Kind - "I visualized your bug for you"',
            hook: 'Offer to help them see their logic visually - no judgment',
            templateExample: "Hey! I remember being stuck on loops too. 🎓 I dropped your code into LogicArt and it visualized exactly where the bug is hiding. Check it out - hope this helps: [Link]"
        },
        replyImage: 'attached_assets/image_1767810707484.png' // Flowchart Split-View screenshot
    },

    arena_referee: {
        id: 'arena_referee',
        name: 'Arena Referee',
        emoji: '🏛️',
        description: 'Find viral AI debates & broadcast the verdict via Quote Tweet',
        keywords: [
            // ===== AI MODEL DEBATES =====
            "which ai is better", "which AI is best",
            "grok vs claude", "claude vs grok", "grok vs gpt", "gpt vs claude",
            "claude vs chatgpt", "chatgpt vs grok", "gemini vs claude", "gemini vs gpt",
            "is grok better", "is claude better", "is chatgpt better",
            "grok is smarter", "claude is smarter", "gpt is smarter",
            
            // ===== AI TRUTH / HALLUCINATION =====
            "is grok true", "is claude true", "AI hallucination",
            "grok lies", "claude lies", "chatgpt lies", "AI lying",
            "grok making things up", "claude making things up",
            "which AI is more accurate", "AI accuracy",
            
            // ===== AI CODING DEBATES =====
            "best coding AI", "best AI for coding", "AI code comparison",
            "cursor vs windsurf", "copilot vs cursor", "which AI codes best",
            "AI coding battle", "coding AI showdown",
            
            // ===== GENERAL AI OPINIONS =====
            "grok is overrated", "claude is overrated", "chatgpt is overrated",
            "grok is underrated", "best LLM", "worst LLM",
            "AI comparison", "LLM comparison"
        ],
        intentType: 'AI Model Debate / Comparison',
        intentSignals: {
            positive: ["vs", "better", "worse", "smarter", "compared", "comparison", "which one", "battle", "showdown", "debate", "true", "lies", "accurate", "overrated", "underrated", "best", "worst"],
            negative: [
                // Standard filters
                "hiring", "job", "sponsor", "discount", "affiliate", "founder", "CEO", "we're building", "launching", "promo",
                // Music/Entertainment filters - exclude song identification tweets
                "song", "lyrics", "music", "album", "artist", "kpop", "k-pop", "band", "singer", "melody", "chorus",
                "LOVE ME", "HATE ME", "stuck in my brain", "what song", "name this song", "identify this song",
                "aespa", "BLACKPINK", "BTS", "BABYMONSTER", "NewJeans", "TWICE", "ITZY", "Stray Kids",
                "supernova", "lovesick", "pop culture", "viral lyrics",
                ...GLOBAL_SAFETY_FILTERS.hatePolitics, ...GLOBAL_SAFETY_FILTERS.crypto
            ]
        },
        replyPersona: {
            tone: 'Competitive, Fun - "Let\'s settle this in the Arena"',
            hook: 'Run the debate through our AI Council and deliver the official verdict',
            templateExample: "We ran this debate through the AI Council. 🏛️\n\nThe verdict? [Summary]\n\nHere's the full breakdown 👇"
        },
        actionType: 'quote_tweet' // Triggers Quote Tweet flow instead of Reply
    },

    code_flowchart: {
        id: 'code_flowchart',
        name: 'Code Flowchart',
        emoji: '📊',
        description: 'Find tweets with code snippets & generate flowcharts to drive Arena traffic',
        keywords: [
            // ===== CODE FENCES & SYNTAX =====
            "```python", "```javascript", "```js", "```typescript", "```ts",
            "```java", "```c", "```cpp", "```rust", "```go", "```ruby",
            "```swift", "```kotlin", "```php", "```sql", "```bash", "```sh",
            
            // ===== CODE SHARING SIGNALS =====
            "here's my code", "here is my code", "check out this code",
            "this code doesn't work", "why isn't this working",
            "what's wrong with this code", "can someone explain this",
            "code review please", "rate my code", "roast my code",
            
            // ===== ALGORITHM & LOGIC =====
            "algorithm for", "how to implement", "recursive function",
            "sorting algorithm", "binary search", "linked list",
            "for loop not working", "while loop stuck", "infinite loop",
            
            // ===== BUG SHARING =====
            "TypeError:", "SyntaxError:", "ReferenceError:", "undefined is not",
            "null reference", "segfault", "stack overflow",
            "off by one", "index out of bounds",
            
            // ===== LANGUAGE-SPECIFIC HELP =====
            "python help", "javascript help", "typescript help",
            "react component", "async await", "promise chain",
            "list comprehension", "lambda function", "callback hell",
            
            // ===== REPLIT & VIBE CODING =====
            "replit code", "replit error", "replit help",
            "my replit project", "replit agent", "replit bug",
            "vibe coding", "vibe coded", "cursor bug", "cursor error"
        ],
        intentType: 'Code Snippet Shared / Help Needed',
        intentSignals: {
            positive: ["code", "function", "error", "bug", "help", "working", "fix", "debug", "explain", "algorithm", "loop", "array", "object", "class", "method", "return", "async", "await"],
            negative: ["hiring", "job", "sponsor", "discount", "affiliate", "course sale", "tutorial for sale", ...GLOBAL_SAFETY_FILTERS.hatePolitics, ...GLOBAL_SAFETY_FILTERS.crypto]
        },
        replyPersona: {
            tone: 'Helpful Developer - "Here\'s your logic mapped out"',
            hook: 'Provide instant value with a flowchart, then drive to Arena for deeper analysis',
            templateExample: "Your code mapped out 📊\n\n[flowchart image]\n\nWant 4 AI models to debug this? → x.logic.art/x"
        },
        actionType: 'quote_tweet' // Quote Tweet with flowchart image
    }
};

// State management for active strategy - defaults to Vibe Coding Scout
let currentLogicArtStrategy: LogicArtStrategy = 'vibe_scout';

export function getActiveLogicArtStrategy(): LogicArtStrategy {
    return currentLogicArtStrategy;
}

export function setActiveLogicArtStrategy(strategy: LogicArtStrategy): void {
    if (LOGICART_STRATEGIES[strategy]) {
        currentLogicArtStrategy = strategy;
        console.log(`🎯 LogicArt strategy switched to: ${LOGICART_STRATEGIES[strategy].name}`);
    }
}

export function getActiveStrategyConfig(): StrategyConfig {
    return LOGICART_STRATEGIES[currentLogicArtStrategy];
}
