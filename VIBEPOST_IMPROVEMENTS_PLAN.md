# VibePost Improvements Implementation Plan

**Created:** December 8, 2025  
**Last Updated:** December 8, 2025 @ 2:00 PM  
**Status:** ✅ IMPLEMENTED

---

## Overview

This plan addresses three areas of improvement for VibePost's Twitter Sniper feature:

1. **Reliability** - Rate limiting and retry mechanisms
2. **Lead Quality** - Better filtering and search strategies  
3. **Reach** - Twitter Communities integration

---

## Implementation Status

| Phase | Feature | Status | Notes |
|-------|---------|--------|-------|
| 1.1 | Rate Limiting | ✅ Complete | 30 second delay between tweets |
| 1.2 | Retry Queue | ✅ Complete | 3 attempts, pending_retry status |
| 2.1 | Better Search Queries | ✅ Complete | 11 intent-focused keywords |
| 2.2 | Travel Intent Verification | ✅ Complete | Gemini AI filter |
| 2.3 | Engagement-Based Scoring | ✅ Complete | Enhanced scoring algorithm |
| 3.1 | Twitter Communities | ⚠️ Not Available | API doesn't support community search |
| 3.2 | Brand Filtering | ✅ Complete | Filters travel agencies, tour operators |

---

## Phase 1: Reliability Improvements ✅ COMPLETE

### 1.1 Rate Limiting for Twitter Posting ✅

**File:** `server/services/twitter_publisher.ts`

**What was added:**
- 30-second minimum delay between tweets
- Console message: `⏳ Rate limiting: waiting Xs before next tweet...`
- Timestamp tracking after each successful tweet

### 1.2 Retry Queue for Failed Posts ✅

**Files:** 
- `shared/schema.ts` - Added `publishAttempts`, `lastError` fields and `pending_retry` status
- `server/routes.ts` - Updated approve endpoint with retry logic

**How it works:**
1. On rate limit (429) error → status becomes `pending_retry`, attempts incremented
2. Draft reappears in queue for manual retry
3. After 3 failed attempts → permanent `failed` status

---

## Phase 2: Lead Quality Improvements ✅ COMPLETE

### 2.1 Enhanced Search Queries ✅

**File:** `server/services/sniper_manager.ts`

**New keywords (11 intent-focused queries):**

**High-Intent Questions:**
- "where should I stay in"
- "recommendations for visiting"
- "first time visiting"
- "itinerary help"
- "travel advice for"

**Planning Context:**
- "planning a trip to"
- "how many days in"
- "worth visiting"
- "must see in"

**Serious Travelers:**
- "best time to visit"
- "anyone been to"

### 2.2 Travel Intent Verification ✅

**File:** `server/services/postcard_drafter.ts`

**What was added:**
- `verifyTravelIntent()` function using Gemini 2.0 Flash
- Runs BEFORE location extraction
- Filters astrology posts, casual mentions, promotional content

**Console output:**
```
Verifying travel intent...
✅ Travel intent verified.
```
or
```
❌ No travel intent detected (astrology, promotional, or casual mention). Skipping.
```

**Cost:** ~$0.001 per tweet checked

### 2.3 Engagement-Based Scoring ✅

**File:** `server/keyword-search.ts`

**Enhanced Scoring Algorithm:**

| Signal | Score Impact |
|--------|-------------|
| Unanswered (0 replies) | **+25** |
| Low replies (≤2) | +15 |
| Moderate replies (≤5) | +5 |
| "itinerary" mentioned | +15 |
| "budget"/"cost" mentioned | +10 |
| "first time" mentioned | +15 |
| Small account (<500 followers) | +15 |
| Medium account (<1000 followers) | +10 |
| Crowded (>10 replies) | -20 |
| Viral (>50 replies) | -40 |
| Influencer (>50k followers) | -15 |
| Big influencer (>100k followers) | -25 |

---

## Phase 3: Expanded Reach

### 3.1 Twitter Communities Integration ⚠️ NOT AVAILABLE

**Research Result (December 8, 2025):**

The Twitter API v2 does NOT support searching within Communities. Key findings:
- You can get Community info by ID
- You can get Community members by ID
- You CANNOT search for tweets within a specific Community
- No `community_id` operator exists for tweet search

**Alternative Approaches (Future):**
- Manually join travel communities and engage organically
- Create content specifically for community posting (if posting API becomes available)
- Monitor community member accounts for travel questions

### 3.2 Brand/Promotional Account Filtering ✅

**File:** `server/keyword-search.ts`

**Brand keywords that trigger filtering:**
- travel, tours, agency, booking, hotel, resort
- official, promo, deals, discount, airline
- cruises, vacations, holidays, getaway

**Console output:**
```
Skipping brand account: @TravelDeals123
```

---

## What's Working Now

After a Manual Hunt, the system will:

1. ✅ Search Twitter with 11 intent-focused queries
2. ✅ Filter out spam, hashtag stuffing, and replies
3. ✅ **Filter out brand/promotional accounts** (travel agencies, etc.)
4. ✅ Score based on engagement AND account size
5. ✅ **Verify travel intent with Gemini AI**
6. ✅ Extract location (only if intent verified)
7. ✅ Generate Turai postcard
8. ✅ Create draft with score

When publishing:
1. ✅ Wait for rate limit cooldown (30s between tweets)
2. ✅ Include @mention for reply threading
3. ✅ On rate limit error → mark as `pending_retry` (retryable)
4. ✅ After 3 failures → mark as permanent `failed`

---

## Future Improvements (Ideas)

1. **Reddit Integration Fix** - Reddit API is currently blocking. Need API credentials.

2. **Scheduled Hunts** - Run hunts automatically at optimal times (morning, evening)

3. **A/B Testing Reply Text** - Test different reply styles for engagement

4. **Analytics Dashboard** - Track which keywords/times generate best engagement

5. **Community Campaigns** - If Twitter adds community posting API, create standalone postcard posts for communities

---

*All Phase 1 and 2 features are now live. Test with a Manual Hunt!*
