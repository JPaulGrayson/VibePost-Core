
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

console.log('--- System Info ---');
console.log(`Platform: ${os.platform()}`);
console.log(`Arch: ${os.arch()}`);

console.log('\n--- Checking @ffmpeg-installer ---');
try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    console.log(`Package path: ${ffmpegInstaller.path}`);

    if (fs.existsSync(ffmpegInstaller.path)) {
        console.log('✅ Binary exists');
        const stats = fs.statSync(ffmpegInstaller.path);
        console.log(`Permissions: ${stats.mode.toString(8)}`);

        try {
            console.log('Testing execution...');
            const output = execSync(`"${ffmpegInstaller.path}" -version`).toString();
            console.log(`✅ Execution success: ${output.split('\n')[0]}`);
        } catch (execErr: any) {
            console.error('❌ Execution failed:', execErr.message);
        }
    } else {
        console.error('❌ Binary NOT found at path');
        // List directory contents to see what's there
        const dir = path.dirname(ffmpegInstaller.path);
        if (fs.existsSync(dir)) {
            console.log(`Contents of ${dir}:`, fs.readdirSync(dir));
        } else {
            console.log(`Directory ${dir} does not exist`);
        }
    }
} catch (err) {
    console.error('Failed to load @ffmpeg-installer:', err);
}

console.log('\n--- Checking System FFmpeg ---');
try {
    const sysOutput = execSync('ffmpeg -version').toString();
    console.log('✅ System FFmpeg found:', sysOutput.split('\n')[0]);
} catch (e) {
    console.log('❌ System FFmpeg not found in PATH');
}
