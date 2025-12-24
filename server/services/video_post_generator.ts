/**
 * Video Post Generator
 * Creates video slideshows from Turai tours using FFmpeg (no screen recording)
 * Used for both manual posts and scheduled daily posts
 */

import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { GoogleGenAI } from "@google/genai";

// Safely resolve FFmpeg paths with fallbacks
let ffmpegPath = '';
let ffprobePath = '';

try {
    // 1. Priority: Local static binary (for Replit deployment)
    const localFfmpeg = path.join(process.cwd(), 'repl_bin', 'ffmpeg');
    const localFfprobe = path.join(process.cwd(), 'repl_bin', 'ffprobe');

    if (fs.existsSync(localFfmpeg)) {
        console.log('🚀 Using local static FFmpeg binary (Replit Mode)');
        ffmpegPath = localFfmpeg;
        ffprobePath = localFfprobe;
    }
    // 2. System FFmpeg (Homebrew on Mac)
    else if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
        ffmpegPath = '/opt/homebrew/bin/ffmpeg';
        ffprobePath = '/opt/homebrew/bin/ffprobe';
    }
    // 3. Last Resort: System PATH
    else {
        ffmpegPath = 'ffmpeg';
        ffprobePath = 'ffprobe';
    }

    // Set paths
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
} catch (err) {
    console.error('⚠️ FFmpeg initialization error:', err);
    // Silent fallback to PATH
    ffmpeg.setFfmpegPath('ffmpeg');
    ffmpeg.setFfprobePath('ffprobe');
}

const TURAI_API_URL = process.env.TURAI_API_URL || "http://localhost:5002";
const TURAI_PRODUCTION_URL = "https://turai.org";
const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'video_posts');
const TEMP_DIR = path.join(VIDEO_OUTPUT_DIR, 'temp');

// Ensure directories exist
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
    fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: apiKey || "dummy" });

// ==================== INTERFACES ====================

export interface VideoPostStop {
    index: number;             // Stop index (0-based)
    name: string;
    description: string;
    imageUrl: string;          // Primary image
    imageUrls: string[];       // All available images for this stop
    audioUrl?: string;
    audioDuration?: number;    // Duration of audio in seconds
    narrationText?: string;
}

export interface VideoPostPreview {
    success: boolean;
    shareCode?: string;
    destination: string;
    topic?: string;
    estimatedDuration: number;
    stops: VideoPostStop[];
    introImageUrl?: string;
    error?: string;
}

export interface VideoPostResult {
    success: boolean;
    videoPath?: string;
    destination?: string;
    duration?: number;
    shareCode?: string;
    error?: string;
}

export interface VideoPostOptions {
    destination: string;
    topic?: string;          // Custom focus/keywords for the tour
    maxStops?: number;       // Number of stops (default 5)
    secondsPerStop?: number; // Duration per stop (default 12s)
    theme?: string;          // Tour theme (hidden_gems, landmarks, etc.)
}

// ==================== TOUR GENERATION ====================

/**
 * Generate a tour via Turai API
 */
async function generateTour(options: VideoPostOptions): Promise<{ success: boolean; shareCode?: string; error?: string }> {
    const { destination, topic, theme = 'hidden_gems' } = options;

    try {
        console.log(`🗺️ Generating tour for: ${destination}${topic ? ` (topic: ${topic})` : ''}`);

        const response = await fetch(`${TURAI_API_URL}/api/tour-maker/wizard/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                location: destination,
                theme: theme,
                focus: topic,
                email: 'vibepost@turai.app'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Turai API error: ${response.status} - ${errorText}` };
        }

        const data = await response.json();
        const shareCode = data.data?.shareCode || data.shareCode;

        if (shareCode) {
            console.log(`✅ Tour created: ${shareCode}`);
            return { success: true, shareCode };
        }

        return { success: false, error: 'No share code returned' };
    } catch (error) {
        console.error('Tour generation failed:', error);
        return { success: false, error: String(error) };
    }
}

/**
 * Wait for tour narrations to be ready
 */
async function waitForNarrations(shareCode: string, minNarrations: number = 3, timeoutMs: number = 180000): Promise<any | null> {
    const startTime = Date.now();
    const pollInterval = 5000;
    let lastCount = 0;
    let stableCount = 0;

    console.log(`⏳ Waiting for ${minNarrations}+ narrations...`);

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`${TURAI_API_URL}/api/slideshows/${shareCode}`);

            if (response.ok) {
                const data = await response.json();
                const slideshowData = data.data || data;
                const narrations = slideshowData.narrations || [];

                if (narrations.length >= minNarrations) {
                    console.log(`   ✅ ${narrations.length} narrations ready`);
                    return slideshowData;
                }

                if (narrations.length === lastCount && narrations.length > 0) {
                    stableCount++;
                    if (stableCount >= 3) {
                        console.log(`   ⚠️ ${narrations.length} narrations (stable)`);
                        return slideshowData;
                    }
                } else {
                    stableCount = 0;
                }

                lastCount = narrations.length;
                console.log(`   ⏳ ${narrations.length}/${minNarrations} narrations...`);
            }
        } catch (e) {
            // Continue waiting
        }

        await new Promise(r => setTimeout(r, pollInterval));
    }

    return null;
}

// ==================== PREVIEW ====================

/**
 * Generate a preview of the video post (without creating video)
 */
export async function previewVideoPost(options: VideoPostOptions): Promise<VideoPostPreview> {
    const { destination, topic, maxStops = 5, secondsPerStop = 12 } = options;

    console.log(`👁️ Creating preview for: ${destination}${topic ? ` (${topic})` : ''}`);

    const result: VideoPostPreview = {
        success: false,
        destination,
        topic,
        estimatedDuration: 0,
        stops: []
    };

    try {
        // Step 1: Generate tour
        const tourResult = await generateTour(options);
        if (!tourResult.success || !tourResult.shareCode) {
            result.error = tourResult.error || 'Failed to generate tour';
            return result;
        }
        result.shareCode = tourResult.shareCode;

        // Step 2: Wait for narrations - wait for ALL stops to be ready
        const slideshowData = await waitForNarrations(tourResult.shareCode, maxStops);
        if (!slideshowData) {
            result.error = 'Narrations did not generate in time';
            return result;
        }

        const tour = slideshowData.tour;
        const narrations = slideshowData.narrations || [];
        const pois = (tour?.pointsOfInterest || []).slice(0, maxStops);

        // Set intro image
        if (tour?.aiImageUrl) {
            result.introImageUrl = makeAbsoluteUrl(tour.aiImageUrl);
        }

        // Build stops
        for (let i = 0; i < pois.length; i++) {
            const poi = pois[i];
            const narration = narrations[i];

            // Debug: log what photo data we have
            console.log(`📷 Stop ${i + 1} (${poi.name}) photo sources:`);
            console.log(`   - narration.photoUrls: ${narration?.photoUrls?.length || 0}`);
            console.log(`   - poi.photoUrls: ${poi.photoUrls?.length || 0}`);
            console.log(`   - poi.photos: ${poi.photos?.length || 0}`);
            console.log(`   - poi.heroImageUrl: ${poi.heroImageUrl ? 'yes' : 'no'}`);
            console.log(`   - narration.thumbnailUrl: ${narration?.thumbnailUrl ? 'yes' : 'no'}`);

            // Collect ALL available image URLs for this stop
            const allImageUrls: string[] = [];

            // 1. Narration photoUrls array (most common in Turai slideshows)
            if (narration?.photoUrls?.length > 0) {
                narration.photoUrls.forEach((url: string) => allImageUrls.push(makeAbsoluteUrl(url)));
            }
            // 2. POI photo URLs 
            if (poi.photoUrls?.length > 0) {
                poi.photoUrls.forEach((url: string) => {
                    const absUrl = makeAbsoluteUrl(url);
                    if (!allImageUrls.includes(absUrl)) allImageUrls.push(absUrl);
                });
            }
            // 3. POI photos array
            if (poi.photos?.length > 0) {
                poi.photos.forEach((p: any) => {
                    const url = p.url || p;
                    const absUrl = makeAbsoluteUrl(url);
                    if (!allImageUrls.includes(absUrl)) allImageUrls.push(absUrl);
                });
            }
            // 4. POI hero image
            if (poi.heroImageUrl) {
                const absUrl = makeAbsoluteUrl(poi.heroImageUrl);
                if (!allImageUrls.includes(absUrl)) allImageUrls.push(absUrl);
            }
            // 5. Narration thumbnail
            if (narration?.thumbnailUrl) {
                const absUrl = makeAbsoluteUrl(narration.thumbnailUrl);
                if (!allImageUrls.includes(absUrl)) allImageUrls.push(absUrl);
            }

            const stop: VideoPostStop = {
                index: i,
                name: poi.name || `Stop ${i + 1}`,
                description: narration?.text || poi.description || '',
                imageUrl: allImageUrls[0] || '',
                imageUrls: allImageUrls,
                audioUrl: narration?.audioUrl ? makeAbsoluteUrl(narration.audioUrl) : undefined,
                narrationText: narration?.text
            };

            result.stops.push(stop);
        }

        result.estimatedDuration = result.stops.length * secondsPerStop;
        result.success = result.stops.length > 0;

        console.log(`✅ Preview ready: ${result.stops.length} stops, ~${result.estimatedDuration}s`);
        return result;

    } catch (error) {
        console.error('Preview generation failed:', error);
        result.error = String(error);
        return result;
    }
}

/**
 * Refresh preview data from an existing share code
 * Used to poll for updated narration data as stops complete
 */
export async function refreshPreviewData(shareCode: string, maxStops: number = 5): Promise<VideoPostPreview> {
    const result: VideoPostPreview = {
        success: false,
        destination: '',
        estimatedDuration: 0,
        stops: [],
        shareCode
    };

    // Helper function for fetch with timeout
    async function fetchWithTimeout(url: string, timeoutMs: number = 15000): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timed out after ${timeoutMs}ms`);
            }
            throw error;
        }
    }

    try {
        console.log(`🔄 Refreshing preview data for: ${shareCode}`);

        // Try local slideshow endpoint first (with timeout)
        let response: Response;
        try {
            response = await fetchWithTimeout(`${TURAI_API_URL}/api/slideshows/${shareCode}`);
        } catch (e) {
            console.log(`   Local slideshow request failed: ${e}`);
            response = new Response(null, { status: 500 });
        }

        // If slideshow not found locally, try the local export endpoint
        if (!response.ok) {
            console.log(`   Local slideshow not found, trying local export endpoint...`);
            try {
                response = await fetchWithTimeout(`${TURAI_API_URL}/api/tours/${shareCode}/export`);
            } catch (e) {
                console.log(`   Local export request failed: ${e}`);
                response = new Response(null, { status: 500 });
            }
        }

        // If still not found, try production Turai (turai.org)
        if (!response.ok) {
            console.log(`   Not found locally, trying production Turai...`);
            try {
                response = await fetchWithTimeout(`${TURAI_PRODUCTION_URL}/api/slideshows/${shareCode}`);
            } catch (e) {
                console.log(`   Production request failed: ${e}`);
                result.error = `Tour not found or request timed out. Check if the share code is valid.`;
                return result;
            }
        }

        if (!response.ok) {
            result.error = `Tour not found (tried local and production)`;
            return result;
        }

        console.log(`   Parsing slideshow response...`);
        const data = await response.json();
        const slideshowData = data.data || data;
        const tour = slideshowData.tour;
        const narrations = slideshowData.narrations || [];
        const pois = (tour?.pointsOfInterest || []).slice(0, maxStops);

        console.log(`   Tour: ${tour?.name || tour?.destination || 'unknown'}, POIs: ${pois.length}, Narrations: ${narrations.length}`);

        result.destination = tour?.destination || tour?.name || '';

        // Set intro image
        if (tour?.aiImageUrl) {
            result.introImageUrl = makeAbsoluteUrl(tour.aiImageUrl);
        }

        // Build stops with current narration data
        const MAX_IMAGES_PER_STOP = 5; // Limit memory usage
        for (let i = 0; i < pois.length; i++) {
            const poi = pois[i];
            const narration = narrations[i];

            const allImageUrls: string[] = [];

            // Collect from all sources (limited to MAX_IMAGES_PER_STOP)
            if (narration?.photoUrls?.length > 0) {
                narration.photoUrls.slice(0, MAX_IMAGES_PER_STOP).forEach((url: string) => allImageUrls.push(makeAbsoluteUrl(url)));
            }
            if (allImageUrls.length < MAX_IMAGES_PER_STOP && poi.photoUrls?.length > 0) {
                poi.photoUrls.slice(0, MAX_IMAGES_PER_STOP - allImageUrls.length).forEach((url: string) => {
                    const absUrl = makeAbsoluteUrl(url);
                    if (!allImageUrls.includes(absUrl)) allImageUrls.push(absUrl);
                });
            }
            if (poi.heroImageUrl && allImageUrls.length < MAX_IMAGES_PER_STOP) {
                const absUrl = makeAbsoluteUrl(poi.heroImageUrl);
                if (!allImageUrls.includes(absUrl)) allImageUrls.unshift(absUrl);
            }
            if (narration?.thumbnailUrl && allImageUrls.length < MAX_IMAGES_PER_STOP) {
                const absUrl = makeAbsoluteUrl(narration.thumbnailUrl);
                if (!allImageUrls.includes(absUrl)) allImageUrls.unshift(absUrl);
            }

            result.stops.push({
                index: i,
                name: poi.name || `Stop ${i + 1}`,
                description: narration?.text || poi.description || '',
                imageUrl: allImageUrls[0] || '',
                imageUrls: allImageUrls.slice(0, MAX_IMAGES_PER_STOP),
                audioUrl: narration?.audioUrl ? makeAbsoluteUrl(narration.audioUrl) : undefined,
                narrationText: narration?.text
            });
        }

        result.estimatedDuration = result.stops.length * 12;
        result.success = result.stops.length > 0;

        const readyStops = result.stops.filter(s => s.audioUrl && s.imageUrls.length > 0).length;
        console.log(`✅ Refresh complete: ${readyStops}/${result.stops.length} stops ready`);

        return result;

    } catch (error) {
        console.error('Refresh preview failed:', error);
        result.error = String(error);
        return result;
    }
}

// ==================== VIDEO GENERATION ====================

/**
 * Generate video from a preview (or options)
 */
export async function generateVideoPost(
    options: VideoPostOptions,
    existingPreview?: VideoPostPreview
): Promise<VideoPostResult> {
    const { destination, topic, maxStops = 5, secondsPerStop = 12 } = options;

    console.log(`🎬 Generating video for: ${destination}`);

    try {
        // Get preview if not provided
        const preview = existingPreview || await previewVideoPost(options);

        if (!preview.success || preview.stops.length === 0) {
            return { success: false, error: preview.error || 'No stops available' };
        }

        // Structure to hold images and audio per stop
        interface StopAssets {
            name: string;
            imagePaths: string[];
            audioPath: string | null;
            audioDuration: number;
        }
        const stopAssets: StopAssets[] = [];

        // Download all assets for each stop
        console.log('📷 Downloading assets...');

        for (let i = 0; i < preview.stops.length; i++) {
            const stop = preview.stops[i];
            const assets: StopAssets = {
                name: stop.name,
                imagePaths: [],
                audioPath: null,
                audioDuration: 0
            };

            // Download multiple images for this stop
            const imageUrls = stop.imageUrls?.length > 0 ? stop.imageUrls : [stop.imageUrl];
            const maxImagesPerStop = 5; // Limit to avoid too many downloads

            for (let j = 0; j < Math.min(imageUrls.length, maxImagesPerStop); j++) {
                const url = imageUrls[j];
                if (!url) continue;

                const localPath = path.join(TEMP_DIR, `stop_${i}_img_${j}_${Date.now()}.jpg`);

                try {
                    await downloadFile(url, localPath);
                    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 1000) {
                        assets.imagePaths.push(localPath);
                    }
                } catch (e) {
                    // Silently continue
                }
            }

            // If no images from Turai, generate via Pollinations
            if (assets.imagePaths.length === 0) {
                console.log(`   ⚠️ No Turai images for ${stop.name}, using Pollinations...`);
                const localPath = path.join(TEMP_DIR, `stop_${i}_gen_${Date.now()}.jpg`);
                const prompt = encodeURIComponent(
                    `Beautiful travel photo of ${stop.name} in ${destination}, professional photography, vibrant colors, no text`
                );
                const pollinationsUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=1920&nologo=true&model=flux`;

                try {
                    await downloadFile(pollinationsUrl, localPath);
                    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 1000) {
                        assets.imagePaths.push(localPath);
                    }
                } catch (e) {
                    console.log(`   ❌ Pollinations failed for ${stop.name}`);
                }
            }

            // Download audio and get ACTUAL duration
            if (stop.audioUrl) {
                const audioPath = path.join(TEMP_DIR, `audio_${i}_${Date.now()}.mp3`);

                try {
                    // Handle data URLs (base64)
                    if (stop.audioUrl.startsWith('data:audio/')) {
                        const matches = stop.audioUrl.match(/^data:audio\/[^;]+;base64,(.+)$/);
                        if (matches && matches[1]) {
                            const buffer = Buffer.from(matches[1], 'base64');
                            fs.writeFileSync(audioPath, buffer);
                            if (buffer.length > 1000) {
                                assets.audioPath = audioPath;
                                // Get ACTUAL audio duration
                                assets.audioDuration = await getAudioDuration(audioPath);
                            }
                        }
                    } else {
                        await downloadFile(stop.audioUrl, audioPath);
                        if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000) {
                            assets.audioPath = audioPath;
                            // Get ACTUAL audio duration
                            assets.audioDuration = await getAudioDuration(audioPath);
                        }
                    }
                } catch (e) {
                    console.log(`   ⚠️ Audio failed for ${stop.name}`);
                }
            }

            // Default duration if no audio
            if (assets.audioDuration === 0) {
                assets.audioDuration = secondsPerStop;
            }

            console.log(`   ✓ ${stop.name}: ${assets.imagePaths.length} images, ${assets.audioDuration}s (actual audio)`);
            stopAssets.push(assets);
        }

        // Validate we have content
        const totalImages = stopAssets.reduce((sum, s) => sum + s.imagePaths.length, 0);
        if (totalImages === 0) {
            return { success: false, error: 'Failed to download any images' };
        }

        // Create video segments for each stop
        console.log('🎥 Creating video segments...');
        const segmentVideos: string[] = [];
        const SECONDS_PER_IMAGE = 5; // Each image shows for 5 seconds

        for (let i = 0; i < stopAssets.length; i++) {
            const assets = stopAssets[i];
            if (assets.imagePaths.length === 0) continue;

            const segmentPath = path.join(TEMP_DIR, `segment_${i}_${Date.now()}.mp4`);

            // Calculate how many "image slots" needed for this audio
            const totalDuration = assets.audioDuration;
            const neededSlots = Math.ceil(totalDuration / SECONDS_PER_IMAGE);

            // Create image list cycling through available images
            const imageList: { path: string; duration: number }[] = [];
            for (let j = 0; j < neededSlots; j++) {
                const imgIdx = j % assets.imagePaths.length;
                const duration = Math.min(SECONDS_PER_IMAGE, totalDuration - (j * SECONDS_PER_IMAGE));
                if (duration > 0) {
                    imageList.push({ path: assets.imagePaths[imgIdx], duration });
                }
            }

            // Create video segment with audio
            await createSegmentWithAudio(imageList, assets.audioPath, segmentPath, totalDuration);
            segmentVideos.push(segmentPath);
            console.log(`   ✓ Segment ${i + 1}: ${imageList.length} images over ${totalDuration}s`);
        }

        if (segmentVideos.length === 0) {
            return { success: false, error: 'Failed to create any video segments' };
        }

        // Concatenate all segments
        console.log('🔗 Concatenating segments...');
        const timestamp = Date.now();
        const safeDestination = destination.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const videoFilename = `video_post_${safeDestination}_${timestamp}.mp4`;
        const videoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);

        await concatenateVideos(segmentVideos, videoPath);

        // Cleanup temp files
        stopAssets.forEach(a => {
            a.imagePaths.forEach(p => { try { fs.unlinkSync(p); } catch (e) { } });
            if (a.audioPath) { try { fs.unlinkSync(a.audioPath); } catch (e) { } }
        });
        segmentVideos.forEach(p => { try { fs.unlinkSync(p); } catch (e) { } });

        const stats = fs.statSync(videoPath);
        const totalDuration = stopAssets.reduce((sum, a) => sum + a.audioDuration, 0);
        console.log(`✅ Video created: ${videoPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB, ${totalDuration}s)`);

        return {
            success: true,
            videoPath,
            destination,
            duration: totalDuration,
            shareCode: preview.shareCode
        };

    } catch (error) {
        console.error('Video generation failed:', error);
        return { success: false, error: String(error) };
    }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get duration of audio file in seconds using ffprobe
 */
async function getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
            if (err) {
                console.error('ffprobe error:', err);
                resolve(12); // Default to 12 seconds on error
                return;
            }
            const duration = metadata?.format?.duration;
            if (typeof duration === 'number' && duration > 0) {
                resolve(Math.ceil(duration));
            } else {
                resolve(12); // Default to 12 seconds
            }
        });
    });
}

/**
 * Create a video segment from images that matches audio duration
 */
async function createSegmentWithAudio(
    images: { path: string; duration: number }[],
    audioPath: string | null,
    outputPath: string,
    totalDuration: number
): Promise<void> {
    return new Promise((resolve, reject) => {
        // First create video from images
        const tempVideoPath = outputPath.replace('.mp4', '_temp.mp4');
        const tempVideos: string[] = [];
        const tasks: Promise<void>[] = [];

        // Create individual image clips
        images.forEach((img, idx) => {
            const clipPath = path.join(TEMP_DIR, `clip_${Date.now()}_${idx}.mp4`);
            tempVideos.push(clipPath);

            tasks.push(new Promise<void>((res, rej) => {
                ffmpeg(img.path)
                    .inputOptions(['-loop', '1'])
                    .videoFilters([
                        'scale=1080:1920:force_original_aspect_ratio=increase',
                        'crop=1080:1920',
                        `fade=t=in:st=0:d=0.3,fade=t=out:st=${img.duration - 0.3}:d=0.3`
                    ])
                    .outputOptions([
                        '-c:v', 'libx264',
                        '-preset', 'fast',
                        '-crf', '20',
                        '-t', String(img.duration),
                        '-r', '30',
                        '-pix_fmt', 'yuv420p',
                        '-profile:v', 'main',
                        '-level', '4.0'
                    ])
                    .output(clipPath)
                    .on('end', () => res())
                    .on('error', (err) => rej(err))
                    .run();
            }));
        });

        Promise.all(tasks)
            .then(() => {
                // Concatenate image clips
                const concatFile = path.join(TEMP_DIR, `clips_${Date.now()}.txt`);
                fs.writeFileSync(concatFile, tempVideos.map(v => `file '${v}'`).join('\n'));

                const cmd = ffmpeg()
                    .input(concatFile)
                    .inputOptions(['-f', 'concat', '-safe', '0']);

                // Add audio if available
                if (audioPath && fs.existsSync(audioPath)) {
                    cmd.input(audioPath);
                    cmd.outputOptions([
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        '-b:a', '128k',
                        '-map', '0:v',
                        '-map', '1:a',
                        '-shortest',
                        '-movflags', '+faststart'
                    ]);
                } else {
                    cmd.outputOptions([
                        '-c:v', 'copy',
                        '-movflags', '+faststart'
                    ]);
                }

                cmd.output(outputPath)
                    .on('end', () => {
                        // Cleanup temp clips
                        tempVideos.forEach(v => { try { fs.unlinkSync(v); } catch (e) { } });
                        try { fs.unlinkSync(concatFile); } catch (e) { }
                        resolve();
                    })
                    .on('error', (err) => {
                        tempVideos.forEach(v => { try { fs.unlinkSync(v); } catch (e) { } });
                        try { fs.unlinkSync(concatFile); } catch (e) { }
                        reject(err);
                    })
                    .run();
            })
            .catch(reject);
    });
}

/**
 * Concatenate multiple video segments into one
 */
async function concatenateVideos(videoPaths: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const concatFile = path.join(TEMP_DIR, `final_concat_${Date.now()}.txt`);
        fs.writeFileSync(concatFile, videoPaths.map(v => `file '${v}'`).join('\n'));

        ffmpeg()
            .input(concatFile)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
                '-c', 'copy',
                '-movflags', '+faststart'
            ])
            .output(outputPath)
            .on('end', () => {
                try { fs.unlinkSync(concatFile); } catch (e) { }
                resolve();
            })
            .on('error', (err) => {
                try { fs.unlinkSync(concatFile); } catch (e) { }
                reject(err);
            })
            .run();
    });
}

function makeAbsoluteUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return `${TURAI_API_URL}${url}`;
    return url;
}

async function downloadFile(url: string, localPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(localPath);

        const request = protocol.get(url, { timeout: 30000 }, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303) {
                let redirectUrl = response.headers.location;
                if (redirectUrl) {
                    if (!redirectUrl.startsWith('http')) {
                        const parsedUrl = new URL(url);
                        redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
                    }
                    file.close();
                    fs.unlinkSync(localPath);
                    downloadFile(redirectUrl, localPath).then(resolve).catch(reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                file.close();
                try { fs.unlinkSync(localPath); } catch (e) { }
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
            try { fs.unlinkSync(localPath); } catch (e) { }
            reject(err);
        });

        request.on('timeout', () => {
            request.destroy();
            file.close();
            try { fs.unlinkSync(localPath); } catch (e) { }
            reject(new Error('Download timeout'));
        });
    });
}

async function downloadAndMergeAudio(stops: VideoPostStop[]): Promise<string | null> {
    const audioFiles: string[] = [];

    for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (!stop.audioUrl) continue;

        const localPath = path.join(TEMP_DIR, `audio_${Date.now()}_${i}.mp3`);

        try {
            // Handle data URLs (base64)
            if (stop.audioUrl.startsWith('data:audio/')) {
                const matches = stop.audioUrl.match(/^data:audio\/[^;]+;base64,(.+)$/);
                if (matches && matches[1]) {
                    const buffer = Buffer.from(matches[1], 'base64');
                    fs.writeFileSync(localPath, buffer);
                    if (buffer.length > 1000) {
                        audioFiles.push(localPath);
                        console.log(`   ✓ Decoded audio for ${stop.name}`);
                    }
                }
            }
            // Handle HTTP URLs
            else {
                await downloadFile(stop.audioUrl, localPath);
                if (fs.existsSync(localPath) && fs.statSync(localPath).size > 1000) {
                    audioFiles.push(localPath);
                }
            }
        } catch (e) {
            console.log(`   ⚠️ Failed to get audio for ${stop.name}`);
        }
    }

    if (audioFiles.length === 0) {
        return null;
    }

    // Concatenate audio files
    const mergedPath = path.join(TEMP_DIR, `merged_audio_${Date.now()}.mp3`);
    const concatListPath = path.join(TEMP_DIR, `audio_concat_${Date.now()}.txt`);

    fs.writeFileSync(concatListPath, audioFiles.map(f => `file '${f}'`).join('\n'));

    try {
        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions(['-c', 'copy'])
                .output(mergedPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .run();
        });

        // Cleanup individual files
        audioFiles.forEach(f => { try { fs.unlinkSync(f); } catch (e) { } });
        try { fs.unlinkSync(concatListPath); } catch (e) { }

        console.log(`   ✅ Audio merged (${audioFiles.length} files)`);
        return mergedPath;
    } catch (e) {
        console.log('   ⚠️ Audio merge failed');
        audioFiles.forEach(f => { try { fs.unlinkSync(f); } catch (e) { } });
        return null;
    }
}

async function createVideoFromImages(
    imagePaths: string[],
    outputPath: string,
    secondsPerImage: number,
    audioPath: string | null
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tempVideos: string[] = [];
        const tasks: Promise<void>[] = [];

        // Create video segment for each image
        imagePaths.forEach((imgPath, idx) => {
            const tempPath = path.join(TEMP_DIR, `segment_${Date.now()}_${idx}.mp4`);
            tempVideos.push(tempPath);

            tasks.push(new Promise<void>((res, rej) => {
                ffmpeg(imgPath)
                    .inputOptions(['-loop', '1'])
                    .videoFilters([
                        'scale=1080:1920:force_original_aspect_ratio=increase',
                        'crop=1080:1920',
                        `fade=t=in:st=0:d=0.5,fade=t=out:st=${secondsPerImage - 0.5}:d=0.5`
                    ])
                    .outputOptions([
                        '-c:v', 'libx264',
                        '-preset', 'slow',
                        '-crf', '18',
                        '-t', String(secondsPerImage),
                        '-r', '30',
                        '-pix_fmt', 'yuv420p',
                        '-profile:v', 'main',
                        '-level', '4.0',
                        '-movflags', '+faststart'
                    ])
                    .output(tempPath)
                    .on('end', () => res())
                    .on('error', (err) => rej(err))
                    .run();
            }));
        });

        // Wait for all segments
        Promise.all(tasks)
            .then(() => {
                // Create concat list
                const concatFile = path.join(TEMP_DIR, `concat_${Date.now()}.txt`);
                fs.writeFileSync(concatFile, tempVideos.map(v => `file '${v}'`).join('\n'));

                // Concat with audio
                const cmd = ffmpeg()
                    .input(concatFile)
                    .inputOptions(['-f', 'concat', '-safe', '0']);

                if (audioPath && fs.existsSync(audioPath)) {
                    cmd.input(audioPath);
                    cmd.outputOptions([
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        '-b:a', '192k',
                        '-map', '0:v',
                        '-map', '1:a',
                        '-movflags', '+faststart'
                    ]);
                } else {
                    cmd.outputOptions([
                        '-c:v', 'copy',
                        '-movflags', '+faststart'
                    ]);
                }

                cmd.output(outputPath)
                    .on('end', () => {
                        // Cleanup
                        tempVideos.forEach(v => { try { fs.unlinkSync(v); } catch (e) { } });
                        try { fs.unlinkSync(concatFile); } catch (e) { }
                        resolve();
                    })
                    .on('error', (err) => {
                        tempVideos.forEach(v => { try { fs.unlinkSync(v); } catch (e) { } });
                        try { fs.unlinkSync(concatFile); } catch (e) { }
                        reject(err);
                    })
                    .run();
            })
            .catch(reject);
    });
}

/**
 * Generate caption for the video post
 */
export async function generateVideoCaption(destination: string, topic?: string): Promise<string> {
    try {
        const prompt = `Write a short, engaging Twitter caption for a travel video about ${destination}${topic ? ` focusing on ${topic}` : ''}.

Rules:
- Under 200 characters
- Include 1-2 relevant emojis
- End with "Plan your trip: turai.org"
- Warm and inviting tone

Write ONLY the caption:`;

        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const caption = result.text?.trim() || '';
        if (caption.length > 30 && caption.length <= 280) {
            return caption;
        }
    } catch (e) {
        // Use fallback
    }

    // Fallback caption
    const emoji = topic?.includes('food') ? '🍽️' : topic?.includes('beach') ? '🏖️' : '✨';
    return `Discover ${destination}! ${emoji}\n\n${topic ? `${topic}\n\n` : ''}Plan your trip: turai.org 🗺️`;
}
