/**
 * Reply Video Generator
 * Creates short (15-30 sec) teaser videos for travel replies
 * Based on multiple interests/themes detected from the user's tweet
 */

import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { GoogleGenAI } from "@google/genai";
import { analyzeForVoicePersonalization, generateGrokTTS, addLocalGreeting, enhanceNarrationForEmotion } from './grok_tts';

// Safely initialize FFmpeg paths
try {
    const { path: ffmpegPath } = require('@ffmpeg-installer/ffmpeg');
    const { path: ffprobePath } = require('@ffprobe-installer/ffprobe');
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
} catch (err) {
    console.error('⚠️ FFmpeg initialization failed in reply_video_generator:', err);
    try {
        const localFfmpeg = path.join(process.cwd(), 'repl_bin', 'ffmpeg');
        const localFfprobe = path.join(process.cwd(), 'repl_bin', 'ffprobe');

        if (fs.existsSync(localFfmpeg)) {
            console.log('🚀 Reply Video Generator: Using local static FFmpeg');
            ffmpeg.setFfmpegPath(localFfmpeg);
            ffmpeg.setFfprobePath(localFfprobe);
        } else {
            ffmpeg.setFfmpegPath('ffmpeg');
            ffmpeg.setFfprobePath('ffprobe');
        }
    } catch (e) {
        // Fallback to safely prevent crash
        console.error('Final FFmpeg fallback error:', e);
    }
}

const TURAI_API_URL = process.env.TURAI_API_URL || "https://turai.org";
const TEMP_DIR = path.join(process.cwd(), 'reply_videos');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: apiKey || "dummy" });

interface TravelInterest {
    theme: string;
    keywords: string;
    emoji: string;
}

interface ReplyVideoResult {
    success: boolean;
    videoPath?: string;
    thumbnailPath?: string;
    interests: TravelInterest[];
    error?: string;
}

/**
 * Extract multiple travel interests from a tweet
 */
async function extractTravelInterests(tweetText: string, location: string): Promise<TravelInterest[]> {
    try {
        const prompt = `Analyze this travel-related tweet and extract 3-4 specific travel interests or themes.

Tweet: "${tweetText}"
Location: ${location}

Return a JSON array of interests. Each interest should have:
- theme: A 1-2 word label (e.g., "Beaches", "Food", "Nightlife", "Architecture")
- keywords: Search keywords to find photos (e.g., "beautiful beach sunset coastline")
- emoji: A relevant emoji

Focus on what the person seems interested in. If unclear, suggest popular activities for the location.

Example output:
[
  {"theme": "Beaches", "keywords": "beautiful beach sunset ${location}", "emoji": "🏖️"},
  {"theme": "Food", "keywords": "local cuisine restaurant ${location}", "emoji": "🍽️"},
  {"theme": "Nightlife", "keywords": "nightclub entertainment ${location}", "emoji": "🎉"}
]

Return ONLY the JSON array, no markdown:`;

        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = result.text?.trim() || "[]";
        // Clean potential markdown
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const interests = JSON.parse(cleanJson) as TravelInterest[];

        // Ensure we have at least 3 interests
        if (interests.length < 3) {
            // Add generic fallbacks
            const fallbacks: TravelInterest[] = [
                { theme: "Landmarks", keywords: `famous landmark ${location}`, emoji: "🏛️" },
                { theme: "Views", keywords: `scenic viewpoint ${location}`, emoji: "📸" },
                { theme: "Culture", keywords: `local culture ${location}`, emoji: "🎭" },
            ];
            while (interests.length < 3) {
                interests.push(fallbacks[interests.length]);
            }
        }

        return interests.slice(0, 4); // Max 4 interests
    } catch (error) {
        console.error("Error extracting travel interests:", error);
        // Return generic interests
        return [
            { theme: "Explore", keywords: `${location} travel destination`, emoji: "✈️" },
            { theme: "Culture", keywords: `${location} culture tradition`, emoji: "🎭" },
            { theme: "Food", keywords: `${location} local cuisine`, emoji: "🍽️" },
        ];
    }
}

/**
 * Fetch image for a specific interest - uses same sources as postcard_drafter.ts
 * Fallback chain: Turai API → Pollinations → LoremFlickr
 */
async function fetchInterestImage(interest: TravelInterest, location: string): Promise<string | null> {
    const localPath = path.join(TEMP_DIR, `interest_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);

    console.log(`      Fetching ${interest.emoji} ${interest.theme}...`);

    // Use Turai API URL from env (local: 5050, production: turai.org)
    const turaiApiUrl = process.env.TURAI_API_URL || "http://localhost:5050";

    // 1. Try Turai API first (Gemini-powered, best quality)
    try {
        const response = await fetch(`${turaiApiUrl}/api/postcards/generate-by-topic`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                location: { name: location },
                topic: interest.theme,
                aspectRatio: "1:1",
                stylePreset: "vibrant"
            })
        });

        if (response.ok) {
            const data = await response.json() as { success: boolean; data?: { imageUrl?: string } };
            if (data.success && data.data?.imageUrl) {
                // Image is base64, write to file
                const base64Data = data.data.imageUrl.replace(/^data:image\/\w+;base64,/, '');
                fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'));

                if (fs.existsSync(localPath) && fs.statSync(localPath).size > 10000) {
                    console.log(`      ✓ Got ${interest.theme} image (Turai API)`);
                    return localPath;
                }
            }
        }
    } catch (error) {
        console.log(`      ⚠️ Turai API failed for ${interest.theme}, trying Pollinations...`);
    }

    // 2. Fallback to Pollinations AI
    try {
        const prompt = encodeURIComponent(
            `${location} ${interest.theme.toLowerCase()} travel photography, scenic, high quality, no text, no words, no letters`
        );
        const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=1080&nologo=true`;

        await downloadFile(imageUrl, localPath);

        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 10000) {
            console.log(`      ✓ Got ${interest.theme} image (Pollinations)`);
            return localPath;
        }
    } catch (error) {
        console.log(`      ⚠️ Pollinations failed for ${interest.theme}, trying LoremFlickr...`);
    }

    // 3. Last resort: LoremFlickr (real photos)
    try {
        const query = encodeURIComponent(`${location} ${interest.theme}`.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().replace(/\s+/g, ','));
        const flickrUrl = `https://loremflickr.com/1080/1080/${query}?random=${Date.now()}`;

        await downloadFile(flickrUrl, localPath);

        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 10000) {
            console.log(`      ✓ Got ${interest.theme} image (LoremFlickr)`);
            return localPath;
        }
    } catch (error) {
        console.error(`      ✗ All sources failed for ${interest.theme}:`, error);
    }

    return null;
}



/**
 * Download a file from URL to local path
 */
async function downloadFile(url: string, localPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(localPath);

        // Pollinations AI takes time to generate images - use 60s timeout
        const request = protocol.get(url, { timeout: 60000 }, (response) => {
            // Handle redirects (301, 302, 303)
            if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303) {
                let redirectUrl = response.headers.location;
                if (redirectUrl) {
                    // Handle relative redirects (LoremFlickr returns paths like /cache/...)
                    if (redirectUrl.startsWith('/')) {
                        const baseUrl = new URL(url);
                        redirectUrl = `${baseUrl.protocol}//${baseUrl.host}${redirectUrl}`;
                    }
                    file.close();
                    downloadFile(redirectUrl, localPath).then(resolve).catch(reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                file.close();
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        });

        request.on('error', (err) => {
            file.close();
            reject(err);
        });
        request.on('timeout', () => {
            request.destroy();
            file.close();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Generate personalized narration text using AI
 * Addresses the user's specific question and interests
 * Target: ~30 seconds of speech (roughly 75-90 words)
 */
async function generatePersonalizedNarration(
    tweetText: string,
    location: string,
    interests: TravelInterest[]
): Promise<string> {
    try {
        const interestList = interests.map(i => i.theme).join(', ');

        const prompt = `You are a CHARISMATIC travel friend creating a 30-second video narration.

User's tweet: "${tweetText}"
Destination: ${location}
Topics to cover: ${interestList}

PERSONALITY (This is what makes you memorable):
- You're an enthusiastic local friend, not a travel brochure
- Share secrets like you're letting them in on something special: "Most tourists miss this, but..."
- Express genuine EXCITEMENT: "I absolutely love this part of ${location}..."
- Add light humor where appropriate
- Use SENSORY language: What does it smell/sound/feel like?

Write a warm, personalized narration that:
1. Opens with a HOOK that grabs attention (reference something specific from their tweet)
2. Gives ONE quick, insider tip that answers their question
3. Mentions each topic (${interestList}) with genuine enthusiasm
4. Ends with a friendly invite to turai.org

Rules:
- Keep it 75-90 words (30 seconds when spoken)
- Sound like an excited friend, not a tour guide
- Use short, punchy sentences
- No hashtags or emojis in the narration
- Vary your sentence starters - don't repeat

Example tone: "So you're curious about ${location}? Oh, you're in for a treat! Here's what most people don't know..."

Write ONLY the narration text, no quotes or labels:`;

        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const narration = result.text?.trim();
        if (narration && narration.length > 50) {
            return narration;
        }
    } catch (error) {
        console.error("AI narration failed, using fallback:", error);
    }

    // Fallback to simple template
    const interestNames = interests.map(i => i.theme.toLowerCase()).join(', ');
    return `Planning a trip to ${location}? Great choice! Here's a quick peek at what makes it special. You'll love exploring the ${interestNames}. Each one offers something unique that makes ${location} unforgettable. Ready, to plan your perfect trip? Head over to turai.org for your personalized AI travel guide!`;
}

/**
 * Generate personalized reply text using AI
 * Creates a tweet-length response that directly addresses the user's question
 */
export async function generatePersonalizedReplyText(
    tweetText: string,
    authorHandle: string,
    location: string,
    interests: TravelInterest[]
): Promise<string> {
    try {
        const handle = authorHandle.startsWith('@') ? authorHandle : `@${authorHandle}`;
        const interestEmojis = interests.map(i => `${i.emoji} ${i.theme}`).join(' • ');

        const prompt = `Write a Twitter reply to someone asking about travel to ${location}.

Their tweet: "${tweetText}"
Topics in video: ${interestEmojis}

Write a reply that:
1. Starts with ${handle}
2. Directly addresses their specific question/interest (not generic)
3. Gives a quick helpful tip or insight
4. Mentions the video shows more
5. Ends with "Full guide in bio 🗺️"

Rules:
- Under 240 characters total (Twitter limit)
- Warm and helpful, not salesy
- Include 1-2 relevant emojis
- Reference something specific from their tweet

Example: "${handle} For those cozy cafe vibes, head to Ubud! This preview shows the best spots 🎬 Full guide in bio 🗺️"

Write ONLY the tweet text:`;

        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        let reply = result.text?.trim() || "";

        // Ensure it starts with the handle
        if (!reply.toLowerCase().startsWith(handle.toLowerCase())) {
            reply = `${handle} ${reply}`;
        }

        // Truncate if too long
        if (reply.length > 270) {
            reply = reply.substring(0, 267) + "...";
        }

        if (reply.length > 50) {
            return reply;
        }
    } catch (error) {
        console.error("AI reply text failed, using fallback:", error);
    }

    // Fallback
    const handle = authorHandle.startsWith('@') ? authorHandle : `@${authorHandle}`;
    const interestEmojis = interests.map(i => `${i.emoji} ${i.theme}`).join(' • ');
    return `${handle} Here's a quick preview of ${location}! 🎬\n\n${interestEmojis}\n\nFull guide in bio 🗺️`;
}

/**
 * Fetch audio narration - Direct ElevenLabs with Turai fallback
 */
async function fetchNarration(text: string, outputPath: string): Promise<void> {
    // Import ElevenLabs TTS service
    const { generateElevenLabsTTS } = await import('./elevenlabs_tts');

    // 1. Try Direct ElevenLabs first (fastest, most reliable)
    try {
        console.log(`      Generating narration...`);
        const result = await generateElevenLabsTTS(text, outputPath);

        if (result.success) {
            return; // Success!
        }

        console.log(`      ⚠️ ElevenLabs direct failed: ${result.error}, trying Turai...`);
    } catch (error) {
        console.log(`      ⚠️ ElevenLabs direct error:`, error);
    }

    // 2. Fallback to Turai API (if ElevenLabs direct fails)
    const TURAI_API = process.env.TURAI_API_URL || "https://turai.org";

    try {
        const response = await fetch(`${TURAI_API}/api/tts/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice: 'Ara',  // Use Grok TTS voice
                speed: 1.0
            })
        });

        if (!response.ok) {
            throw new Error(`TTS API returned ${response.status}`);
        }

        const data = await response.json() as { success?: boolean; data?: { audioUrl?: string }; audioUrl?: string };
        const audioUrl = data.data?.audioUrl || data.audioUrl;
        if (!audioUrl) throw new Error('No audio URL in response');

        // Handle base64 data URL
        if (audioUrl.startsWith('data:')) {
            const matches = audioUrl.match(/^data:audio\/\w+;base64,(.+)$/);
            if (matches && matches[1]) {
                const audioBuffer = Buffer.from(matches[1], 'base64');
                fs.writeFileSync(outputPath, audioBuffer);
                console.log(`      ✓ Narration generated via Turai (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
                return;
            }
            throw new Error('Invalid base64 audio data URL format');
        }

        // Handle HTTP URL
        const fullAudioUrl = audioUrl.startsWith('http') ? audioUrl : `${TURAI_API}${audioUrl}`;
        await downloadFile(fullAudioUrl, outputPath);
        console.log(`      ✓ Narration generated via Turai`);
    } catch (error) {
        console.error(`      ⚠️ All narration methods failed:`, error);
        throw error;
    }
}

/**
 * Create a short teaser video from multiple interest images with audio
 */
async function createTeaserVideo(
    images: { path: string; interest: TravelInterest }[],
    location: string,
    outputPath: string,
    audioPath?: string
): Promise<void> {
    // Each image shows for 5 seconds (15-20 sec total)
    const durationPerImage = 5;
    const totalDuration = images.length * durationPerImage;

    console.log(`      Building ${totalDuration}s video from ${images.length} images...`);
    fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen] 🎥 Building ${totalDuration}s video... (5s per image)\n`);

    // Create individual image clips SEQUENTIALLY to avoid OOM crashes
    const tempVideos: string[] = [];

    for (let idx = 0; idx < images.length; idx++) {
        const img = images[idx];
        const tempPath = path.join(TEMP_DIR, `temp_${Date.now()}_${idx}.mp4`);
        tempVideos.push(tempPath);

        const { spawn } = require('child_process');
        const relativeImgPath = path.relative(process.cwd(), img.path);
        const relativeTempPath = path.relative(process.cwd(), tempPath);

        console.log(`      - Encoding segment ${idx + 1}/${images.length}...`);

        await new Promise<void>((res, rej) => {
            const args = [
                '-loop', '1',
                '-i', relativeImgPath,
                '-vf', `scale=720:720:force_original_aspect_ratio=increase,crop=720:720,fade=t=in:st=0:d=0.5,fade=t=out:st=${durationPerImage - 0.5}:d=0.5`,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '32',
                '-t', String(durationPerImage),
                '-r', '24',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                '-y',
                relativeTempPath
            ];

            let ffmpegBinary = 'ffmpeg';
            try {
                const { path: resolvedPath } = require('@ffmpeg-installer/ffmpeg');
                ffmpegBinary = resolvedPath;
            } catch (e) {
                if (fs.existsSync(path.join(process.cwd(), 'repl_bin', 'ffmpeg'))) {
                    ffmpegBinary = path.join(process.cwd(), 'repl_bin', 'ffmpeg');
                }
            }

            const ff = spawn(ffmpegBinary, args);

            let stderr = '';
            ff.stderr.on('data', (data: any) => stderr += data.toString());

            ff.on('close', (code: number) => {
                if (code === 0) {
                    fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen]    ✅ Segment ${idx + 1} complete\n`);
                    res();
                } else {
                    console.error(`      ❌ Segment ${idx} failed with code ${code}: ${stderr}`);
                    fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen]    ❌ Segment ${idx + 1} failed (Code ${code}): ${stderr.substring(0, 200)}\n`);
                    rej(new Error(`FFmpeg failed with code ${code}`));
                }
            });
        });
    }

    // Proceed to concat
    try {
        const concatFile = path.resolve(TEMP_DIR, `concat_${Date.now()}.txt`);
        const concatContent = tempVideos.map(v => `file '${path.resolve(v)}'`).join('\n');
        fs.writeFileSync(concatFile, concatContent);

        // Find FFmpeg binary
        let ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
        if (ffmpegPath === 'ffmpeg' && fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
            ffmpegPath = '/opt/homebrew/bin/ffmpeg';
        }

        const args = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatFile
        ];

        if (audioPath && fs.existsSync(audioPath)) {
            args.push('-i', path.resolve(audioPath));
        }

        args.push(
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-movflags', '+faststart'
        );

        if (audioPath && fs.existsSync(audioPath)) {
            args.push('-c:a', 'aac', '-map', '0:v', '-map', '1:a', '-shortest');
        } else {
            args.push('-c:a', 'copy');
        }

        const outPathResolved = path.resolve(outputPath);
        args.push(outPathResolved);

        fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen] assembling: ${ffmpegPath} ${args.join(' ')}\n`);

        await new Promise<void>((resolve, reject) => {
            fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen] Spawning FFmpeg process...\n`);

            let child;
            try {
                child = spawn(ffmpegPath, args);
                fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen] FFmpeg process spawned (PID: ${child.pid})\n`);
            } catch (spawnError) {
                fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen] ❌ Spawn failed: ${spawnError}\n`);
                reject(spawnError);
                return;
            }

            let stderr = '';

            // Handle timeout
            const timeout = setTimeout(() => {
                fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen] ⏱️ Timeout reached, killing process\n`);
                child.kill('SIGKILL');
                reject(new Error('FFmpeg assembly timed out after 60s'));
            }, 60000);

            child.on('error', (err) => {
                clearTimeout(timeout);
                fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen] ❌ Process error: ${err.message}\n`);
                reject(err);
            });

            child.stderr.on('data', (data) => { stderr += data.toString(); });

            child.on('close', (code) => {
                clearTimeout(timeout);
                fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen] Process closed with code ${code}\n`);
                if (code === 0) {
                    try {
                        tempVideos.forEach(v => { if (fs.existsSync(v)) fs.unlinkSync(v); });
                        if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
                    } catch (e) { }
                    fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen]    ✅ Video assembled: ${path.basename(outputPath)}\n`);
                    resolve();
                } else {
                    fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen]    ❌ Assembly failed (Code ${code}): ${stderr.substring(0, 200)}\n`);
                    reject(new Error(`FFmpeg concat failed with code ${code}`));
                }
            });
        });
    } catch (err) {
        throw err;
    }
}



/**
 * Generate a teaser video reply for a travel tweet
 * Now with Grok TTS for expressive voices and local greetings!
 */
export async function generateReplyVideo(
    tweetText: string,
    location: string,
    authorHandle?: string,
    authorName?: string
): Promise<ReplyVideoResult> {
    const log = (msg: string) => {
        fs.appendFileSync('auto_publish_debug.log', `[${new Date().toISOString()}] [VideoGen] ${msg}\n`);
    };

    log(`🎬 Starting generation for ${location}...`);

    try {
        // 1. Extract travel interests from tweet
        log("📊 Analyzing travel interests with Gemini...");
        const interests = await extractTravelInterests(tweetText, location);
        log(`Found ${interests.length} interests: ${interests.map(i => i.theme).join(', ')}`);

        // 2. Fetch images for each interest
        log("📷 Fetching images for interests...");
        const imageResults: { path: string; interest: TravelInterest }[] = [];

        for (const interest of interests) {
            log(`   Fetching image for ${interest.theme}...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout per image

            try {
                const imagePath = await fetchInterestImage(interest, location);
                if (imagePath && fs.existsSync(imagePath)) {
                    imageResults.push({ path: imagePath, interest });
                    log(`   ✅ Got image for ${interest.theme}`);
                } else {
                    log(`   ⚠️ Failed to get image for ${interest.theme}`);
                }
            } finally {
                clearTimeout(timeoutId);
            }
        }

        if (imageResults.length < 2) {
            log(`❌ Not enough images fetched (${imageResults.length}/2). Aborting.`);
            return {
                success: false,
                interests,
                error: "Not enough images fetched"
            };
        }

        // 3. Analyze poster for voice personalization
        log(`🎭 Analyzing poster @${authorHandle} for voice personalization...`);
        let voiceProfile;
        try {
            voiceProfile = await analyzeForVoicePersonalization(
                tweetText,
                authorHandle || '',
                authorName || '',
                location
            );
            log(`   Selected voice: ${voiceProfile.suggestedVoice}`);
        } catch (e) {
            log(`   ⚠️ Voice analysis failed, using fallback`);
            voiceProfile = {
                suggestedVoice: 'Ara',
                localGreeting: 'Hey there!',
                destinationLanguage: 'English',
                inferredGender: 'unknown' as const
            };
        }

        // 4. Generate personalized audio narration with Grok TTS
        log(`🔊 Generating personalized narration...`);
        let audioPath: string | undefined;
        try {
            let narrationText = await generatePersonalizedNarration(tweetText, location, interests);
            log(`   Narration text generated (${narrationText.length} chars)`);

            // Add local greeting if destination is non-English
            narrationText = addLocalGreeting(narrationText, voiceProfile.localGreeting, voiceProfile.destinationLanguage);
            narrationText = enhanceNarrationForEmotion(narrationText);

            audioPath = path.join(TEMP_DIR, `narration_${Date.now()}.mp3`);

            log(`   Generating audio file...`);
            const grokResult = await generateGrokTTS(narrationText, audioPath, voiceProfile.suggestedVoice);

            if (!grokResult.success) {
                log(`   ⚠️ Grok TTS unavailable, using fallback TTS (Turai)...`);
                // Add timeout to fallback tts too
                const ttsController = new AbortController();
                const ttsTimeout = setTimeout(() => ttsController.abort(), 60000); // 60s timeout
                try {
                    await fetchNarration(narrationText, audioPath);
                    log(`   ✅ Fallback TTS narration complete`);
                } finally {
                    clearTimeout(ttsTimeout);
                }
            } else {
                log(`   ✅ Grok TTS narration complete`);
            }
        } catch (e) {
            log(`   ⚠️ Narration generation failed: ${e instanceof Error ? e.message : String(e)}`);
            audioPath = undefined;
        }

        // 4. Create video
        log(`🎥 Creating FFmpeg video with ${imageResults.length} images...`);
        const videoFilename = `reply_${Date.now()}.mp4`;
        const videoPath = path.join(TEMP_DIR, videoFilename);

        await createTeaserVideo(imageResults, location, videoPath, audioPath);
        log(`✅ Teaser video created at ${videoPath}`);

        // 5. Clean up temp files
        log(`🧹 Cleaning up temp image files...`);
        for (const img of imageResults) {
            try { fs.unlinkSync(img.path); } catch (e) { }
        }
        if (audioPath) {
            try { fs.unlinkSync(audioPath); } catch (e) { }
        }

        return {
            success: true,
            videoPath,
            interests
        };

    } catch (error) {
        log(`❌ ERROR in generateReplyVideo: ${error instanceof Error ? error.message : String(error)}`);
        console.error("Reply video generation failed:", error);
        return {
            success: false,
            interests: [],
            error: error instanceof Error ? error.message : String(error)
        };
    }
}


/**
 * Clean up old reply videos (older than 24 hours)
 */
export function cleanupOldVideos(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    try {
        const files = fs.readdirSync(TEMP_DIR);
        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                console.log(`🧹 Cleaned up old video: ${file}`);
            }
        }
    } catch (error) {
        console.error("Error cleaning up videos:", error);
    }
}
