import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface ArenaRequest {
  code: string;
  problemDescription?: string;
  language?: string;
}

export interface ModelResponse {
  model: string;
  provider: string;
  response: string;
  responseTime: number;
  error?: string;
}

export interface ArenaResult {
  request: ArenaRequest;
  responses: ModelResponse[];
  winner?: string;
  winnerReason?: string;
  logigoArenaUrl: string;
  timestamp: string;
}

const LOGIGO_BASE_URL = process.env.LOGIGO_API_URL || "https://logigo-studio-jpaulgrayson.replit.app";

const DEBUG_PROMPT = (code: string, problem: string) => `You are a helpful coding assistant. Debug this code and explain the issue clearly and concisely.

Problem: ${problem || "Debug this code"}

Code:
\`\`\`
${code}
\`\`\`

Provide a clear, concise explanation of:
1. What the bug/issue is
2. How to fix it
3. The corrected code snippet (if applicable)

Keep your main explanation under 200 words for readability.`;

async function queryGemini(code: string, problem: string): Promise<ModelResponse> {
  const start = Date.now();
  try {
    const genAI = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: DEBUG_PROMPT(code, problem) }] }],
    });

    return {
      model: "Gemini 2.5",
      provider: "Google",
      response: result.text || "",
      responseTime: Date.now() - start
    };
  } catch (error) {
    console.error("Gemini error:", error);
    return {
      model: "Gemini 2.5",
      provider: "Google",
      response: "",
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function queryOpenAI(code: string, problem: string): Promise<ModelResponse> {
  const start = Date.now();
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: DEBUG_PROMPT(code, problem) }],
      max_tokens: 1000
    });

    return {
      model: "GPT-4o",
      provider: "OpenAI",
      response: response.choices[0]?.message?.content || "",
      responseTime: Date.now() - start
    };
  } catch (error) {
    console.error("OpenAI error:", error);
    return {
      model: "GPT-4o",
      provider: "OpenAI",
      response: "",
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function queryClaude(code: string, problem: string): Promise<ModelResponse> {
  const start = Date.now();
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: DEBUG_PROMPT(code, problem) }]
    });

    const textContent = response.content.find(c => c.type === 'text');
    return {
      model: "Claude Sonnet 4",
      provider: "Anthropic",
      response: textContent?.type === 'text' ? textContent.text : "",
      responseTime: Date.now() - start
    };
  } catch (error) {
    console.error("Claude error:", error);
    return {
      model: "Claude Sonnet 4",
      provider: "Anthropic",
      response: "",
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function queryGrok(code: string, problem: string): Promise<ModelResponse> {
  const start = Date.now();
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-2-latest",
        messages: [{ role: "user", content: DEBUG_PROMPT(code, problem) }],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      model: "Grok-2",
      provider: "xAI",
      response: data.choices?.[0]?.message?.content || "",
      responseTime: Date.now() - start
    };
  } catch (error) {
    console.error("Grok error:", error);
    return {
      model: "Grok-2",
      provider: "xAI",
      response: "",
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function determineWinner(responses: ModelResponse[], code: string): Promise<{ winner: string; reason: string }> {
  const validResponses = responses.filter(r => r.response && !r.error);
  
  if (validResponses.length === 0) {
    return { winner: "None", reason: "All models failed to respond" };
  }
  
  if (validResponses.length === 1) {
    return { winner: validResponses[0].model, reason: "Only model to respond successfully" };
  }

  try {
    const genAI = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });

    const responsesSummary = validResponses
      .map(r => `${r.model}: "${r.response.substring(0, 300)}..."`)
      .join("\n\n---\n\n");

    const prompt = `You are judging a coding debug arena. Different AI models were asked to debug this code:

Code:
\`\`\`
${code.substring(0, 500)}
\`\`\`

Their responses:
${responsesSummary}

Pick the WINNER based on:
1. Accuracy of identifying the bug
2. Clarity and helpfulness of explanation
3. Quality of the suggested fix

Reply with JSON only: {"winner": "ModelName", "reason": "Brief 1-sentence reason"}`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.text || '{"winner": "Unknown", "reason": "Unable to determine"}';
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { winner: parsed.winner, reason: parsed.reason };
    }
    
    return { winner: validResponses[0].model, reason: "First valid response" };
  } catch (error) {
    console.error("Error determining winner:", error);
    const fastest = validResponses.sort((a, b) => a.responseTime - b.responseTime)[0];
    return { winner: fastest?.model || "Unknown", reason: "Fastest response time" };
  }
}

function generateLogigoArenaUrl(code: string): string {
  const encodedCode = encodeURIComponent(code);
  return `${LOGIGO_BASE_URL}?code=${encodedCode}`;
}

export async function runArena(request: ArenaRequest): Promise<ArenaResult> {
  const { code, problemDescription } = request;
  const problem = problemDescription || "Debug this code and explain the issue";

  console.log("🏟️ Arena: Starting multi-model comparison...");

  const responses = await Promise.all([
    queryGemini(code, problem),
    queryOpenAI(code, problem),
    queryClaude(code, problem),
    queryGrok(code, problem)
  ]);

  const validCount = responses.filter(r => !r.error).length;
  console.log(`🏟️ Arena: Got ${validCount}/4 valid responses`);

  const { winner, reason } = await determineWinner(responses, code);

  return {
    request,
    responses,
    winner,
    winnerReason: reason,
    logigoArenaUrl: generateLogigoArenaUrl(code),
    timestamp: new Date().toISOString()
  };
}

export function generateArenaThread(result: ArenaResult): string[] {
  const thread: string[] = [];

  thread.push(`🏟️ AI DEBUG ARENA 🏟️

Can AI help you debug your code? Let's find out!

Here's a coding puzzle - which AI solves it best?

${result.request.problemDescription || "Check out this code..."}

👇 See how 4 different AI models tackled it:`);

  for (const response of result.responses) {
    if (response.error) {
      thread.push(`❌ ${response.model} (${response.provider}):
Error: ${response.error}`);
    } else {
      const shortResponse = response.response.length > 250 
        ? response.response.substring(0, 247) + "..." 
        : response.response;
      thread.push(`🤖 ${response.model} (${response.provider}) [${response.responseTime}ms]:

${shortResponse}`);
    }
  }

  thread.push(`🏆 WINNER: ${result.winner}!

${result.winnerReason}

Want to try YOUR code in the arena?
👉 ${result.logigoArenaUrl}

#VibeCoding #AI #Debugging #LogiGo`);

  return thread;
}

export const arenaService = {
  runArena,
  generateArenaThread,
  generateLogigoArenaUrl
};
