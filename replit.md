# VibePost - Social Media Management Platform

## Overview

VibePost is a streamlined social media management platform designed for efficient content posting across X/Twitter, Discord, and Reddit. Its core purpose is to simplify campaign management, enable multi-platform content deployment, track analytics, and manage platform connections. The platform also includes an "AI Debug Arena" for comparing AI model outputs on coding challenges, with integration for generating social media content from these results, and a self-hosted conversion tracking system for landing pages.

## User Preferences

Preferred communication style: Simple, everyday language.
Troubleshooting approach: Always suggest cold restart early when programs behave unpredictably.
Domain purchasing: Use external registrars (Namecheap, Porkbun) instead of Replit's domain service - had issues with verification.

## System Architecture

VibePost employs a full-stack architecture. The **Frontend** is built with React, TypeScript, and Vite, utilizing React Query for state management, Wouter for routing, Radix UI for components, and Tailwind CSS for styling. Forms are handled with React Hook Form and Zod validation. The **Backend** is an Express.js and TypeScript RESTful API, featuring modular routing, in-memory storage (with an interface for database abstraction), and middleware for logging and error handling. **PostgreSQL** with Drizzle ORM is used for persistent storage, supporting type-safe operations and a schema-first approach.

Key architectural features include:
- **Data Layer**: Centralized schema definition with Drizzle tables for posts, platform connections, analytics, user tiers, and page views.
- **API Layer**: Provides CRUD operations for posts, platform integration, analytics tracking, and Zod-based request/response validation.
- **Platform Integration**: Supports X/Twitter, Discord, and Reddit with a template system, real-time post previews, and persistent authentication.
- **AI Debug Arena**: Allows parallel querying of multiple AI models (Gemini, GPT-4, Claude, Grok) for code debugging challenges, generating comparison displays, and facilitating social media post generation. It includes tier-based access control and integrates with "LogicArt" for code visualization.
- **Conversion Tracking**: A self-hosted system to track page views on landing pages, including UTM parameter attribution, and provides analytics on conversions.
- **Sniper System**: Features strategies for identifying high-quality tweets, fetching replies, and generating draft replies, including an "Arena Referee" strategy that processes AI debate tweets through the Arena.
- **Manual Post Creator**: Allows manual input of tweets to bypass API limits and generates strategy-specific AI replies with Arena URLs.

## External Dependencies

**Frontend:**
- React 18, TypeScript, Vite
- TanStack React Query v5
- React Hook Form with Hookform Resolvers
- Radix UI, Tailwind CSS
- Lucide React icons, React Icons
- Wouter
- date-fns

**Backend:**
- Express.js, TypeScript
- Drizzle ORM (with PostgreSQL support)
- Zod
- Neon (serverless PostgreSQL)
- connect-pg-simple
- tsx, esbuild

**Development Tools:**
- Vite (build tool)
- TypeScript (type checking)
- Drizzle Kit (database migrations)