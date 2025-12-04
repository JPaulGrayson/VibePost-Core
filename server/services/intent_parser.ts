import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Intent parsing will fail.");
}
const genAI = new GoogleGenAI({ apiKey: apiKey || "dummy" });

export interface TourRequest {
    isRequest: boolean;
    city?: string;
    theme?: string;
    userHandle: string;
}

export async function analyzeTweetIntent(tweetText: string, userHandle: string): Promise<TourRequest> {
    // A specialized prompt that acts as a strict filter
    const prompt = `
    Analyze this tweet from a user (@${userHandle}) replying to a travel bot.
    Tweet: "${tweetText}"
    
    Task: Determine if the user is requesting a custom tour generation.
    - A request usually contains a City Name and optionally a Vibe/Theme.
    - Examples of Requests: "Paris, romantic", "Tokyo cyberpunk", "Do London for kids", "NYC", "Chicago pizza tour".
    - Examples of Non-Requests: "Cool!", "Thanks", "Wow", "Bot".
    
    Output strictly valid JSON:
    {
      "isRequest": boolean,
      "city": "string or null",
      "theme": "string (default to 'General Highlights' if missing)"
    }
  `;

    try {
        const result = await genAI.models.generateContent({
            model: 'gemini-pro-latest',
            contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }]
        });

        const response = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        // Clean markdown formatting if Gemini adds it
        const jsonStr = response.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(jsonStr);

        return {
            ...parsed,
            userHandle // Ensure userHandle is passed through
        };
    } catch (error) {
        console.error("Intent Parsing Failed:", error);
        return { isRequest: false, userHandle };
    }
}
