
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import https from 'https';

const BUILD_URL = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
const OUTPUT_DIR = path.join(process.cwd(), 'repl_bin');
const TAR_FILE = path.join(OUTPUT_DIR, 'ffmpeg.tar.xz');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

console.log('⬇️  Downloading static FFmpeg build (approx 40MB)...');
try {
    execSync(`curl -L -o "${TAR_FILE}" "${BUILD_URL}"`, { stdio: 'inherit' });

    console.log('📦 Extracting binaries...');
    // Extract only ffmpeg and ffprobe, flattened into the directory
    // Note: tar command varies by OS, but this works on standard unix-like
    // We list the content first to find the folder name
    const list = execSync(`tar -tf "${TAR_FILE}"`).toString();
    const folderName = list.split('\n')[0].split('/')[0]; // likely 'ffmpeg-7.1-amd64-static'

    console.log(`   Detected folder: ${folderName}`);

    // Extract specific files
    execSync(`tar -xf "${TAR_FILE}" --strip-components=1 -C "${OUTPUT_DIR}" "${folderName}/ffmpeg" "${folderName}/ffprobe"`);

    // Cleanup
    fs.unlinkSync(TAR_FILE);

    console.log('✅ Download complete! Binaries are in repl_bin/ and ready to commit.');

} catch (e) {
    console.error('❌ Failed:', e);
}
