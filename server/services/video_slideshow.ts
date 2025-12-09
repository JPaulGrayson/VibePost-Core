import puppeteer, { Browser, Page } from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import path from 'path';
import fs from 'fs';
import { storage } from '../storage';

// Configuration
const TURAI_BASE_URL = process.env.TURAI_BASE_URL || 'http://localhost:5002';
const TURAI_API_URL = process.env.TURAI_API_URL || 'http://localhost:5002';
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

        // Step 2: Wait for narrations to be ready
        console.log('⏳ Waiting for narrations to generate...');
        const slideshowReady = await waitForSlideshowReady(shareCode, 120000); // 2 min timeout

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

        // Wait for the "Begin Journey" or similar button
        // Try multiple selectors that might match the CTA button
        console.log('   🔍 Looking for start button...');

        try {
            // First try: any button with text content
            await page.waitForSelector('button', { timeout: 20000 });
            console.log('   ✅ Found button element');
        } catch (e) {
            // Log page content for debugging
            const pageContent = await page.content();
            console.log('   ⚠️ Button not found. Page contains:', pageContent.slice(0, 500));
            throw new Error('Could not find start button on slideshow page');
        }

        // Start recording
        console.log('🔴 Recording started...');
        await recorder.start(videoPath);

        // Click the button to start the slideshow
        try {
            await page.click('button');
            console.log('   ✅ Clicked start button');
        } catch (e) {
            console.log('   ⚠️ Failed to click button, continuing anyway...');
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
 */
async function waitForSlideshowReady(shareCode: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`${TURAI_API_URL}/api/slideshows/${shareCode}`);

            if (response.ok) {
                const responseData = await response.json();
                // Handle nested response: { success: true, data: { narrations: [...] } }
                const slideshowData = responseData.data || responseData;

                if (slideshowData.narrations && slideshowData.narrations.length > 0) {
                    console.log(`   ✅ ${slideshowData.narrations.length} narrations ready`);
                    return true;
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

    return false;
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
