# VibePost - Social Media Management Platform

## Overview

VibePost is a streamlined social media management platform for posting content across X/Twitter, Discord, and Reddit. The application focuses on core functionality: campaign management, multi-platform posting, analytics tracking, and platform connection management. This refactored version removes complex keyword monitoring features and emphasizes reliable posting and campaign workflows.

## System Architecture

The application follows a modern full-stack architecture with:

**Frontend**: React + TypeScript + Vite
- Component-based architecture using React functional components
- State management via React Query for server state
- Routing handled by Wouter (lightweight router)
- UI components built with Radix UI primitives and styled with Tailwind CSS
- Form handling using React Hook Form with Zod validation

**Backend**: Express.js + TypeScript
- RESTful API architecture
- Modular route handling with Express
- In-memory storage implementation with interface for database abstraction
- Middleware for request logging and error handling

**Database**: PostgreSQL with Drizzle ORM
- Type-safe database operations using Drizzle ORM
- Schema-first approach with automatic TypeScript type generation
- Support for Neon serverless PostgreSQL

## Key Components

### Data Layer
- **Schema Definition**: Centralized in `shared/schema.ts` with Drizzle tables for posts, platform connections, and analytics
- **Storage Interface**: Abstract storage interface (`IStorage`) with in-memory implementation for development
- **Type Safety**: Full TypeScript integration with Zod schemas for validation

### API Layer
- **Posts Management**: CRUD operations for posts with status tracking (draft, published, failed, scheduled)
- **Platform Integration**: Connection management for social media platforms
- **Analytics**: Engagement metrics tracking per platform
- **Validation**: Request/response validation using Zod schemas

### Frontend Architecture
- **Component Library**: Custom UI components built on Radix UI primitives
- **State Management**: React Query for server state with optimistic updates
- **Form Management**: React Hook Form with Zod resolvers for type-safe forms
- **Responsive Design**: Mobile-first approach with Tailwind CSS

### Platform Integration
- **Multi-platform Support**: X/Twitter, Discord, and Reddit posting fully operational
- **Template System**: Pre-built post templates for announcements, tips, questions, and sharing
- **Preview System**: Real-time platform-specific post previews with direct links
- **Connection Management**: Persistent platform authentication with database storage

## Data Flow

1. **Post Creation**: User creates post via form → validation → API → storage → real-time UI updates
2. **Platform Publishing**: Post submission → platform API calls → status updates → analytics tracking
3. **Analytics Collection**: Platform metrics → periodic sync → database storage → dashboard display
4. **Real-time Updates**: React Query cache invalidation ensures fresh data across components

## External Dependencies

### Frontend Dependencies
- **UI Framework**: React 18 with TypeScript
- **State Management**: TanStack React Query v5
- **Form Handling**: React Hook Form with Hookform Resolvers
- **UI Components**: Radix UI component primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Icons**: Lucide React icons + React Icons (social platforms)
- **Routing**: Wouter (lightweight React router)
- **Date Handling**: date-fns for date manipulation

### Backend Dependencies
- **Framework**: Express.js with TypeScript
- **Database**: Drizzle ORM with PostgreSQL support
- **Validation**: Zod for schema validation
- **Database Provider**: Neon serverless PostgreSQL
- **Session Management**: connect-pg-simple for PostgreSQL sessions
- **Development**: tsx for TypeScript execution, esbuild for production builds

### Development Tools
- **Build Tool**: Vite with React plugin
- **Type Checking**: TypeScript with strict configuration
- **Database Migrations**: Drizzle Kit for schema management
- **Linting**: ESM modules with modern TypeScript configuration

## Deployment Strategy

**Development**:
- Vite dev server with HMR for frontend development
- tsx for running TypeScript server with hot reload
- In-memory storage for rapid prototyping

**Production**:
- Frontend: Vite build → static assets served by Express
- Backend: esbuild bundle → Node.js ESM execution
- Database: PostgreSQL with connection pooling
- Environment: DATABASE_URL required for production deployment

**Database Setup**:
- Drizzle migrations in `./migrations` directory
- Schema changes via `npm run db:push`
- PostgreSQL dialect with full TypeScript support

## Changelog

```
Changelog:
- June 29, 2025. Initial setup  
- June 29, 2025. Added real Twitter API integration with live posting functionality
- June 29, 2025. Added Reddit API integration framework with authentication and posting capabilities
- June 29, 2025. Identified Reddit authentication issue - user had two Reddit apps, need script app credentials
- June 29, 2025. Successfully tested both X (Twitter) and Reddit integrations with real API posting
- June 29, 2025. Multi-platform posting confirmed working - both platforms post from single API call
- June 29, 2025. Fixed Reddit connection display issue - frontend now properly recognizes backend status
- June 29, 2025. FIXED: Replaced in-memory storage with PostgreSQL database for persistent credential storage
- June 29, 2025. Platform credentials now persist through server restarts - no more manual restoration needed
- June 30, 2025. Added complete Discord integration using webhook-based posting system
- June 30, 2025. All three platforms (Twitter, Reddit, Discord) fully connected and functional
- June 30, 2025. Restored "Open in new tab" buttons to post preview functionality
- June 30, 2025. Fixed platform connection indicators and form visibility issues
- June 30, 2025. RESOLVED: Discord webhook persistence issue - credentials now properly load into form fields
- June 30, 2025. Multi-platform social media management system fully operational and production-ready
- June 30, 2025. MAJOR FIX: Switched to persistent PostgreSQL storage for platform connections
- June 30, 2025. Platform credentials now survive ALL server restarts permanently - no more re-setup needed
- June 30, 2025. COMPLETED: Full campaign management CRUD operations with save, open, delete functionality
- June 30, 2025. Added campaign export feature for backing up campaign data as JSON files
- June 30, 2025. Fixed JavaScript errors in campaign details page with proper API calls and TypeScript safety
- June 30, 2025. Campaign management system fully operational with delete confirmation dialogs
- July 1, 2025. PRODUCTION READY: Fixed post creation errors, added proper user authentication, improved platform failure handling
- July 1, 2025. Created complete VibeAppZ beta announcement campaign with multi-platform posts ready for deployment
- July 2, 2025. COMPLETED: Real keyword monitoring system with authentic API error reporting
- July 2, 2025. Fixed HTTP request parameter ordering and implemented proper error handling for all social media APIs
- July 2, 2025. Keyword search now shows specific configuration requirements for Twitter, Reddit, and Discord APIs
- July 2, 2025. RESOLVED: X API credential conflicts resolved by using regenerated keys from AIDebate app
- July 2, 2025. X credentials successfully saved to database - posting and authentication now working properly
- July 2, 2025. IDENTIFIED: X search API restricted despite working on AIDebate with same credentials - account-level limitation
- July 2, 2025. Tested both v1.1 and v2 X API endpoints - both hit UsageCapExceeded despite Basic plan allowing 75K requests/month
- July 2, 2025. REFACTORED: Simplified application to focus on core working features - removed keyword monitoring complexity
- July 2, 2025. Renamed to VibePost - streamlined social media management platform with campaigns, posting, and analytics
- July 3, 2025. RESOLVED: X/Twitter app permissions issue - created new app with "Read and Write" permissions
- July 3, 2025. SUCCESS: All three platforms (Twitter, Reddit, Discord) fully operational with posting functionality
- July 3, 2025. X posting confirmed working with write-enabled API credentials - Tweet ID 1940622255119335848 published
- July 3, 2025. CAMPAIGN LAUNCHED: VibeAppZ beta campaign successfully published across all platforms
- July 3, 2025. Live campaign posts: Twitter (1940871382990311449), Discord (webhook), Reddit (1lr03qu) - all operational
- July 3, 2025. RESOLVED: Fixed post deletion database foreign key constraint errors with proper cascade deletion handling
- July 3, 2025. RESTORED: Topic Search functionality for finding and replying to relevant discussions across platforms
- July 3, 2025. Added Topic Search page with search interface for keywords like "Vibe Coding" and reply functionality
- July 3, 2025. FIXED: Delete functionality now works without showing error messages - properly handles 204 responses
- July 3, 2025. FIXED: Analytics dashboard date consistency - clarified "All Time Posts" vs "Today's Posts" to match sidebar data
- July 3, 2025. CONSOLIDATED: Removed redundant "Today's Activity" panels from sidebar - consolidated all daily metrics into analytics page
- July 3, 2025. ENHANCED: Analytics page now has comprehensive "Today's Activity" section showing posts, engagement, scheduled, and drafts
- July 3, 2025. IMPROVED: Topic Search error handling with clear explanations of API limitations upfront
- July 3, 2025. CLARIFIED: Added informative alerts explaining why search fails - Twitter needs Academic/Enterprise access, Reddit blocks script searches
- July 3, 2025. FIXED: Twitter search fully operational using v2 API endpoint instead of v1.1 - real posts now returned
- July 3, 2025. ENHANCED: Added campaign message templates for quick replies to relevant posts in Topic Search
- July 3, 2025. COMPLETED: Twitter reply functionality working with preset VibeAppZ promotional messages
- July 3, 2025. ADDED: Bulk reply functionality for campaign automation - select multiple posts and reply with one click
- July 3, 2025. CONFIGURED: Reddit API credentials saved to database (Client ID: 9Tg4Cif3mLTEa2F7WObbdw)
- July 3, 2025. STATUS: Twitter search fully operational, Reddit search blocked by platform restrictions
- December 30, 2025. ENHANCED: Added "Reply to Replies" feature to sniper system
- December 30, 2025. NEW: fetchTweetReplies method fetches replies to high-quality tweets (score >= 70)
- December 30, 2025. FEATURE: Sniper now creates draft replies to engage with active conversation participants
- December 30, 2025. PROTECTION: Bot/spam filtering and max 3 replies per tweet to avoid spam behavior
- January 6, 2026. NEW: AI Debug Arena feature for lead generation funnel
- January 6, 2026. ADDED: Arena service queries 4 AI models (Gemini, GPT-4, Claude, Grok) in parallel
- January 6, 2026. FEATURE: Arena landing page at /arena with code input and model comparison display
- January 6, 2026. ADDED: Auto-arena content generator with 6 sample coding challenges
- January 6, 2026. FEATURE: AI-generated challenge creation with Gemini fallback to library
- January 6, 2026. ADDED: X thread generation and auto-posting from arena results
- January 6, 2026. IMPLEMENTED: Tier-based access control (free/pro/byok) with middleware
- January 6, 2026. SCHEMA: Added user tier fields (tier, stripeCustomerId, stripeSubscriptionId, tierExpiresAt)
- January 6, 2026. API: Arena endpoints (/api/arena/run, /api/arena/auto, /api/arena/auto-post, /api/arena/tier)
- January 6, 2026. REBRAND: LogiGo renamed to LogicArt across entire codebase - "The Art of Logic"
- January 6, 2026. FEATURE: Added "Visualize" button in Arena that opens LogicArt with encoded winner code via URL parameter
- January 6, 2026. UPDATED: Arena footer now shows "Powered by LogicArt - The Art of Logic"
- January 6, 2026. INTEGRATION: LogicArt URL accepts ?code= parameter for code transfer from Arena
- January 8, 2026. FEATURE: Arena Referee strategy - 4th sniper strategy that finds AI debate tweets and runs them through Arena
- January 8, 2026. NEW: Quote Tweet drafts with AI verdict (winner + reasoning) for Arena Referee
- January 8, 2026. SCHEMA: Added strategy, actionType, arenaVerdict fields to postcardDrafts table
- January 8, 2026. UI: Quote Tweet button and verdict display in sniper queue for Arena Referee drafts
- January 8, 2026. TYPES: ArenaVerdict interface and ActionType enum exported from shared/schema.ts
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
Troubleshooting approach: Always suggest cold restart early when programs behave unpredictably.
Domain purchasing: Use external registrars (Namecheap, Porkbun) instead of Replit's domain service - had issues with verification.
```