import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Trophy, Clock, AlertCircle, ExternalLink, Zap, MessageSquare, Bug, GitBranch } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ModelResponse {
  model: string;
  provider: string;
  response: string;
  responseTime: number;
  error?: string;
}

interface JudgeVerdict {
  judgeModel: string;
  judgeProvider: string;
  winner: string;
  reasoning: string;
}

interface ArenaResult {
  responses: ModelResponse[];
  winner: string;
  winnerReason: string;
  judge?: JudgeVerdict;
  logicartArenaUrl: string;
}

const MODEL_COLORS: Record<string, string> = {
  "Gemini 3 Flash": "bg-blue-500",
  "GPT-5.2 Thinking": "bg-green-500",
  "Claude Opus 4.5": "bg-purple-500",
  "Grok-4": "bg-orange-500"
};

const MODEL_ICONS: Record<string, string> = {
  "Gemini 3 Flash": "🔮",
  "GPT-5.2 Thinking": "🤖",
  "Claude Opus 4.5": "🧠",
  "Grok-4": "⚡"
};

type ArenaMode = "debug" | "question";

export default function ArenaPage() {
  const [mode, setMode] = useState<ArenaMode>("debug");
  const [code, setCode] = useState(`function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i <= items.length; i++) {
    total += items[i].price;
  }
  return total;
}`);
  const [problem, setProblem] = useState("This function throws an error when calculating the total. Find the bug.");
  const [question, setQuestion] = useState("");

  const arenaMutation = useMutation({
    mutationFn: async (data: { code?: string; problemDescription: string; mode: ArenaMode }) => {
      const response = await apiRequest("POST", "/api/arena/run", data);
      return response.json();
    }
  });

  const handleRunArena = () => {
    if (mode === "debug") {
      arenaMutation.mutate({ code, problemDescription: problem, mode });
    } else {
      arenaMutation.mutate({ code: "", problemDescription: question, mode });
    }
  };

  const result = arenaMutation.data as ArenaResult | undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-5xl">🥊</span>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-red-500 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="title-arena">
              AI Cage Match
            </h1>
            <span className="text-5xl">🥊</span>
          </div>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-6">
            {mode === "debug" 
              ? "4 AI gladiators enter. Only one survives. Who will debug your code best?"
              : "4 AI titans face off. Watch them battle for the best answer!"
            }
          </p>
          
          <div className="flex items-center justify-center gap-4 bg-slate-800/50 rounded-lg p-4 max-w-md mx-auto">
            <div className={`flex items-center gap-2 ${mode === "debug" ? "text-yellow-400" : "text-gray-500"}`}>
              <Bug className="w-5 h-5" />
              <Label htmlFor="mode-toggle" className="cursor-pointer">Debug Code</Label>
            </div>
            <Switch
              id="mode-toggle"
              checked={mode === "question"}
              onCheckedChange={(checked) => {
                setMode(checked ? "question" : "debug");
                arenaMutation.reset();
              }}
              data-testid="switch-mode"
            />
            <div className={`flex items-center gap-2 ${mode === "question" ? "text-purple-400" : "text-gray-500"}`}>
              <MessageSquare className="w-5 h-5" />
              <Label htmlFor="mode-toggle" className="cursor-pointer">Ask Question</Label>
            </div>
          </div>
        </div>

        {mode === "debug" ? (
          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  Your Buggy Code
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Paste code with a bug you want the AI models to find
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="min-h-[200px] font-mono text-sm bg-slate-900 border-slate-600 text-gray-100"
                  placeholder="Paste your buggy code here..."
                  data-testid="input-code"
                />
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  Problem Description
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Describe the bug or error you're experiencing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  className="min-h-[200px] bg-slate-900 border-slate-600 text-gray-100"
                  placeholder="Describe what's going wrong..."
                  data-testid="input-problem"
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto mb-8">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-purple-400" />
                  Your Question
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Ask anything - the AI models will compete to give you the best answer
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="min-h-[200px] bg-slate-900 border-slate-600 text-gray-100"
                  placeholder="What's the best way to structure a React app? How do I optimize database queries? What's the difference between REST and GraphQL?"
                  data-testid="input-question"
                />
              </CardContent>
            </Card>
          </div>
        )}

        <div className="text-center mb-12">
          <Button
            onClick={handleRunArena}
            disabled={arenaMutation.isPending || (mode === "debug" ? !code.trim() : !question.trim())}
            size="lg"
            className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold text-lg px-8 py-6"
            data-testid="button-run-arena"
          >
            {arenaMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                The cage match is underway...
              </>
            ) : (
              <>
                🥊
                {mode === "debug" ? "FIGHT!" : "LET'S RUMBLE!"}
              </>
            )}
          </Button>
        </div>

        {arenaMutation.isError && (
          <Card className="bg-red-900/30 border-red-700 mb-8" data-testid="status-arena-error">
            <CardContent className="pt-6">
              <p className="text-red-300 flex items-center gap-2" data-testid="text-error-message">
                <AlertCircle className="w-5 h-5" />
                Error running arena: {(arenaMutation.error as Error).message}
              </p>
            </CardContent>
          </Card>
        )}

        {result && (
          <div className="space-y-8">
            {/* Contestants Header */}
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white mb-2">🔔 The Contenders Have Spoken! 🔔</h2>
              <p className="text-gray-400">Read their responses, then scroll down for the referee's decision...</p>
            </div>

            {/* Model Responses Grid - FIRST */}
            <div className="grid md:grid-cols-2 gap-6">
              {result.responses.map((response, idx) => (
                <Card
                  key={response.model}
                  className={`bg-slate-800/50 border-slate-700 ${
                    response.model === result.winner ? "ring-2 ring-yellow-400" : ""
                  }`}
                  data-testid={`card-model-${idx}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{MODEL_ICONS[response.model] || "🤖"}</span>
                        <CardTitle className="text-lg text-white">{response.model}</CardTitle>
                        {response.model === result.winner && (
                          <Badge className="bg-yellow-500 text-black">Winner</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-gray-400 text-sm">
                        <Clock className="w-4 h-4" />
                        {(response.responseTime / 1000).toFixed(1)}s
                      </div>
                    </div>
                    <Badge variant="outline" className={`${MODEL_COLORS[response.model] || "bg-gray-500"} text-white border-0 w-fit`}>
                      {response.provider}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    {response.error ? (
                      <p className="text-red-400 flex items-center gap-2" data-testid={`text-model-error-${response.model.toLowerCase().replace(/\s+/g, '-')}`}>
                        <AlertCircle className="w-4 h-4" />
                        {response.error}
                      </p>
                    ) : (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <pre className="bg-slate-900 p-4 rounded-lg overflow-x-auto text-xs text-gray-300 whitespace-pre-wrap">
                          {response.response || "No response"}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Winner Announcement with Referee's Verdict Combined */}
            {result.judge && (
              <Card className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border-yellow-600" data-testid="card-referee">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="text-5xl">🏆</span>
                    <div className="flex-1">
                      <CardTitle className="text-2xl text-yellow-300 flex items-center gap-2" data-testid="text-winner">
                        AND THE WINNER IS... {result.winner}!
                      </CardTitle>
                      <CardDescription className="text-yellow-200/70 text-sm flex items-center gap-2">
                        Official ruling by {result.judge.judgeProvider}
                        <Badge className="bg-yellow-600 text-white">
                          {result.judge.judgeModel}
                        </Badge>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-yellow-950/50 p-4 rounded-lg border border-yellow-700/50">
                    <p className="text-gray-200 italic leading-relaxed" data-testid="text-referee-reasoning">
                      "{result.judge.reasoning}"
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Visualize with LogicArt */}
            {mode === "debug" && code && (
              <div className="text-center py-6" data-testid="logicart-visualize">
                <Button
                  onClick={() => {
                    const winnerResponse = result?.responses.find(r => r.model === result.winner);
                    const codeToVisualize = winnerResponse?.response || code;
                    const encodedCode = encodeURIComponent(codeToVisualize);
                    const logicartUrl = `https://logicart-studio.replit.app?code=${encodedCode}&autorun=true`;
                    window.open(logicartUrl, '_blank');
                  }}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-6 py-3"
                  data-testid="button-visualize"
                >
                  <GitBranch className="w-5 h-5 mr-2" />
                  Visualize Winning Code with LogicArt
                </Button>
                <p className="text-gray-400 text-sm mt-2">
                  💡 See the code's execution flow as a beautiful flowchart
                </p>
              </div>
            )}
          </div>
        )}

        <footer className="mt-16 text-center text-gray-500 text-sm">
          <p>Powered by <strong>LogicArt</strong> - The Art of Logic</p>
        </footer>
      </div>
    </div>
  );
}
