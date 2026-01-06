import { GoogleGenAI } from "@google/genai";

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

async function queryGemini(code: string, problem: string): Promise<ModelResponse> {
  const start = Date.now();
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { model: "Gemini", provider: "Google", response: "", responseTime: 0, error: "API key not configured" };
    }
    
    const genAI = new GoogleGenAI({ apiKey });
    const prompt = `You are a helpful coding assistant. Debug this code and explain the issue clearly and concisely.

Problem: ${problem || "Debug this code"}

Code:
\`\`\`
${code}
\`\`\`

Provide a clear, concise explanation of:
1. What the bug/issue is
2. How to fix it
3. The corrected code (if applicable)

Keep your response under 280 characters for the main explanation (tweet-friendly).`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    return {
      model: "Gemini",
      provider: "Google",
      response: result.text || "",
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      model: "Gemini",
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
    const prompt = `You are a helpful coding assistant. Debug this code and explain the issue clearly and concisely.

Problem: ${problem || "Debug this code"}

Code:
\`\`\`
${code}
\`\`\`

Provide a clear, concise explanation of:
1. What the bug/issue is
2. How to fix it
3. The corrected code (if applicable)

Keep your response under 280 characters for the main explanation (tweet-friendly).`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      model: "GPT-4o",
      provider: "OpenAI",
      response: data.choices?.[0]?.message?.content || "",
      responseTime: Date.now() - start
    };
  } catch (error) {
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
    const prompt = `You are a helpful coding assistant. Debug this code and explain the issue clearly and concisely.

Problem: ${problem || "Debug this code"}

Code:
\`\`\`
${code}
\`\`\`

Provide a clear, concise explanation of:
1. What the bug/issue is
2. How to fix it
3. The corrected code (if applicable)

Keep your response under 280 characters for the main explanation (tweet-friendly).`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-sonnet",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      model: "Claude 3.5",
      provider: "Anthropic",
      response: data.choices?.[0]?.message?.content || "",
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      model: "Claude 3.5",
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
    const prompt = `You are a helpful coding assistant. Debug this code and explain the issue clearly and concisely.

Problem: ${problem || "Debug this code"}

Code:
\`\`\`
${code}
\`\`\`

Provide a clear, concise explanation of:
1. What the bug/issue is
2. How to fix it
3. The corrected code (if applicable)

Keep your response under 280 characters for the main explanation (tweet-friendly).`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
      },
      body: JSON.stringify({
        model: "x-ai/grok-2",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      model: "Grok-2",
      provider: "xAI",
      response: data.choices?.[0]?.message?.content || "",
      responseTime: Date.now() - start
    };
  } catch (error) {
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
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const validResponses = responses.filter(r => r.response && !r.error);
      const fastest = validResponses.sort((a, b) => a.responseTime - b.responseTime)[0];
      return { winner: fastest?.model || "Unknown", reason: "Fastest response" };
    }

    const genAI = new GoogleGenAI({ apiKey });
    const responsesSummary = responses
      .filter(r => r.response && !r.error)
      .map(r => `${r.model}: "${r.response.substring(0, 200)}..."`)
      .join("\n\n");

    const prompt = `You are judging a coding debug arena. Here are responses from different AI models for this code:

Code:
\`\`\`
${code}
\`\`\`

Responses:
${responsesSummary}

Pick the WINNER based on:
1. Accuracy of identifying the bug
2. Clarity of explanation
3. Quality of the fix

Reply with JSON only: {"winner": "ModelName", "reason": "Brief 1-sentence reason"}`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const text = result.text || '{"winner": "Unknown", "reason": "Unable to determine"}';
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { winner: parsed.winner, reason: parsed.reason };
    }
    
    return { winner: "Unknown", reason: "Unable to determine winner" };
  } catch (error) {
    console.error("Error determining winner:", error);
    return { winner: "Unknown", reason: "Error determining winner" };
  }
}

function generateLogigoArenaUrl(code: string): string {
  const encodedCode = encodeURIComponent(code);
  return `${LOGIGO_BASE_URL}?code=${encodedCode}`;
}

export async function runArena(request: ArenaRequest): Promise<ArenaResult> {
  const { code, problemDescription, language } = request;
  const problem = problemDescription || "Debug this code and explain the issue";

  console.log("🏟️ Arena: Starting multi-model comparison...");

  const responses = await Promise.all([
    queryGemini(code, problem),
    queryOpenAI(code, problem),
    queryClaude(code, problem),
    queryGrok(code, problem)
  ]);

  console.log(`🏟️ Arena: Got ${responses.filter(r => !r.error).length}/4 valid responses`);

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
