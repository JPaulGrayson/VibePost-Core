/**
 * Reply Video Generator
 * Creates short (15-30 sec) teaser videos for travel replies
 * Based on multiple interests/themes detected from the user's tweet
 */

import ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import { path as ffprobePath } from '@ffprobe-installer/ffprobe';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { GoogleGenAI } from "@google/genai";

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

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
 * Fetch image for a specific interest using Pollinations AI
 */
async function fetchInterestImage(interest: TravelInterest, location: string): Promise<string | null> {
    try {
        // Use Pollinations AI for reliable AI-generated travel images
        const prompt = encodeURIComponent(`${location} ${interest.theme}, travel photography, scenic destination, high quality`);
        const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=1080&nologo=true`;

        const localPath = path.join(TEMP_DIR, `interest_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);

        console.log(`      Fetching ${interest.emoji} ${interest.theme}...`);

        // Download the image
        await downloadFile(imageUrl, localPath);

        // Verify file was downloaded
        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 10000) {
            console.log(`      ✓ Got ${interest.theme} image`);
            return localPath;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching image for ${interest.theme}:`, error);
        return null;
    }
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
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
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
 * Generate narration text for the reply video
 */
function generateNarrationText(location: string, interests: TravelInterest[]): string {
    const interestList = interests.map(i => i.theme.toLowerCase()).join(', ');
    return `Discover ${location}! From ${interestList} and so much more. Get your personalized travel guide at turai.org!`;
}

/**
 * Fetch audio narration from Turai TTS
 */
async function fetchNarration(text: string, outputPath: string): Promise<void> {
    const TURAI_API = process.env.TURAI_API_URL || "https://turai.org";

    try {
        console.log(`      Generating narration...`);
        const response = await fetch(`${TURAI_API}/api/tts/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: 'alloy' })
        });

        if (!response.ok) {
            throw new Error(`TTS API returned ${response.status}`);
        }

        const data = await response.json() as { audioUrl?: string };
        if (!data.audioUrl) throw new Error('No audio URL in response');

        // Download the audio file
        const audioUrl = data.audioUrl.startsWith('http') ? data.audioUrl : `${TURAI_API}${data.audioUrl}`;
        await downloadFile(audioUrl, outputPath);
        console.log(`      ✓ Narration generated`);
    } catch (error) {
        console.error(`      ⚠️ Narration failed:`, error);
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
    return new Promise((resolve, reject) => {
        // Each image shows for 5 seconds
        const durationPerImage = 5;
        const totalDuration = images.length * durationPerImage;

        console.log(`      Building ${totalDuration}s video from ${images.length} images...`);

        // Create a simpler concat approach - generate video for each image then concat
        const tempVideos: string[] = [];
        const tasks: Promise<void>[] = [];

        images.forEach((img, idx) => {
            const tempPath = path.join(TEMP_DIR, `temp_${Date.now()}_${idx}.mp4`);
            tempVideos.push(tempPath);

            tasks.push(new Promise<void>((res, rej) => {
                ffmpeg(img.path)
                    .loop(durationPerImage)
                    .inputOptions(['-framerate', '30'])
                    .videoFilters([
                        'scale=1200:1200:force_original_aspect_ratio=increase',
                        'crop=1080:1080',
                        `zoompan=z='min(zoom+0.001,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${durationPerImage * 30}:s=1080x1080:fps=30`
                    ])
                    .outputOptions([
                        '-c:v', 'libx264',
                        '-t', String(durationPerImage),
                        '-pix_fmt', 'yuv420p',
                        '-r', '30'
                    ])
                    .output(tempPath)
                    .on('end', () => res())
                    .on('error', (err) => rej(err))
                    .run();
            }));
        });

        // Wait for all temp videos to be created
        Promise.all(tasks)
            .then(() => {
                // Create concat file
                const concatFile = path.join(TEMP_DIR, `concat_${Date.now()}.txt`);
                const concatContent = tempVideos.map(v => `file '${v}'`).join('\n');
                fs.writeFileSync(concatFile, concatContent);

                // Concat videos
                const cmd = ffmpeg()
                    .input(concatFile)
                    .inputOptions(['-f', 'concat', '-safe', '0']);

                // Add audio if available
                if (audioPath && fs.existsSync(audioPath)) {
                    cmd.input(audioPath);
                    cmd.outputOptions([
                        '-c:v', 'libx264',
                        '-c:a', 'aac',
                        '-b:a', '128k',
                        '-shortest',
                        '-pix_fmt', 'yuv420p'
                    ]);
                } else {
                    cmd.outputOptions([
                        '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p'
                    ]);
                }

                cmd.output(outputPath)
                    .on('end', () => {
                        // Cleanup temp files
                        tempVideos.forEach(v => { try { fs.unlinkSync(v); } catch (e) { } });
                        try { fs.unlinkSync(concatFile); } catch (e) { }
                        console.log(`✅ Teaser video created: ${outputPath}`);
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('FFmpeg concat error:', err);
                        reject(err);
                    })
                    .run();
            })
            .catch(reject);
    });
}



/**
 * Generate a teaser video reply for a travel tweet
 */
export async function generateReplyVideo(
    tweetText: string,
    location: string
): Promise<ReplyVideoResult> {
    console.log(`🎬 Generating reply video for ${location}...`);

    try {
        // 1. Extract travel interests from tweet
        console.log("   📊 Analyzing travel interests...");
        const interests = await extractTravelInterests(tweetText, location);
        console.log(`   Found ${interests.length} interests:`, interests.map(i => i.theme));

        // 2. Fetch images for each interest
        console.log("   📷 Fetching images...");
        const imageResults: { path: string; interest: TravelInterest }[] = [];

        for (const interest of interests) {
            const imagePath = await fetchInterestImage(interest, location);
            if (imagePath && fs.existsSync(imagePath)) {
                imageResults.push({ path: imagePath, interest });
            }
        }

        if (imageResults.length < 2) {
            return {
                success: false,
                interests,
                error: "Not enough images fetched"
            };
        }

        // 3. Generate audio narration
        let audioPath: string | undefined;
        try {
            console.log(`   🔊 Generating narration...`);
            const narrationText = generateNarrationText(location, interests);
            audioPath = path.join(TEMP_DIR, `narration_${Date.now()}.mp3`);
            await fetchNarration(narrationText, audioPath);
        } catch (e) {
            console.log(`   ⚠️ Narration skipped (continuing without audio)`);
            audioPath = undefined;
        }

        // 4. Create video
        console.log(`   🎥 Creating video with ${imageResults.length} images...`);
        const videoFilename = `reply_${Date.now()}.mp4`;
        const videoPath = path.join(TEMP_DIR, videoFilename);

        await createTeaserVideo(imageResults, location, videoPath, audioPath);

        // 5. Clean up temp files
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
