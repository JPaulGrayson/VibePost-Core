# Video Slideshow Feature Implementation Plan

**Created:** December 8, 2025  
**Status:** 📋 Planned (Delayed until Turai stabilizes)  
**Priority:** Medium-High  
**Effort:** 3-4 hours (simplified with Puppeteer approach)  
**Approach:** Option A - Puppeteer Screen Recording (minimal Turai changes)

---

## Overview

Record existing Turai slideshows as 60-second MP4 videos for Twitter posting. Uses Puppeteer to capture the already-working slideshow UI, minimizing risk to Turai core code.

---

## Why This Approach?

| Approach | Pros | Cons |
|----------|------|------|
| **Option A: Puppeteer Recording** ✅ | Zero Turai changes, leverages existing UI | Requires headless browser |
| Option B: FFmpeg Server-side | More control over output | Duplicates slideshow logic, risk to Turai |

**Decision:** Option A - The slideshow already works perfectly. Just record it.

---

## Example Use Case

**Input:** "SpaceX Boca Chica Beach, TX" (existing tour with shareCode)  
**Process:**
1. Puppeteer opens `/slideshow/{shareCode}`
2. Records screen for 60 seconds
3. Exports MP4 video

**Output:** 60-second video with all existing features:
- Photos cycling through stops
- TTS narration audio
- Smooth transitions
- No changes to Turai needed!

---

## Architecture

### Simplified Data Flow (Puppeteer Approach)

```
┌─────────────────────────────────────────────────────────────────┐
│                     VIDEO SLIDESHOW PIPELINE                    │
│                    (Puppeteer Screen Recording)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. GET SLIDESHOW URL                                           │
│     ├─ Use existing tour shareCode                             │
│     └─ OR generate new tour via /api/tour-maker/wizard/generate│
│                                                                 │
│  2. PUPPETEER RECORDING                                         │
│     ├─ Launch headless Chrome                                  │
│     ├─ Navigate to /slideshow/{shareCode}                      │
│     ├─ Wait for slideshow to start                             │
│     ├─ Record screen + audio for 60 seconds                    │
│     └─ Save as MP4 to /tmp/videos/{id}.mp4                     │
│                                                                 │
│  3. UPLOAD TO TWITTER                                           │
│     ├─ Chunked media upload (videos can be large)              │
│     ├─ Post tweet with video + caption                         │
│     └─ Include hashtags + CTA                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Benefit:** The existing Turai slideshow handles ALL the hard work:
- Photo transitions ✅
- Audio playback ✅
- Timing/pacing ✅
- Visual styling ✅

We just record it!

---

## Phase 1: Puppeteer Screen Recording

### 1.1 Video Recorder Service

**File:** `VibePost-Core/server/services/slideshow_recorder.ts`

```typescript
import puppeteer from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';

interface RecordingConfig {
  shareCode: string;
  durationSeconds: number;  // 60
  outputPath: string;
  turaiBaseUrl: string;     // http://localhost:5002 or production
}

export async function recordSlideshow(config: RecordingConfig): Promise<string> {
  const { shareCode, durationSeconds, outputPath, turaiBaseUrl } = config;
  
  console.log(`🎬 Recording slideshow: ${shareCode}`);
  
  // Launch headless browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Set viewport to 1080p for good quality
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Initialize screen recorder
  const recorder = new PuppeteerScreenRecorder(page, {
    fps: 30,
    ffmpeg_Path: null, // Auto-detect
    videoFrame: { width: 1920, height: 1080 },
    aspectRatio: '16:9',
  });
  
  // Navigate to slideshow
  const slideshowUrl = `${turaiBaseUrl}/slideshow/${shareCode}`;
  console.log(`📍 Opening: ${slideshowUrl}`);
  await page.goto(slideshowUrl, { waitUntil: 'networkidle2' });
  
  // Wait for slideshow to initialize
  await page.waitForTimeout(2000);
  
  // Start recording
  console.log(`🔴 Recording started (${durationSeconds}s)...`);
  await recorder.start(outputPath);
  
  // Wait for recording duration
  await page.waitForTimeout(durationSeconds * 1000);
  
  // Stop recording
  await recorder.stop();
  console.log(`⏹️ Recording complete: ${outputPath}`);
  
  await browser.close();
  
  return outputPath;
}
```

### 1.2 Dependencies

```bash
npm install puppeteer puppeteer-screen-recorder
```

**Note:** This records VIDEO only. For audio capture, we may need additional setup (system audio loopback). Alternative: FFmpeg can merge the recorded video with the tour's audio files post-recording.

---

## Phase 2: Audio Handling (if needed)

### 2.1 Tour Fetcher

**File:** `VibePost-Core/server/services/turai_client.ts`

```typescript
const TURAI_API_URL = process.env.TURAI_API_URL || 'http://localhost:5002';

interface TuraiTour {
  id: string;
  name: string;
  destination: string;
  theme: string;
  waypoints: Array<{
    name: string;
    narrationText: string;
    audioUrl: string;
    photoUrls: string[];
  }>;
}

export async function fetchTour(tourId: string): Promise<TuraiTour> {
  const response = await fetch(`${TURAI_API_URL}/api/tours/${tourId}`);
  return response.json();
}

export async function generateTour(destination: string, theme?: string): Promise<TuraiTour> {
  const response = await fetch(`${TURAI_API_URL}/api/tours/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, theme, narrationDuration: 1 })
  });
  return response.json();
}
```

### 2.2 Narration Generator

If tour stops don't have narrations yet:

```typescript
export async function generateNarrations(tourId: string): Promise<void> {
  await fetch(`${TURAI_API_URL}/api/tours/${tourId}/generate-narrations`, {
    method: 'POST'
  });
}
```

---

## Phase 3: Twitter Video Upload

### 3.1 Chunked Media Upload

Twitter v2 API requires chunked upload for videos >5MB:

**File:** `VibePost-Core/server/services/twitter_video_uploader.ts`

```typescript
export async function uploadVideoToTwitter(
  videoPath: string,
  client: TwitterApi
): Promise<string> {
  // 1. INIT - Initialize chunked upload
  // 2. APPEND - Upload chunks (max 5MB each)
  // 3. FINALIZE - Complete upload
  // 4. STATUS - Poll until processing complete
  // Return media_id
}

export async function postVideoTweet(
  client: TwitterApi,
  mediaId: string,
  text: string
): Promise<string> {
  const result = await client.v2.tweet({
    text,
    media: { media_ids: [mediaId] }
  });
  return result.data.id;
}
```

---

## Phase 4: API Endpoints

### 4.1 VibePost Endpoints

**File:** `VibePost-Core/server/routes.ts`

```typescript
// Preview slideshow configuration (no video generated)
app.get('/api/slideshow/preview/:tourId', async (req, res) => {
  const tour = await fetchTour(req.params.tourId);
  res.json({
    tourName: tour.name,
    destination: tour.destination,
    stops: tour.waypoints.length,
    estimatedDuration: '60 seconds',
    hasNarrations: tour.waypoints.every(w => w.audioUrl)
  });
});

// Generate slideshow video (returns video URL)
app.post('/api/slideshow/generate', async (req, res) => {
  const { tourId, destination, theme } = req.body;
  
  let tour = tourId 
    ? await fetchTour(tourId)
    : await generateTour(destination, theme);
    
  // Ensure narrations exist
  if (!tour.waypoints.every(w => w.audioUrl)) {
    await generateNarrations(tour.id);
    tour = await fetchTour(tour.id);
  }
  
  const videoPath = await generateSlideshow({
    tourId: tour.id,
    tourName: tour.name,
    destination: tour.destination,
    stops: tour.waypoints.map(w => ({
      imageUrl: w.photoUrls[0],
      audioUrl: w.audioUrl,
      narrationText: w.narrationText,
      durationSeconds: 10
    })),
    totalDurationSeconds: 60,
    outputPath: `/tmp/slideshow/${tour.id}/output.mp4`
  });
  
  res.json({ videoPath, tour });
});

// Generate AND post to Twitter
app.post('/api/slideshow/post', async (req, res) => {
  const { tourId, destination, theme } = req.body;
  
  // Generate video (same as above)
  const videoPath = await generateSlideshow(...);
  
  // Upload to Twitter
  const mediaId = await uploadVideoToTwitter(videoPath, twitterClient);
  
  // Post tweet
  const caption = `✨ ${tour.name}\n\n📜 Claim your magical guide: turai.org/claim\n\n#${destination.replace(/\s+/g, '')} #TravelTips`;
  const tweetId = await postVideoTweet(twitterClient, mediaId, caption);
  
  res.json({ success: true, tweetId, videoPath });
});
```

---

## Phase 5: UI Integration (Optional)

### 5.1 Slideshow Preview Page

**File:** `VibePost-Core/client/src/pages/slideshow-creator.tsx`

Features:
- Select from existing tours OR enter destination
- Preview stops (images + narration text)
- Generate video button
- Post to Twitter button
- View generated videos history

---

## Technical Requirements

### Dependencies

```bash
# FFmpeg for video processing
npm install fluent-ffmpeg @types/fluent-ffmpeg

# Ensure FFmpeg is installed on server
brew install ffmpeg  # macOS
apt-get install ffmpeg  # Linux
```

### Environment Variables

```env
TURAI_API_URL=http://localhost:5002  # or production URL
FFMPEG_PATH=/usr/local/bin/ffmpeg    # optional, auto-detected
```

### Server Requirements

- Node.js 18+
- FFmpeg 4.4+
- ~500MB temp storage per video
- ~30 seconds processing time per video

---

## Cost Considerations

| Component | Cost |
|-----------|------|
| Turai Tour Generation | Free (existing narrations) or ~$0.05 (new tour) |
| TTS Narration | ~$0.01 per stop |
| Image downloads | Free |
| FFmpeg processing | CPU time only |
| Twitter upload | Free |

**Total per video:** ~$0.05-$0.10

---

## Timeline (Simplified with Puppeteer)

| Phase | Tasks | Time |
|-------|-------|------|
| 1 | Puppeteer screen recorder service | 1.5 hours |
| 2 | Audio merge (if needed) | 0.5 hours |
| 3 | Twitter video upload | 1 hour |
| 4 | API endpoints | 0.5 hours |
| 5 | UI (optional) | 2+ hours |

**MVP (Phases 1-4):** 3-4 hours  
**Full Feature (with UI):** 5-6 hours

---

## Prerequisites Before Starting

1. **Turai Lead Generation Stabilized** - Current hunt improvements fully tested
2. **Daily Postcard Feature Verified** - Single-image posts working well
3. **Reddit API Approved** - Community posting unlocked
4. **Existing Slideshow Works** - `/slideshow/{shareCode}` page functional

---

## Success Metrics

- [ ] Generate 60-second video from any Turai tour
- [ ] Video includes Ken Burns pan/zoom on images
- [ ] Audio narration synced with images
- [ ] Successfully post video to Twitter
- [ ] Video gets >3x engagement vs. single-image posts

---

## Future Enhancements

1. **Intro/Outro Slides** - Turai branding at start/end
2. **Background Music** - Subtle royalty-free music under narration
3. **Caption Overlays** - Location names as text overlays
4. **Multiple Aspect Ratios** - 16:9 (YouTube), 9:16 (Stories), 1:1 (Instagram)
5. **Scheduled Video Posts** - Auto-generate and post daily videos
6. **Video Analytics** - Track which destinations get most views

---

*Ready to implement when Turai and lead generation are stable!*
