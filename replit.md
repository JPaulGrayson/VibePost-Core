# VibePost - Social Media Management Platform

## Overview

VibePost is a social media management platform designed for efficient content posting across X/Twitter, Discord, and Reddit. Its primary purpose is to streamline campaign management, multi-platform publishing, and analytics tracking. The platform emphasizes reliable posting workflows, focusing on core functionalities over complex features like extensive keyword monitoring. It aims to provide a robust solution for managing social media presence, enabling users to create, schedule, and analyze posts across multiple platforms from a single interface.

## User Preferences

Preferred communication style: Simple, everyday language.
Troubleshooting approach: Always suggest cold restart early when programs behave unpredictably.

## System Architecture

VibePost utilizes a modern full-stack architecture.

**UI/UX Decisions:**
- **Frontend Framework**: React with TypeScript and Vite for a reactive and type-safe user interface.
- **Styling**: Radix UI primitives combined with Tailwind CSS for a consistent, responsive, and customizable design.
- **Form Management**: React Hook Form with Zod for robust, type-safe form validation.
- **Responsive Design**: Mobile-first approach ensuring usability across various devices.
- **Theming**: Tailwind CSS leveraging CSS variables for flexible theming.

**Technical Implementations:**
- **Backend Framework**: Express.js with TypeScript, providing a RESTful API.
- **Database**: PostgreSQL, managed with Drizzle ORM for type-safe interactions and schema-first development. Neon serverless PostgreSQL is supported for deployment.
- **State Management**: React Query for efficient server state management and optimistic UI updates.
- **Routing**: Wouter, a lightweight router, handles client-side navigation.
- **Data Layer**: Centralized schema definition with Drizzle tables for core entities (posts, platform connections, analytics), complemented by an abstract storage interface for flexibility.
- **Platform Integration**: Comprehensive APIs for X/Twitter, Discord (webhook-based), and Reddit, supporting multi-platform posting, persistent authentication, and real-time previews.
- **Campaign Management**: CRUD operations for campaigns, including features for post scheduling, and status tracking (draft, published, failed, scheduled).
- **Analytics**: Tracking of engagement metrics per platform, with a dashboard for displaying posts, engagement, scheduled, and drafts.
- **Post Previews**: Real-time platform-specific previews with direct links to posts.
- **Topic Search**: Functionality to find and reply to relevant discussions, with campaign message templates and bulk reply options for automation.
- **Sniper System**: Automates draft replies to engage with active conversations, including bot/spam filtering and strategic reply hooks based on campaign strategies.
- **Auto-publisher**: Stores campaign type in platformData for future posts.
- **Video Generation**: Dynamic timeouts and partial data returns for video previews, with exponential backoff for rate limits.

**System Design Choices:**
- **Modular Backend**: Ensures maintainability and scalability with clear separation of concerns.
- **Type Safety**: End-to-end type safety across frontend, backend, and database using TypeScript, Zod, and Drizzle ORM.
- **Persistent Storage**: Utilizes PostgreSQL for all critical data, including platform credentials and campaign information, ensuring data persistence across server restarts.
- **Development & Production Parity**: Uses Vite for frontend development and `esbuild`/`tsx` for backend, facilitating smooth transitions between environments.
- **Error Handling**: Robust error handling and validation mechanisms implemented across the application.

## External Dependencies

**Frontend:**
- **React**: UI library.
- **TypeScript**: Superset of JavaScript.
- **Vite**: Build tool.
- **TanStack React Query**: Server state management.
- **React Hook Form**: Form management.
- **Radix UI**: UI component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React Icons / React Icons**: Icon libraries.
- **Wouter**: Lightweight React router.
- **date-fns**: Date utility library.

**Backend:**
- **Express.js**: Web application framework.
- **TypeScript**: Superset of JavaScript.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **PostgreSQL**: Relational database.
- **Zod**: Schema validation library.
- **Neon**: Serverless PostgreSQL provider.
- **connect-pg-simple**: PostgreSQL session store for Express.
- **tsx**: TypeScript execution for development.
- **esbuild**: Bundler for production builds.

**Development Tools:**
- **Drizzle Kit**: Database schema management and migrations.