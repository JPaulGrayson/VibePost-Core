/**
 * Grok TTS Service
 * Uses xAI's Grok Voice Agent API for expressive, emotional text-to-speech
 * Features: Voice selection based on poster gender, local greetings, emotional delivery
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from "@google/genai";

const XAI_API_KEY = process.env.XAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "dummy" });

// Grok voice options - expressive voices with emotional range
const GROK_VOICES = {
    female: ['Ara', 'Eve'],      // Female voices
    male: ['Leo'],               // Male voices  
    neutral: ['Ara']             // Default neutral
};

// Local greetings by country/language
const LOCAL_GREETINGS: Record<string, { greeting: string; language: string }> = {
    // Europe
    'France': { greeting: 'Bonjour!', language: 'French' },
    'Paris': { greeting: 'Bonjour!', language: 'French' },
    'Italy': { greeting: 'Ciao!', language: 'Italian' },
    'Rome': { greeting: 'Ciao!', language: 'Italian' },
    'Venice': { greeting: 'Ciao!', language: 'Italian' },
    'Florence': { greeting: 'Ciao!', language: 'Italian' },
    'Spain': { greeting: '¡Hola!', language: 'Spanish' },
    'Barcelona': { greeting: '¡Hola!', language: 'Spanish' },
    'Madrid': { greeting: '¡Hola!', language: 'Spanish' },
    'Germany': { greeting: 'Hallo!', language: 'German' },
    'Berlin': { greeting: 'Hallo!', language: 'German' },
    'Munich': { greeting: 'Grüß Gott!', language: 'German' },
    'Portugal': { greeting: 'Olá!', language: 'Portuguese' },
    'Lisbon': { greeting: 'Olá!', language: 'Portuguese' },
    'Greece': { greeting: 'Γεια σας!', language: 'Greek' },
    'Athens': { greeting: 'Γεια σας!', language: 'Greek' },
    'Santorini': { greeting: 'Γεια σας!', language: 'Greek' },
    'Netherlands': { greeting: 'Hallo!', language: 'Dutch' },
    'Amsterdam': { greeting: 'Hallo!', language: 'Dutch' },

    // Asia
    'Japan': { greeting: 'Konnichiwa!', language: 'Japanese' },
    'Tokyo': { greeting: 'Konnichiwa!', language: 'Japanese' },
    'Kyoto': { greeting: 'Konnichiwa!', language: 'Japanese' },
    'Osaka': { greeting: 'Konnichiwa!', language: 'Japanese' },
    'China': { greeting: 'Nǐ hǎo!', language: 'Chinese' },
    'Beijing': { greeting: 'Nǐ hǎo!', language: 'Chinese' },
    'Shanghai': { greeting: 'Nǐ hǎo!', language: 'Chinese' },
    'Thailand': { greeting: 'Sawadee!', language: 'Thai' },
    'Bangkok': { greeting: 'Sawadee!', language: 'Thai' },
    'Phuket': { greeting: 'Sawadee!', language: 'Thai' },
    'Vietnam': { greeting: 'Xin chào!', language: 'Vietnamese' },
    'Korea': { greeting: 'Annyeonghaseyo!', language: 'Korean' },
    'Seoul': { greeting: 'Annyeonghaseyo!', language: 'Korean' },
    'Indonesia': { greeting: 'Halo!', language: 'Indonesian' },
    'Bali': { greeting: 'Halo!', language: 'Indonesian' },
    'India': { greeting: 'Namaste!', language: 'Hindi' },

    // Americas
    'Mexico': { greeting: '¡Hola!', language: 'Spanish' },
    'Cancun': { greeting: '¡Hola!', language: 'Spanish' },
    'Brazil': { greeting: 'Olá!', language: 'Portuguese' },
    'Rio de Janeiro': { greeting: 'Olá!', language: 'Portuguese' },
    'Argentina': { greeting: '¡Hola!', language: 'Spanish' },
    'Peru': { greeting: '¡Hola!', language: 'Spanish' },

    // Middle East
    'Dubai': { greeting: 'Marhaba!', language: 'Arabic' },
    'Morocco': { greeting: 'Salam!', language: 'Arabic' },
    'Egypt': { greeting: 'Ahlan!', language: 'Arabic' },
    'Turkey': { greeting: 'Merhaba!', language: 'Turkish' },
    'Istanbul': { greeting: 'Merhaba!', language: 'Turkish' },

    // Default English
    'default': { greeting: 'Hey there!', language: 'English' }
};

// Common male/female names for gender detection
const FEMALE_NAMES = new Set([
    'emma', 'olivia', 'ava', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia', 'harper', 'evelyn',
    'sarah', 'jessica', 'jennifer', 'amanda', 'ashley', 'stephanie', 'nicole', 'elizabeth', 'heather', 'michelle',
    'anna', 'maria', 'lisa', 'laura', 'emily', 'rachel', 'hannah', 'samantha', 'brittany', 'katherine',
    'julia', 'grace', 'natalie', 'victoria', 'alexandra', 'chloe', 'madison', 'lauren', 'kayla', 'brianna'
]);

const MALE_NAMES = new Set([
    'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
    'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth',
    'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan', 'jacob',
    'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin'
]);

export interface PosterProfile {
    inferredGender: 'male' | 'female' | 'unknown';
    suggestedVoice: string;
    localGreeting: string;
    destinationLanguage: string;
    nationality?: string;
}

/**
 * Analyze poster and destination to personalize voice
 */
export async function analyzeForVoicePersonalization(
    tweetText: string,
    authorHandle: string,
    authorName: string,
    destination: string
): Promise<PosterProfile> {
    // Detect gender from name
    const firstName = (authorName || authorHandle || '').split(/[\s_]/)[0].toLowerCase().replace(/[^a-z]/g, '');
    let inferredGender: 'male' | 'female' | 'unknown' = 'unknown';

    if (FEMALE_NAMES.has(firstName)) {
        inferredGender = 'female';
    } else if (MALE_NAMES.has(firstName)) {
        inferredGender = 'male';
    }

    // If still unknown, try AI detection
    if (inferredGender === 'unknown' && GEMINI_API_KEY) {
        try {
            const result = await genAI.models.generateContent({
                model: "gemini-2.0-flash",
                contents: `Based on this Twitter handle and name, what gender is most likely? Handle: @${authorHandle}, Name: "${authorName}". Reply with ONLY one word: male, female, or unknown`,
            });
            const response = result.text?.toLowerCase().trim();
            if (response?.includes('female')) inferredGender = 'female';
            else if (response?.includes('male')) inferredGender = 'male';
        } catch (e) {
            // Ignore AI detection errors
        }
    }

    // Select voice based on gender (use opposite gender for variety - female poster gets male voice guide, etc.)
    const voiceGender = inferredGender === 'female' ? 'male' : 'female';
    const voices = GROK_VOICES[voiceGender] || GROK_VOICES.neutral;
    const suggestedVoice = voices[Math.floor(Math.random() * voices.length)];

    // Get local greeting for destination
    let greetingInfo = LOCAL_GREETINGS['default'];
    const destLower = destination.toLowerCase();

    for (const [key, value] of Object.entries(LOCAL_GREETINGS)) {
        if (destLower.includes(key.toLowerCase()) || key.toLowerCase().includes(destLower)) {
            greetingInfo = value;
            break;
        }
    }

    return {
        inferredGender,
        suggestedVoice,
        localGreeting: greetingInfo.greeting,
        destinationLanguage: greetingInfo.language
    };
}

/**
 * Generate TTS using Grok Voice API
 * Falls back to Turai's existing TTS if Grok fails
 */
export async function generateGrokTTS(
    text: string,
    outputPath: string,
    voice: string = 'Ara'
): Promise<{ success: boolean; error?: string }> {
    // NOTE: xAI doesn't have a standalone TTS API yet (as of Dec 2024)
    // They only have Voice Agent API for real-time conversations via WebSocket
    // For now, skip Grok and use the fallback (Google TTS)
    // TODO: Enable when xAI releases dedicated TTS endpoint
    console.log('      ℹ️ Grok TTS not available (xAI TTS API not yet released), using fallback');
    return { success: false, error: 'Grok TTS not yet available - using fallback' };

    try {
        console.log(`      🎙️ Generating Grok TTS (voice: ${voice})...`);

        // xAI TTS API endpoint (OpenAI-compatible)
        const response = await fetch('https://api.x.ai/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${XAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'grok-2-voice',
                input: text,
                voice: voice.toLowerCase(),
                response_format: 'mp3',
                speed: 1.0
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`      ⚠️ Grok TTS failed: ${response.status} - ${errorText}`);
            return { success: false, error: `Grok API error: ${response.status}` };
        }

        // Get audio as buffer
        const audioBuffer = Buffer.from(await response.arrayBuffer());

        if (audioBuffer.length < 1000) {
            return { success: false, error: 'Audio too small, likely failed' };
        }

        fs.writeFileSync(outputPath, audioBuffer);
        console.log(`      ✅ Grok TTS generated (${(audioBuffer.length / 1024).toFixed(1)} KB, voice: ${voice})`);

        return { success: true };

    } catch (error) {
        console.error('      ⚠️ Grok TTS error:', error);
        return { success: false, error: String(error) };
    }
}

/**
 * Generate personalized narration text with local greeting
 */
export function addLocalGreeting(narrationText: string, greeting: string, language: string): string {
    // Only add if it's not English
    if (language === 'English') {
        return narrationText;
    }

    // Prepend the local greeting
    return `${greeting} ${narrationText}`;
}

/**
 * Enhance narration prompt with emotional cues for Grok
 * Grok supports: whispers, sighs, laughs, excitement
 */
export function enhanceNarrationForEmotion(text: string): string {
    // Add subtle emotional markers that Grok can interpret
    // These help Grok deliver with more personality
    return text
        .replace(/!\s/g, '! ') // Preserve exclamation energy
        .replace(/\.\.\./g, '... ') // Pause for effect
        .replace(/\?/g, '? '); // Question inflection
}
