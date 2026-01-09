import { GoogleGenAI, Modality } from "@google/genai";

async function debugGemini() {
    console.log("=== Debug Gemini Image Generation ===\n");
    console.log("API Key present:", !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
    console.log("Base URL:", process.env.AI_INTEGRATIONS_GEMINI_BASE_URL);
    
    const imageGenAI = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "",
        httpOptions: {
            apiVersion: "",
            baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
    });

    const imagePrompt = `Create a simple abstract art image with glowing neon blue and purple geometric shapes on a dark background. No text.`;

    console.log("\nSending request...");
    
    try {
        const response = await imageGenAI.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
            config: {
                responseModalities: [Modality.TEXT, Modality.IMAGE],
            },
        });

        console.log("\nResponse received:");
        console.log("Candidates count:", response.candidates?.length);
        
        if (response.candidates?.[0]) {
            const candidate = response.candidates[0];
            console.log("Parts count:", candidate.content?.parts?.length);
            
            candidate.content?.parts?.forEach((part: any, i: number) => {
                console.log(`Part ${i}:`, {
                    hasText: !!part.text,
                    hasInlineData: !!part.inlineData,
                    mimeType: part.inlineData?.mimeType,
                    dataLength: part.inlineData?.data?.length
                });
            });
        }
    } catch (error: any) {
        console.error("Error:", error.message);
        console.error("Full error:", JSON.stringify(error, null, 2).slice(0, 1000));
    }
}

debugGemini().catch(console.error);
