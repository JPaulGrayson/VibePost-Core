
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY not found");
        process.exit(1);
    }

    console.log("Testing Gemini API connection...");
    const genAI = new GoogleGenAI({ apiKey });

    // List available models to find the correct one
    // Note: The SDK might not expose listModels directly on the instance in this version, 
    // but let's try a simple generation with a known stable model name or try to list if possible.
    // Based on docs, listModels is usually on the client or via a specific method.

    try {
        console.log("Listing available models...");
        // @ts-ignore
        const response = await genAI.models.list();
        console.log("Available models:", JSON.stringify(response, null, 2));
    } catch (e: any) {
        console.error("Failed to list models:", e.message);
    }

    process.exit(0);
}

main();
