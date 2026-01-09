import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

async function testImageGeneration() {
    console.log("Testing Gemini image generation...");
    console.log("API Key present:", !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
    console.log("Base URL:", process.env.AI_INTEGRATIONS_GEMINI_BASE_URL);
    
    const imageGenAI = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "",
        httpOptions: {
            apiVersion: "",
            baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
    });

    const imagePrompt = `Create a professional, modern image for a coding/developer brand. 
Theme: AI debugging code
Style: Clean, modern code flowchart or abstract data visualization. Dark theme with glowing neon accents (blue, green, purple). 
Must include: Abstract geometric code patterns, flowing data lines, technology aesthetic.
No text, no letters, no words - pure visual art.`;

    console.log("Sending request to Gemini...");
    
    const response = await imageGenAI.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
        config: {
            responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
    });

    const candidate = response.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(
        (part: any) => part.inlineData
    );

    if (imagePart?.inlineData?.data) {
        const imagesDir = path.join(process.cwd(), "public", "generated-images");
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        const filename = `test-logicart-${Date.now()}.png`;
        const filepath = path.join(imagesDir, filename);
        
        const buffer = Buffer.from(imagePart.inlineData.data, "base64");
        fs.writeFileSync(filepath, buffer);
        
        console.log("✅ SUCCESS! Image saved to:", filepath);
        console.log("🔗 URL: /generated-images/" + filename);
        console.log("📦 File size:", buffer.length, "bytes");
    } else {
        console.log("❌ No image data in response");
        console.log("Response:", JSON.stringify(response, null, 2).slice(0, 1000));
    }
}

testImageGeneration().catch(console.error);
