import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

// Sample real lead from the database
const realLead = {
    tweetText: "Just spent 6 hours debugging a simple for loop. The average coding experience.",
    authorHandle: "frustrated_dev",
    strategy: "spaghetti_detective"
};

async function generateRealDraft() {
    console.log("=== Generating LogicArt Draft from Real Lead ===\n");
    console.log("Original Tweet:", realLead.tweetText);
    console.log("Author:", realLead.authorHandle);
    console.log("Strategy:", realLead.strategy);
    console.log("\n--- Generating AI Image ---\n");
    
    // Initialize Gemini for image generation
    const imageGenAI = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "",
        httpOptions: {
            apiVersion: "",
            baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
    });

    // Create image prompt based on the lead
    const imagePrompt = `Create a professional, modern image for a coding/developer brand. 
Theme: Debugging tangled spaghetti code, untangling complex logic
Style: Clean, modern code flowchart or abstract data visualization. Dark theme with glowing neon accents (blue, green, purple). 
Must include: Abstract geometric code patterns representing messy code being organized, flowing data lines, technology aesthetic.
No text, no letters, no words - pure visual art.`;

    console.log("Sending image generation request to Gemini...");
    
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
        
        const filename = `logicart-real-lead-${Date.now()}.png`;
        const filepath = path.join(imagesDir, filename);
        
        const buffer = Buffer.from(imagePart.inlineData.data, "base64");
        fs.writeFileSync(filepath, buffer);
        
        // Copy to attached_assets for viewing
        const assetsPath = path.join(process.cwd(), "attached_assets", filename);
        fs.copyFileSync(filepath, assetsPath);
        
        console.log("\n✅ SUCCESS!");
        console.log("📸 Image saved to:", filepath);
        console.log("👁️ Viewable at: attached_assets/" + filename);
        console.log("📦 File size:", buffer.length, "bytes");
        
        // Sample draft reply text
        const draftReply = `Oof, 6 hours in the debug trenches! 😅 We've all been there.

When code gets tangled, try visualizing it as a flowchart. Drop your code into https://logic.art/x and see the logic flow instantly.

It's like X-ray vision for spaghetti code! 🍝➡️📊`;

        console.log("\n--- Generated Draft ---");
        console.log("Reply Text:", draftReply);
        console.log("Image:", filename);
        
        return filename;
    } else {
        console.log("❌ No image data in response");
        return null;
    }
}

generateRealDraft().catch(console.error);
