/**
 * Direct ElevenLabs TTS Integration
 * Bypasses Turai API for more reliable narration generation
 */

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import * as fs from 'fs';
import { Readable } from 'stream';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Rachel - Expressive, warm female voice (best for travel content)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

// Alternative voices for variety
const VOICES = {
    rachel: "21m00Tcm4TlvDq8ikWAM",  // Expressive female
    adam: "pNInz6obpgDQGcFmaJgB",    // Deep male
    bella: "EXAVITQu4vr4xnSDxMaL",   // Soft female
    josh: "TxGEqnHWrfWFTfGW9XjX",    // Young male
};

/**
 * Generate TTS audio using ElevenLabs directly
 */
export async function generateElevenLabsTTS(
    text: string,
    outputPath: string,
    voiceId: string = DEFAULT_VOICE_ID
): Promise<{ success: boolean; error?: string; sizeKB?: number }> {
    if (!ELEVENLABS_API_KEY) {
        return {
            success: false,
            error: "ELEVENLABS_API_KEY not configured"
        };
    }

    try {
        console.log(`      🎙️ Generating ElevenLabs TTS (voice: ${getVoiceName(voiceId)})...`);

        const client = new ElevenLabsClient({
            apiKey: ELEVENLABS_API_KEY
        });

        // Generate audio stream
        const audioStream = await client.textToSpeech.convert(voiceId, {
            text: text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
                stability: 0.5,        // Balanced (0.0-1.0)
                similarity_boost: 0.75, // High similarity to voice
                style: 0.5,            // Moderate expressiveness
                use_speaker_boost: true
            }
        });

        // Convert stream to buffer and save
        const chunks: Buffer[] = [];

        // Handle the stream properly
        if (audioStream instanceof Readable) {
            for await (const chunk of audioStream) {
                chunks.push(Buffer.from(chunk));
            }
        } else {
            // If it's already a buffer/array
            chunks.push(Buffer.from(audioStream as any));
        }

        const audioBuffer = Buffer.concat(chunks);

        if (audioBuffer.length < 1000) {
            return {
                success: false,
                error: "Audio too small, likely generation failed"
            };
        }

        fs.writeFileSync(outputPath, audioBuffer);
        const sizeKB = audioBuffer.length / 1024;

        console.log(`      ✅ ElevenLabs TTS generated (${sizeKB.toFixed(1)} KB)`);

        return {
            success: true,
            sizeKB
        };

    } catch (error: any) {
        console.error(`      ⚠️ ElevenLabs TTS failed:`, error.message || error);
        return {
            success: false,
            error: error.message || String(error)
        };
    }
}

/**
 * Get voice name from ID for logging
 */
function getVoiceName(voiceId: string): string {
    const entry = Object.entries(VOICES).find(([_, id]) => id === voiceId);
    return entry ? entry[0] : 'custom';
}

/**
 * Get random voice for variety
 */
export function getRandomVoice(): string {
    const voiceIds = Object.values(VOICES);
    return voiceIds[Math.floor(Math.random() * voiceIds.length)];
}

/**
 * Select voice based on content/context
 */
export function selectVoiceForContent(
    destination: string,
    interests: string[]
): string {
    // For now, use Rachel (best for travel)
    // Future: Could vary based on destination/interests
    return VOICES.rachel;
}
