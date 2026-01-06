import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface ArenaRequest {
  code?: string;
  problemDescription?: string;
  language?: string;
  mode?: "debug" | "question";
}

export interface ModelResponse {
  model: string;
  provider: string;
  response: string;
  responseTime: number;
  error?: string;
}

export interface JudgeVerdict {
  judgeModel: string;
  judgeProvider: string;
  winner: string;
  reasoning: string;
}

export interface ArenaResult {
  request: ArenaRequest;
  responses: ModelResponse[];
  winner?: string;
  winnerReason?: string;
  judge?: JudgeVerdict;
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

const QUESTION_PROMPT = (question: string) => `You are a knowledgeable assistant. Answer this question clearly and concisely.

Question: ${question}

Provide a clear, helpful answer that:
1. Directly addresses the question
2. Includes relevant examples or evidence when helpful
3. Mentions any important caveats and best practices

Keep your answer under 300 words for readability. If the question is non-technical, do NOT force a coding or technical response.`;

function getPrompt(code: string, problem: string, mode: "debug" | "question"): string {
  if (mode === "question") {
    return QUESTION_PROMPT(problem);
  }
  return DEBUG_PROMPT(code, problem);
}

async function queryGemini(prompt: string): Promise<ModelResponse> {
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
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    return {
      model: "Gemini 3 Flash",
      provider: "Google",
      response: result.text || "",
      responseTime: Date.now() - start
    };
  } catch (error) {
    console.error("Gemini error:", error);
    return {
      model: "Gemini 3 Flash",
      provider: "Google",
      response: "",
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function queryOpenAI(prompt: string): Promise<ModelResponse> {
  const start = Date.now();
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
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

async function queryClaude(prompt: string): Promise<ModelResponse> {
  const start = Date.now();
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
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

async function queryGrok(prompt: string): Promise<ModelResponse> {
  const start = Date.now();
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-4-0709",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      model: "Grok-4",
      provider: "xAI",
      response: data.choices?.[0]?.message?.content || "",
      responseTime: Date.now() - start
    };
  } catch (error) {
    console.error("Grok error:", error);
    return {
      model: "Grok-4",
      provider: "xAI",
      response: "",
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function determineWinner(responses: ModelResponse[], context: string, mode: "debug" | "question"): Promise<JudgeVerdict> {
  const validResponses = responses.filter(r => r.response && !r.error);
  const judgeModel = "Gemini 3 Flash";
  const judgeProvider = "Google";
  
  if (validResponses.length === 0) {
    return { judgeModel, judgeProvider, winner: "None", reasoning: "All models failed to respond. No winner can be determined." };
  }
  
  if (validResponses.length === 1) {
    return { 
      judgeModel, 
      judgeProvider, 
      winner: validResponses[0].model, 
      reasoning: `${validResponses[0].model} wins by default as the only model to provide a successful response.` 
    };
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
      .map(r => `${r.model}: "${r.response.substring(0, 500)}..."`)
      .join("\n\n---\n\n");

    const prompt = mode === "debug" 
      ? `You are the Chairman Judge of the AI Debug Arena. Different AI models were asked to debug this code:

Code:
\`\`\`
${context.substring(0, 500)}
\`\`\`

Their responses:
${responsesSummary}

As Chairman, evaluate each response and pick the WINNER based on:
1. Accuracy of identifying the bug
2. Clarity and helpfulness of explanation
3. Quality of the suggested fix

Provide your official verdict with detailed reasoning (2-3 sentences explaining WHY the winner's response was best).

Reply with JSON only: {"winner": "ModelName", "reasoning": "Your detailed 2-3 sentence explanation as Chairman Judge"}`
      : `You are the Chairman Judge of the AI Cage Match. Different AI models were asked this question:

Question: "${context.substring(0, 500)}"

Their responses:
${responsesSummary}

As Chairman, evaluate each response and pick the WINNER based on:
1. Accuracy and correctness of the answer
2. Clarity and helpfulness of explanation
3. Relevance and depth of insights provided

Provide your official verdict with detailed reasoning (2-3 sentences explaining WHY the winner's response was best).

Reply with JSON only: {"winner": "ModelName", "reasoning": "Your detailed 2-3 sentence explanation as Chairman Judge"}`;

    const result = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.text || '{"winner": "Unknown", "reasoning": "Unable to determine winner"}';
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { judgeModel, judgeProvider, winner: parsed.winner, reasoning: parsed.reasoning };
    }
    
    return { judgeModel, judgeProvider, winner: validResponses[0].model, reasoning: "First valid response selected as winner." };
  } catch (error) {
    console.error("Error determining winner:", error);
    const fastest = validResponses.sort((a, b) => a.responseTime - b.responseTime)[0];
    return { 
      judgeModel, 
      judgeProvider, 
      winner: fastest?.model || "Unknown", 
      reasoning: `Winner determined by fastest response time (${fastest?.responseTime}ms).` 
    };
  }
}

function generateLogigoArenaUrl(code: string): string {
  // LogiGo doesn't accept code via URL - link to Remote Mode for integration instructions
  return `${LOGIGO_BASE_URL}/remote`;
}

export async function runArena(request: ArenaRequest): Promise<ArenaResult> {
  const { code = "", problemDescription = "", mode = "debug" } = request;
  const problem = problemDescription || (mode === "debug" ? "Debug this code and explain the issue" : "Answer this question");
  const prompt = getPrompt(code, problem, mode);

  console.log(`🏟️ Arena: Starting multi-model comparison (mode: ${mode})...`);

  const responses = await Promise.all([
    queryGemini(prompt),
    queryOpenAI(prompt),
    queryClaude(prompt),
    queryGrok(prompt)
  ]);

  const validCount = responses.filter(r => !r.error).length;
  console.log(`🏟️ Arena: Got ${validCount}/4 valid responses`);

  const judge = await determineWinner(responses, code || problem, mode);

  return {
    request,
    responses,
    winner: judge.winner,
    winnerReason: judge.reasoning,
    judge,
    logigoArenaUrl: code ? generateLogigoArenaUrl(code) : `${LOGIGO_BASE_URL}`,
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

const SAMPLE_CHALLENGES = [
  {
    code: `function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i <= items.length; i++) {
    total += items[i].price;
  }
  return total;
}`,
    problem: "This function throws an error when calculating the total of items. Find the bug!",
    category: "off-by-one"
  },
  {
    code: `async function fetchUsers() {
  const users = await fetch('/api/users');
  return users.map(u => u.name);
}`,
    problem: "This async function fails when trying to get user names. What's wrong?",
    category: "async"
  },
  {
    code: `function reverseString(str) {
  let reversed = "";
  for (let i = str.length; i >= 0; i--) {
    reversed += str[i];
  }
  return reversed;
}`,
    problem: "The reversed string has 'undefined' at the start. Why?",
    category: "off-by-one"
  },
  {
    code: `class Counter {
  constructor() {
    this.count = 0;
  }
  
  increment() {
    setTimeout(function() {
      this.count++;
      console.log(this.count);
    }, 1000);
  }
}`,
    problem: "The counter always logs NaN instead of incrementing. What's the issue?",
    category: "this-context"
  },
  {
    code: `function findMax(numbers) {
  let max = 0;
  for (const num of numbers) {
    if (num > max) {
      max = num;
    }
  }
  return max;
}`,
    problem: "findMax([-5, -2, -10]) returns 0 instead of -2. Debug this!",
    category: "initialization"
  },
  {
    code: `function removeDuplicates(arr) {
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j]) {
        arr.splice(j, 1);
      }
    }
  }
  return arr;
}`,
    problem: "Some duplicates aren't being removed. What's the bug?",
    category: "mutation"
  }
];

export function getRandomChallenge(): { code: string; problem: string; category: string } {
  return SAMPLE_CHALLENGES[Math.floor(Math.random() * SAMPLE_CHALLENGES.length)];
}

export function getAllChallenges(): typeof SAMPLE_CHALLENGES {
  return [...SAMPLE_CHALLENGES];
}

export async function generateAIChallenge(): Promise<{ code: string; problem: string }> {
  try {
    const genAI = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });

    const prompt = `Generate a short JavaScript code snippet (10-15 lines) with a subtle bug. Common bug categories: off-by-one errors, async/await mistakes, this context issues, type coercion bugs, null/undefined handling.

Return JSON only: {"code": "...", "problem": "A 1-sentence description of the symptom (don't reveal the bug)"}`;

    const result = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { code: parsed.code, problem: parsed.problem };
    }
    
    return getRandomChallenge();
  } catch (error) {
    console.error("Error generating AI challenge:", error);
    return getRandomChallenge();
  }
}

export async function runAutoArena(useAI: boolean = false): Promise<{ result: ArenaResult; thread: string[]; challengeSource: string }> {
  let challenge: { code: string; problem: string; category?: string };
  let challengeSource: string;
  
  if (useAI) {
    console.log("🏟️ Auto Arena: Attempting AI-generated challenge...");
    try {
      challenge = await generateAIChallenge();
      challengeSource = "ai-generated";
      console.log("🏟️ Auto Arena: Using AI-generated challenge");
    } catch (error) {
      console.log("🏟️ Auto Arena: AI generation failed, falling back to library");
      challenge = getRandomChallenge();
      challengeSource = "library-fallback";
    }
  } else {
    challenge = getRandomChallenge();
    challengeSource = "library";
    console.log(`🏟️ Auto Arena: Using library challenge (${challenge.category || "unknown"})...`);
  }
  
  const result = await runArena({
    code: challenge.code,
    problemDescription: challenge.problem,
    language: "javascript"
  });
  
  const thread = generateArenaThread(result);
  
  return { result, thread, challengeSource };
}

export const arenaService = {
  runArena,
  generateArenaThread,
  generateLogigoArenaUrl,
  getRandomChallenge,
  getAllChallenges,
  generateAIChallenge,
  runAutoArena
};
