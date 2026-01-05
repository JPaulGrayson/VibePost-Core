# VibePost Recovery Fixes

This document contains the fixes that will be lost during rollback and need to be reapplied.

---

## 1. Lazy FFmpeg Initialization (ESM Compatibility Fix)

**Problem:** The original code used `require('child_process')` which doesn't work in ESM modules and caused crashes in production.

**Solution:** Use lazy initialization with `spawnSync` from the native import.

**File:** `server/services/reply_video_generator.ts`

**Replace the top imports and add this initialization code:**

```typescript
/**
 * Reply Video Generator
 * Creates ~60 second teaser videos for travel replies
 * Based on multiple interests/themes detected from the user's tweet
 */

import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn, spawnSync } from 'child_process';
import { GoogleGenAI } from "@google/genai";
import { analyzeForVoicePersonalization, generateGrokTTS, addLocalGreeting, enhanceNarrationForEmotion } from './grok_tts';

// Lazy FFmpeg initialization - finds executable at runtime without bundled packages
let ffmpegInitialized = false;
let resolvedFfmpegPath = 'ffmpeg';

function initFfmpeg(): string {
    if (ffmpegInitialized) return resolvedFfmpegPath;
    ffmpegInitialized = true;
    
    const isExecutable = (p: string): boolean => {
        try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
    };
    
    const findSystemBinary = (name: string): string | null => {
        try {
            const result = spawnSync('which', [name], { encoding: 'utf8' });
            if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
        } catch {}
        return null;
    };
    
    const envFfmpeg = process.env.FFMPEG_PATH;
    const envFfprobe = process.env.FFPROBE_PATH;
    const localFfmpeg = path.join(process.cwd(), 'repl_bin', 'ffmpeg');
    const localFfprobe = path.join(process.cwd(), 'repl_bin', 'ffprobe');
    
    let ffmpegPath = 'ffmpeg';
    let ffprobePath = 'ffprobe';
    
    if (envFfmpeg && isExecutable(envFfmpeg)) {
        console.log('🚀 Reply Video: Using FFMPEG_PATH from environment');
        ffmpegPath = envFfmpeg;
        ffprobePath = envFfprobe || 'ffprobe';
    } else if (isExecutable(localFfmpeg)) {
        console.log('🚀 Reply Video: Using local static FFmpeg');
        ffmpegPath = localFfmpeg;
        ffprobePath = localFfprobe;
    } else {
        const systemFfmpeg = findSystemBinary('ffmpeg');
        const systemFfprobe = findSystemBinary('ffprobe');
        if (systemFfmpeg) {
            console.log('📹 Reply Video: Using system FFmpeg:', systemFfmpeg);
            ffmpegPath = systemFfmpeg;
            ffprobePath = systemFfprobe || 'ffprobe';
        } else {
            console.log('📹 Reply Video: Using FFmpeg from PATH');
        }
    }
    
    resolvedFfmpegPath = ffmpegPath;
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    return resolvedFfmpegPath;
}
```

**Important:** Make sure to call `initFfmpeg()` at the start of any function that uses FFmpeg, before running any ffmpeg commands.

---

## 2. Sniper Auto-Resume on Startup

**Problem:** Sniper was paused by default and required manual activation after each restart.

**Solution:** Set `isPaused = false` so sniper runs automatically on startup.

**File:** `server/services/sniper_manager.ts`

**Find this line:**
```typescript
private isPaused = true;   // Sniper starts paused
```

**Replace with:**
```typescript
private isPaused = false;   // AUTO-RESUME on startup - sniper runs automatically
```

---

## 3. Video Reply Flag in Auto-Publisher

**Problem:** Video replies were being generated but the `videoReply` flag wasn't being set properly.

**Solution:** Ensure `videoReply: true` is set in platformData when publishing with video.

**File:** `server/services/auto_publisher.ts`

When updating a draft after publishing with video, make sure the update includes:
```typescript
platformData: {
    ...existingPlatformData,
    videoReply: true,
    videoPath: result.videoPath
}
```

---

## 4. DATABASE_URL Configuration (DO NOT APPLY YET)

**Note:** This fix was attempted but caused issues. Keep this for reference but do NOT apply until properly tested.

The production DATABASE_URL should use Neon's **pooler endpoint** (add `-pooler` to hostname):

```
postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
```

The `-pooler` endpoint uses PgBouncer to handle connection pooling, which helps with:
- Neon auto-suspend/wakeup cycles
- Connection exhaustion from multiple background services

**This requires careful testing before deployment.**

---

## Summary of Changes to Reapply After Rollback

1. **FFmpeg lazy init** - Apply to `reply_video_generator.ts`
2. **Sniper auto-resume** - Change `isPaused = false` in `sniper_manager.ts`
3. **Video reply flag** - Verify in `auto_publisher.ts`

The database changes should NOT be reapplied until a proper solution is found.
