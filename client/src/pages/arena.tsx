import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, Clock, AlertCircle, ExternalLink, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ModelResponse {
  model: string;
  provider: string;
  response: string;
  responseTime: number;
  error?: string;
}

interface ArenaResult {
  responses: ModelResponse[];
  winner: string;
  winnerReason: string;
  code: string;
  arenaUrl: string;
}

const MODEL_COLORS: Record<string, string> = {
  "Gemini 2.5": "bg-blue-500",
  "GPT-4o": "bg-green-500",
  "Claude Sonnet": "bg-purple-500",
  "Grok 2": "bg-orange-500"
};

const MODEL_ICONS: Record<string, string> = {
  "Gemini 2.5": "🔮",
  "GPT-4o": "🤖",
  "Claude Sonnet": "🧠",
  "Grok 2": "⚡"
};

export default function ArenaPage() {
  const [code, setCode] = useState(`function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i <= items.length; i++) {
    total += items[i].price;
  }
  return total;
}`);
  const [problem, setProblem] = useState("This function throws an error when calculating the total. Find the bug.");

  const arenaMutation = useMutation({
    mutationFn: async (data: { code: string; problemDescription: string }) => {
      const response = await apiRequest("POST", "/api/arena/run", data);
      return response.json();
    }
  });

  const handleRunArena = () => {
    arenaMutation.mutate({ code, problemDescription: problem });
  };

  const result = arenaMutation.data as ArenaResult | undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Trophy className="w-12 h-12 text-yellow-400" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 bg-clip-text text-transparent" data-testid="title-arena">
              AI Debug Arena
            </h1>
            <Trophy className="w-12 h-12 text-yellow-400" />
          </div>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Watch the world's top AI models compete to find bugs in your code. 
            See which model gives the best debugging advice!
          </p>
        </div>

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

        <div className="text-center mb-12">
          <Button
            onClick={handleRunArena}
            disabled={arenaMutation.isPending || !code.trim()}
            size="lg"
            className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold text-lg px-8 py-6"
            data-testid="button-run-arena"
          >
            {arenaMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Models are competing...
              </>
            ) : (
              <>
                <Trophy className="mr-2 h-5 w-5" />
                Start Debug Battle!
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
            <Card className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border-yellow-600">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Trophy className="w-10 h-10 text-yellow-400" />
                    <div>
                      <CardTitle className="text-2xl text-yellow-300" data-testid="text-winner">
                        🏆 Winner: {result.winner}
                      </CardTitle>
                      <CardDescription className="text-yellow-200/70" data-testid="text-winner-reason">
                        {result.winnerReason}
                      </CardDescription>
                    </div>
                  </div>
                  <a
                    href={result.arenaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-white font-medium transition-colors"
                    data-testid="link-logigo"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View in LogiGo
                  </a>
                </div>
              </CardHeader>
            </Card>

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

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <h3 className="text-xl font-semibold text-white">
                    Want to see how your code executes step-by-step?
                  </h3>
                  <p className="text-gray-400">
                    LogiGo visualizes your code execution in real-time, helping you understand exactly where bugs occur.
                  </p>
                  <a
                    href={result.arenaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-6 py-3 rounded-lg text-white font-bold transition-colors"
                    data-testid="link-logigo-cta"
                  >
                    <ExternalLink className="w-5 h-5" />
                    Try LogiGo Free
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <footer className="mt-16 text-center text-gray-500 text-sm">
          <p>Powered by LogiGo - Code visualization that makes debugging intuitive</p>
        </footer>
      </div>
    </div>
  );
}
