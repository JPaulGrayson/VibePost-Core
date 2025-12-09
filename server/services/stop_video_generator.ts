import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

// Set FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Output directory for generated videos
const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'thread_videos');
const TEMP_DIR = path.join(process.cwd(), 'temp_assets');

// Ensure directories exist
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
    fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

interface VideoGenerationResult {
    success: boolean;
    videoPath?: string;
    error?: string;
}

/**
 * Download a file from URL to local path (handles http, https, and data: URIs)
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
    // Handle data: URIs
    if (url.startsWith('data:')) {
        const matches = url.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid data URI format');
        }
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(outputPath, buffer);
        return;
    }

    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(outputPath);

        protocol.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
            file.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Get audio duration in seconds
 */
async function getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }
            const duration = metadata.format.duration || 30;
            resolve(duration);
        });
    });
}

/**
 * Create a video from multiple images with Ken Burns effect and audio
 * 
 * @param photos Array of photo URLs (will use first 3-4)
 * @param audioUrl URL to the TTS audio narration
 * @param outputName Name for the output file (without extension)
 * @param destination Destination name for logging
 */
export async function createStopVideo(
    photos: string[],
    audioUrl: string,
    outputName: string,
    destination: string = ''
): Promise<VideoGenerationResult> {
    const timestamp = Date.now();
    const tempPrefix = path.join(TEMP_DIR, `${timestamp}_`);
    const outputPath = path.join(VIDEO_OUTPUT_DIR, `${outputName}_${timestamp}.mp4`);

    console.log(`🎬 Creating video for: ${destination || outputName}`);

    try {
        // Step 1: Download audio
        const audioPath = `${tempPrefix}audio.mp3`;
        console.log(`   📥 Downloading audio...`);
        await downloadFile(audioUrl, audioPath);

        // Get audio duration to calculate image timing
        const audioDuration = await getAudioDuration(audioPath);
        console.log(`   ⏱️ Audio duration: ${audioDuration.toFixed(1)}s`);

        // Step 2: Download photos (use first 3-4)
        const maxPhotos = Math.min(photos.length, 4);
        const photoPaths: string[] = [];

        for (let i = 0; i < maxPhotos; i++) {
            const photoPath = `${tempPrefix}photo${i}.jpg`;
            console.log(`   📥 Downloading photo ${i + 1}/${maxPhotos}...`);
            try {
                await downloadFile(photos[i], photoPath);
                photoPaths.push(photoPath);
            } catch (error) {
                console.warn(`   ⚠️ Failed to download photo ${i + 1}`);
            }
        }

        if (photoPaths.length === 0) {
            return { success: false, error: 'No photos available' };
        }

        // Step 3: Create video with smooth zoom on first image
        // Using single image approach for reliability - smoother playback
        console.log(`   🎥 Generating video (using primary image with smooth zoom)...`);
        const primaryImage = photoPaths[0];

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(primaryImage)
                .inputOptions(['-loop', '1'])
                .input(audioPath)
                .complexFilter([
                    // Scale and add gentle zoom effect
                    `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
                    `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,` +
                    `zoompan=z='min(zoom+0.0003,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(audioDuration * 25)}:s=1920x1080:fps=25[vout]`
                ])
                .outputOptions([
                    '-map', '[vout]',
                    '-map', '1:a',
                    '-c:v', 'libx264',
                    '-preset', 'medium',
                    '-crf', '23',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-shortest',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart' // Better for streaming
                ])
                .output(outputPath)
                .on('start', () => {
                    console.log(`   🔧 FFmpeg started...`);
                })
                .on('progress', (progress: any) => {
                    if (progress.percent && progress.percent > 0) {
                        const pct = Math.min(100, progress.percent);
                        process.stdout.write(`\r   ⏳ Encoding: ${pct.toFixed(0)}%`);
                    }
                })
                .on('end', () => {
                    console.log(`\n   ✅ Video created successfully`);
                    resolve();
                })
                .on('error', (err: Error) => {
                    console.error(`\n   ❌ FFmpeg error:`, err.message);
                    reject(err);
                })
                .run();
        });

        // Step 4: Cleanup temp files
        console.log(`   🧹 Cleaning up...`);
        try {
            fs.unlinkSync(audioPath);
            photoPaths.forEach(p => {
                try { fs.unlinkSync(p); } catch (e) { }
            });
        } catch (e) {
            // Ignore cleanup errors
        }

        // Verify output exists
        if (!fs.existsSync(outputPath)) {
            return { success: false, error: 'Video file not created' };
        }

        const stats = fs.statSync(outputPath);
        console.log(`   📦 Video size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        return { success: true, videoPath: outputPath };

    } catch (error) {
        console.error(`   ❌ Video creation failed:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Create a simple video from a single image and audio
 * (Fallback if Ken Burns is too slow)
 */
export async function createSimpleStopVideo(
    imageUrl: string,
    audioUrl: string,
    outputName: string
): Promise<VideoGenerationResult> {
    const timestamp = Date.now();
    const tempPrefix = path.join(TEMP_DIR, `${timestamp}_`);
    const outputPath = path.join(VIDEO_OUTPUT_DIR, `${outputName}_${timestamp}.mp4`);

    try {
        // Download assets
        const imagePath = `${tempPrefix}image.jpg`;
        const audioPath = `${tempPrefix}audio.mp3`;

        await downloadFile(imageUrl, imagePath);
        await downloadFile(audioUrl, audioPath);

        // Get audio duration
        const audioDuration = await getAudioDuration(audioPath);

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(imagePath)
                .inputOptions(['-loop', '1'])
                .input(audioPath)
                .outputOptions([
                    '-c:v', 'libx264',
                    '-tune', 'stillimage',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-pix_fmt', 'yuv420p',
                    '-shortest',
                    '-t', String(Math.ceil(audioDuration))
                ])
                .output(outputPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        // Cleanup
        fs.unlinkSync(imagePath);
        fs.unlinkSync(audioPath);

        return { success: true, videoPath: outputPath };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Clean up old videos (older than 24 hours)
 */
export function cleanupOldVideos(maxAgeHours: number = 24): void {
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();

    try {
        const files = fs.readdirSync(VIDEO_OUTPUT_DIR);
        files.forEach(file => {
            const filePath = path.join(VIDEO_OUTPUT_DIR, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Cleaned up old video: ${file}`);
            }
        });
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}
