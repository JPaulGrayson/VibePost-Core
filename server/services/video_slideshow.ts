import puppeteer, { Browser, Page } from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { storage } from '../storage';

// Lazy FFmpeg path detection (no bundled installer packages)
let cachedFfmpegPath: string | null = null;

function getFfmpegPath(): string {
    if (cachedFfmpegPath) return cachedFfmpegPath;
    
    const isExecutable = (p: string): boolean => {
        try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
    };
    
    // Check env variable first
    if (process.env.FFMPEG_PATH && isExecutable(process.env.FFMPEG_PATH)) {
        cachedFfmpegPath = process.env.FFMPEG_PATH;
        return cachedFfmpegPath;
    }
    
    // Check local binary
    const localFfmpeg = path.join(process.cwd(), 'repl_bin', 'ffmpeg');
    if (isExecutable(localFfmpeg)) {
        cachedFfmpegPath = localFfmpeg;
        return cachedFfmpegPath;
    }
    
    // Use which command to find system FFmpeg
    try {
        const result = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
        if (result.status === 0 && result.stdout.trim()) {
            cachedFfmpegPath = result.stdout.trim();
            return cachedFfmpegPath;
        }
    } catch {}
    
    // Fallback to PATH
    cachedFfmpegPath = 'ffmpeg';
    return cachedFfmpegPath;
}

// Configuration
// Turai API and frontend run on the same server
// Set TURAI_API_URL in .env (local: http://localhost:5050, production: https://turai.org)
const TURAI_API_URL = process.env.TURAI_API_URL || process.env.TURAI_BASE_URL || 'http://localhost:5050';
const TURAI_BASE_URL = process.env.TURAI_BASE_URL || TURAI_API_URL;
const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'videos');
const DEFAULT_VIDEO_DURATION = 60; // seconds
const VIEWPORT_WIDTH = 1080;
const VIEWPORT_HEIGHT = 1920; // Vertical format for social media

// Ensure video directory exists
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
    fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
}

interface VideoGenerationResult {
    success: boolean;
    videoPath?: string;
    error?: string;
    destination?: string;
    duration?: number;
    shareCode?: string;
}

interface SlideshowData {
    shareCode: string;
    tour: {
        id: string;
        name: string;
        destination: string;
        pointsOfInterest: any[];
    };
    narrations: any[];
}

/**
 * Generate a video slideshow by recording a Turai slideshow
 */
export async function generateVideoSlideshow(
    destination: string,
    options: {
        duration?: number;
        theme?: string;
    } = {}
): Promise<VideoGenerationResult> {
    const { duration = DEFAULT_VIDEO_DURATION, theme = 'general' } = options;

    console.log(`🎬 Starting video generation for: ${destination}`);

    let browser: Browser | null = null;
    let recorder: PuppeteerScreenRecorder | null = null;

    try {
        // Step 1: Generate a tour via Turai API
        console.log('📍 Generating tour via Turai API...');
        const tourResult = await generateTuraiTour(destination, theme);

        if (!tourResult.success || !tourResult.shareCode) {
            return { success: false, error: tourResult.error || 'Failed to generate tour' };
        }

        const shareCode = tourResult.shareCode;
        console.log(`✅ Tour generated with share code: ${shareCode}`);

        // Step 2: Wait for narrations to be ready (need at least 3)
        console.log('⏳ Waiting for narrations to generate...');
        const slideshowReady = await waitForSlideshowReady(shareCode, 180000); // 3 min timeout for full tour

        if (!slideshowReady) {
            return { success: false, error: 'Slideshow narrations not ready in time' };
        }

        // Step 3: Launch Puppeteer and record
        console.log('🎥 Launching browser for recording...');
        browser = await puppeteer.launch({
            headless: true, // Use new headless mode
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--autoplay-policy=no-user-gesture-required'
            ]
        });

        const page = await browser.newPage();

        // Set viewport for vertical video (social media format)
        await page.setViewport({
            width: VIEWPORT_WIDTH,
            height: VIEWPORT_HEIGHT
        });

        // Configure recorder
        const videoFilename = `slideshow_${destination.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.mp4`;
        const videoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);

        const recorderConfig = {
            followNewTab: false,
            fps: 30,
            videoFrame: {
                width: VIEWPORT_WIDTH,
                height: VIEWPORT_HEIGHT
            },
            aspectRatio: '9:16' as const
        };

        recorder = new PuppeteerScreenRecorder(page, recorderConfig);

        // Navigate to slideshow
        const slideshowUrl = `${TURAI_BASE_URL}/slideshow/${shareCode}`;
        console.log(`📺 Navigating to: ${slideshowUrl}`);

        await page.goto(slideshowUrl, { waitUntil: 'networkidle0', timeout: 60000 });

        // Give React time to hydrate
        console.log('   ⏳ Waiting for React to hydrate...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Wait for the "Start Tour" button
        console.log('   🔍 Looking for start button...');

        try {
            await page.waitForSelector('[data-testid="button-start-slideshow"]', { timeout: 20000 });
            console.log('   ✅ Found start button');
        } catch (e) {
            // Log page content for debugging
            const pageContent = await page.content();
            console.log('   ⚠️ Start button not found. Page content length:', pageContent.length);
            throw new Error('Could not find start button on slideshow page');
        }

        // Start recording
        console.log('🔴 Recording started...');
        await recorder.start(videoPath);

        // Click the button to start the slideshow
        try {
            await page.click('[data-testid="button-start-slideshow"]');
            console.log('   ✅ Clicked start button');

            // Wait for the slideshow view to load (look for play/pause button)
            await page.waitForSelector('[data-testid="button-play-pause"]', { timeout: 10000 });
            console.log('   ✅ Slideshow view loaded');

        } catch (e) {
            console.log('   ⚠️ Failed to start slideshow properly:', e);
            // Continue anyway, maybe it started but selector failed?
        }

        // Record for the specified duration
        console.log(`⏱️ Recording for ${duration} seconds...`);
        await new Promise(resolve => setTimeout(resolve, duration * 1000));

        // Stop recording
        await recorder.stop();
        console.log('⏹️ Recording stopped');

        // Verify video file exists
        if (!fs.existsSync(videoPath)) {
            return { success: false, error: 'Video file was not created' };
        }

        // Re-encode to proper MP4 format (puppeteer-screen-recorder outputs WebM internally)
        console.log('🔄 Re-encoding to MP4 for compatibility...');
        const tempPath = videoPath.replace('.mp4', '_temp.webm');
        fs.renameSync(videoPath, tempPath);

        try {
            const ffmpeg = await import('fluent-ffmpeg').then(m => m.default);
            ffmpeg.setFfmpegPath(getFfmpegPath());

            await new Promise<void>((resolve, reject) => {
                ffmpeg(tempPath)
                    .outputOptions([
                        '-c:v', 'libx264',    // H.264 codec
                        '-preset', 'fast',
                        '-crf', '23',         // Quality (lower = better)
                        '-c:a', 'aac',        // AAC audio
                        '-b:a', '128k',
                        '-pix_fmt', 'yuv420p', // Required for QuickTime compatibility
                        '-movflags', '+faststart' // Enable streaming
                    ])
                    .output(videoPath)
                    .on('end', () => {
                        console.log('✅ Re-encoding complete');
                        fs.unlinkSync(tempPath); // Clean up temp file
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('❌ Re-encoding failed:', err);
                        // Restore original file
                        fs.renameSync(tempPath, videoPath);
                        reject(err);
                    })
                    .run();
            });
        } catch (reencodeError) {
            console.error('⚠️ FFmpeg re-encoding failed, keeping original:', reencodeError);
            // Restore original if re-encoding failed
            if (fs.existsSync(tempPath)) {
                fs.renameSync(tempPath, videoPath);
            }
        }

        // Step 5: Download and merge audio
        const audioResult = await downloadAndMergeAudio(shareCode, VIDEO_OUTPUT_DIR);

        if (audioResult.success && audioResult.audioPath) {
            // Merge audio with video
            const videoWithAudioPath = videoPath.replace('.mp4', '_with_audio.mp4');
            const mergeSuccess = await mergeAudioWithVideo(videoPath, audioResult.audioPath, videoWithAudioPath);

            if (mergeSuccess) {
                // Replace original with audio version
                fs.unlinkSync(videoPath);
                fs.renameSync(videoWithAudioPath, videoPath);

                // Cleanup temp audio
                try { fs.unlinkSync(audioResult.audioPath); } catch (e) { }
                console.log('🔊 Audio track added to video');
            }
        } else {
            console.log('⚠️ Video saved without audio (narration download failed)');
        }

        const stats = fs.statSync(videoPath);
        console.log(`✅ Video saved: ${videoPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

        return {
            success: true,
            videoPath,
            destination,
            duration,
            shareCode
        };

    } catch (error) {
        console.error('❌ Video generation failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    } finally {
        if (recorder) {
            try {
                await recorder.stop();
            } catch (e) {
                // Ignore if already stopped
            }
        }
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Generate a tour via Turai API
 */
async function generateTuraiTour(destination: string, theme: string): Promise<{
    success: boolean;
    shareCode?: string;
    error?: string;
}> {
    try {
        // Use the wizard/generate endpoint
        const response = await fetch(`${TURAI_API_URL}/api/tour-maker/wizard/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                location: destination,
                theme: theme,
                focus: 'landmarks',
                email: 'vibepost@turai.app' // System email for video generation
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Turai API error: ${response.status} - ${errorText}` };
        }

        const data = await response.json();

        // Handle nested response structure: { success: true, data: { shareCode: "..." } }
        const shareCode = data.data?.shareCode || data.shareCode;

        if (shareCode) {
            return { success: true, shareCode };
        }

        console.log('Turai API response:', JSON.stringify(data));
        return { success: false, error: 'No share code returned from Turai' };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate tour'
        };
    }
}

/**
 * Wait for slideshow narrations to be ready
 * Wait for at least MIN_NARRATIONS to ensure a proper slideshow
 */
async function waitForSlideshowReady(shareCode: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 5000; // Check every 5 seconds
    const MIN_NARRATIONS = 3;  // Need at least 3 stops for a good slideshow
    let lastNarrationCount = 0;
    let stableCount = 0;  // Track if narration count is stable (generation complete)

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`${TURAI_API_URL}/api/slideshows/${shareCode}`);

            if (response.ok) {
                const responseData = await response.json();
                // Handle nested response: { success: true, data: { narrations: [...] } }
                const slideshowData = responseData.data || responseData;

                if (slideshowData.narrations && slideshowData.narrations.length > 0) {
                    const narrationCount = slideshowData.narrations.length;

                    // Check if we have enough narrations
                    if (narrationCount >= MIN_NARRATIONS) {
                        console.log(`   ✅ ${narrationCount} narrations ready (min ${MIN_NARRATIONS} required)`);
                        return true;
                    }

                    // Check if generation has stabilized (count not increasing)
                    if (narrationCount === lastNarrationCount) {
                        stableCount++;
                        if (stableCount >= 3) {
                            // Count hasn't changed in 3 polls, generation might be done
                            console.log(`   ⚠️ Only ${narrationCount} narrations available, proceeding anyway`);
                            return narrationCount > 0;
                        }
                    } else {
                        stableCount = 0;
                    }

                    lastNarrationCount = narrationCount;
                    console.log(`   ⏳ ${narrationCount}/${MIN_NARRATIONS} narrations ready, waiting for more...`);
                } else {
                    const poiCount = slideshowData.tour?.pointsOfInterest?.length || 0;
                    console.log(`   ⏳ Waiting for narrations... (${poiCount} POIs in tour)`);
                }
            }
        } catch (error) {
            console.log(`   ⏳ Still waiting for narrations...`);
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return lastNarrationCount > 0;  // Return true if we have any narrations at timeout
}

/**
 * Download narration audio files and merge into single audio track
 */
async function downloadAndMergeAudio(shareCode: string, outputPath: string): Promise<{ success: boolean; audioPath?: string; error?: string }> {
    try {
        console.log('🔊 Downloading narration audio...');

        // Get slideshow data with narrations
        const response = await fetch(`${TURAI_API_URL}/api/slideshows/${shareCode}`);
        if (!response.ok) {
            return { success: false, error: 'Failed to fetch slideshow data' };
        }

        const responseData = await response.json();
        const slideshowData = responseData.data || responseData;
        const narrations = slideshowData.narrations || [];

        if (narrations.length === 0) {
            return { success: false, error: 'No narrations available' };
        }

        // Download each audio file
        const audioFiles: string[] = [];
        const tempDir = path.join(VIDEO_OUTPUT_DIR, 'temp_audio');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        for (let i = 0; i < narrations.length; i++) {
            const narration = narrations[i];
            let audioUrl = narration.audioUrl;

            if (!audioUrl) continue;

            // Make URL absolute if needed
            if (audioUrl.startsWith('/')) {
                audioUrl = `${TURAI_API_URL}${audioUrl}`;
            }

            const audioFile = path.join(tempDir, `narration_${i}.mp3`);

            try {
                console.log(`   📥 Downloading audio ${i + 1}/${narrations.length}...`);
                const audioResponse = await fetch(audioUrl);

                if (audioResponse.ok) {
                    const buffer = Buffer.from(await audioResponse.arrayBuffer());
                    fs.writeFileSync(audioFile, buffer);
                    audioFiles.push(audioFile);
                }
            } catch (e) {
                console.log(`   ⚠️ Failed to download audio ${i + 1}`);
            }
        }

        if (audioFiles.length === 0) {
            return { success: false, error: 'No audio files downloaded' };
        }

        console.log(`   ✅ Downloaded ${audioFiles.length} audio files`);

        // Concatenate audio files using FFmpeg
        const ffmpeg = await import('fluent-ffmpeg').then(m => m.default);
        ffmpeg.setFfmpegPath(getFfmpegPath());

        // Create concat list file
        const concatListPath = path.join(tempDir, 'concat_list.txt');
        const concatContent = audioFiles.map(f => `file '${f}'`).join('\n');
        fs.writeFileSync(concatListPath, concatContent);

        // Merge audio files
        const mergedAudioPath = path.join(tempDir, 'merged_audio.mp3');

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions(['-c', 'copy'])
                .output(mergedAudioPath)
                .on('end', () => {
                    console.log('   ✅ Audio merged successfully');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('   ❌ Audio merge failed:', err);
                    reject(err);
                })
                .run();
        });

        // Cleanup individual files
        for (const file of audioFiles) {
            try { fs.unlinkSync(file); } catch (e) { }
        }
        try { fs.unlinkSync(concatListPath); } catch (e) { }

        return { success: true, audioPath: mergedAudioPath };

    } catch (error) {
        console.error('Audio download/merge failed:', error);
        return { success: false, error: String(error) };
    }
}

/**
 * Merge audio track with video
 */
async function mergeAudioWithVideo(videoPath: string, audioPath: string, outputPath: string): Promise<boolean> {
    try {
        console.log('🎬 Merging audio with video...');

        const ffmpeg = await import('fluent-ffmpeg').then(m => m.default);
        ffmpeg.setFfmpegPath(getFfmpegPath());

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(videoPath)
                .input(audioPath)
                .outputOptions([
                    '-c:v', 'copy',           // Copy video stream
                    '-c:a', 'aac',            // Encode audio to AAC
                    '-b:a', '192k',           // Audio bitrate
                    '-shortest',              // End when shortest stream ends
                    '-map', '0:v:0',          // Map video from first input
                    '-map', '1:a:0',          // Map audio from second input
                    '-movflags', '+faststart' // Enable streaming
                ])
                .output(outputPath)
                .on('end', () => {
                    console.log('   ✅ Audio merged with video');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('   ❌ Video-audio merge failed:', err);
                    reject(err);
                })
                .run();
        });

        return true;
    } catch (error) {
        console.error('Video-audio merge failed:', error);
        return false;
    }
}

/**
 * Get list of featured destinations for video generation
 */
export function getVideoDestinations(): string[] {
    return [
        "Kyoto, Japan",
        "Santorini, Greece",
        "Machu Picchu, Peru",
        "Paris, France",
        "Bali, Indonesia",
        "Cinque Terre, Italy",
        "Banff, Canada",
        "Northern Lights, Iceland",
        "Chefchaouen, Morocco",
        "Hallstatt, Austria",
        "Dubrovnik, Croatia",
        "Petra, Jordan",
        "Cappadocia, Turkey",
        "Plitvice Lakes, Croatia",
        "Queenstown, New Zealand",
        "Swiss Alps, Switzerland",
        "Patagonia, Argentina",
        "Norwegian Fjords, Norway",
        "Scottish Highlands, UK",
        "SpaceX Starbase, Boca Chica" // Tech/travel unique spot
    ];
}

/**
 * Preview video generation info without actually generating
 */
export async function previewVideoSlideshow(destination: string): Promise<{
    destination: string;
    estimatedDuration: number;
    outputFormat: string;
    resolution: string;
}> {
    return {
        destination,
        estimatedDuration: DEFAULT_VIDEO_DURATION,
        outputFormat: 'MP4',
        resolution: `${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT} (vertical)`
    };
}

/**
 * List all generated videos
 */
export function listGeneratedVideos(): { filename: string; path: string; size: number; createdAt: Date }[] {
    if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
        return [];
    }

    const files = fs.readdirSync(VIDEO_OUTPUT_DIR);

    return files
        .filter(f => f.endsWith('.mp4'))
        .map(filename => {
            const filePath = path.join(VIDEO_OUTPUT_DIR, filename);
            const stats = fs.statSync(filePath);
            return {
                filename,
                path: filePath,
                size: stats.size,
                createdAt: stats.birthtime
            };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
