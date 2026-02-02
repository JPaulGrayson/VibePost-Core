import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Sparkles, Github, Check, Loader2, Clock, Users, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import { SiDiscord } from "react-icons/si";

interface DemoFile {
  name: string;
  description: string;
  path: string;
  lines: number;
  logicartUrl: string;
}

interface FeaturedRepo {
  name: string;
  displayName: string;
  description: string;
  githubUrl: string;
  demoFiles: DemoFile[];
  insights?: string[];
}

const FEATURED_REPOS: FeaturedRepo[] = [
  {
    name: "openclaw",
    displayName: "OpenClaw",
    description: "AI agent framework with sophisticated auth rotation and context management",
    githubUrl: "https://github.com/openclaw/openclaw",
    demoFiles: [
      {
        name: "Agent Runner",
        description: "Core execution loop with auth rotation",
        path: "src/agents/pi-embedded-runner/run.ts",
        lines: 692,
        logicartUrl: "https://logic.art/?github=openclaw/openclaw&path=src/agents/pi-embedded-runner/run.ts"
      },
      {
        name: "Context Compaction",
        description: "How conversation history gets compressed",
        path: "src/agents/pi-embedded-runner/compact.ts",
        lines: 489,
        logicartUrl: "https://logic.art/?github=openclaw/openclaw&path=src/agents/pi-embedded-runner/compact.ts"
      },
      {
        name: "Failover Logic",
        description: "Error classification and retry flow",
        path: "src/agents/failover-error.ts",
        lines: 203,
        logicartUrl: "https://logic.art/?github=openclaw/openclaw&path=src/agents/failover-error.ts"
      }
    ],
    insights: [
      "Sophisticated auth profile rotation with cooldown tracking",
      "Auto-compaction on context overflow (users don't need /compact manually)",
      "Anthropic magic string scrubbing to prevent test token poisoning",
      "47 unique execution paths in the agent runner",
      "Clean error classification taxonomy (billing/rate limit/auth/timeout)"
    ]
  },
  {
    name: "autogpt",
    displayName: "AutoGPT",
    description: "Autonomous AI agent that can complete complex tasks",
    githubUrl: "https://github.com/Significant-Gravitas/AutoGPT",
    demoFiles: [
      {
        name: "Agent Core",
        description: "Main agent execution loop",
        path: "autogpt/agent/agent.py",
        lines: 500,
        logicartUrl: "https://logic.art/?github=Significant-Gravitas/AutoGPT&path=autogpt/agent/agent.py"
      }
    ]
  },
  {
    name: "langchain",
    displayName: "LangChain",
    description: "Framework for developing applications powered by language models",
    githubUrl: "https://github.com/langchain-ai/langchain",
    demoFiles: [
      {
        name: "Agent Executor",
        description: "Agent execution and tool calling",
        path: "libs/langchain/langchain/agents/agent.py",
        lines: 400,
        logicartUrl: "https://logic.art/?github=langchain-ai/langchain&path=libs/langchain/langchain/agents/agent.py"
      }
    ]
  }
];

interface DiscordServer {
  name: string;
  members: string;
  inviteLink: string;
  channels: string[];
  audience: string;
  tier: number;
  note?: string;
}

const DISCORD_SERVERS: DiscordServer[] = [
  {
    name: "OpenClaw",
    members: "Active",
    inviteLink: "https://discord.com/invite/clawd",
    channels: ["#showcase", "#dev-tools"],
    audience: "Showcase their own code - instant relevance",
    tier: 1
  },
  {
    name: "AutoGPT",
    members: "~56K",
    inviteLink: "https://discord.com/invite/autogpt",
    channels: ["#showcase", "#projects"],
    audience: "Agentic AI community",
    tier: 1
  },
  {
    name: "OpenAI",
    members: "~850K",
    inviteLink: "https://discord.com/invite/openai",
    channels: ["#showcase", "#resources"],
    audience: "AI builders, massive audience",
    tier: 1
  },
  {
    name: "Hugging Face",
    members: "~200K",
    inviteLink: "https://hf.co/join/discord",
    channels: ["#show-and-tell", "#dev-tools"],
    audience: "Open-source AI, very technical",
    tier: 2
  },
  {
    name: "The Programmer's Hangout",
    members: "~205K",
    inviteLink: "https://discord.com/invite/programming",
    channels: ["#i-made-this", "#resources"],
    audience: "General devs, non-AI-hype perspective",
    tier: 2
  },
  {
    name: "Friends of Replit",
    members: "~20K",
    inviteLink: "https://discord.gg/friendsofreplit",
    channels: ["#made-with-replit", "#showcase"],
    audience: "Vibe coders, deployment platform",
    tier: 3
  }
];

type AudienceType = "openclaw" | "ai_agent" | "general_dev" | "replit";

const AUDIENCE_TEMPLATES: Record<AudienceType, {
  name: string;
  description: string;
  servers: string[];
  generatePost: (repo: FeaturedRepo, selectedFile?: DemoFile) => string;
}> = {
  openclaw: {
    name: "OpenClaw Specific",
    description: "For the OpenClaw Discord - contribution-first tone",
    servers: ["OpenClaw"],
    generatePost: (repo, selectedFile) => {
      const files = repo.demoFiles;
      return `Made some flowchart views of OpenClaw to help visualize how it works 🦞

🔗 **Agent Runner** — Core execution loop with auth rotation
${files[0]?.logicartUrl || "https://logic.art"}

🔗 **Context Compaction** — How conversation history gets compressed
${files[1]?.logicartUrl || "https://logic.art"}

🔗 **Failover Logic** — Error classification and retry flow
${files[2]?.logicartUrl || "https://logic.art"}

**A few interesting patterns I noticed:**
- Sophisticated auth profile rotation with cooldown tracking
- Auto-compaction on context overflow
- Anthropic magic string scrubbing

Works with any public GitHub file — just swap repo/path:
\`logic.art/?github=owner/repo&path=src/file.ts\`

Thought it might be useful for contributors! Open source: github.com/JPaulGrayson/Logicart`;
    }
  },
  ai_agent: {
    name: "AI/Agent Servers",
    description: "For LangChain, AutoGPT, OpenAI communities",
    servers: ["AutoGPT", "OpenAI", "Hugging Face"],
    generatePost: (repo, selectedFile) => {
      const file = selectedFile || repo.demoFiles[0];
      return `Built a tool that turns TypeScript/JavaScript into interactive flowcharts. Useful for understanding complex agent codebases.

Example: Here's OpenClaw's agent runner visualized — 47 unique execution paths:
${file?.logicartUrl || "https://logic.art/?github=openclaw/openclaw&path=src/agents/pi-embedded-runner/run.ts"}

Features:
- Complexity analysis
- Bug detection
- Execution path counting
- Works with any public GitHub file

Try your own repo: \`logic.art/?github=owner/repo&path=src/file.ts\`

Open source: github.com/JPaulGrayson/Logicart`;
    }
  },
  general_dev: {
    name: "General Dev Servers",
    description: "For Programmer's Hangout and general coding communities",
    servers: ["The Programmer's Hangout"],
    generatePost: (repo, selectedFile) => {
      const file = selectedFile || repo.demoFiles[0];
      return `Code visualization tool for TypeScript/JavaScript 📊

Paste any GitHub URL → get an interactive flowchart

Useful for:
- Onboarding to unfamiliar codebases
- Code review
- Understanding complex control flow
- Finding redundant logic paths

Example (OpenClaw's agent runner):
${file?.logicartUrl || "https://logic.art/?github=openclaw/openclaw&path=src/agents/pi-embedded-runner/run.ts"}

Works with any public repo: \`logic.art/?github=owner/repo&path=src/file.ts\`

Open source: github.com/JPaulGrayson/Logicart`;
    }
  },
  replit: {
    name: "Replit Discord",
    description: "For Friends of Replit and Replit communities",
    servers: ["Friends of Replit"],
    generatePost: (repo, selectedFile) => {
      return `Made with Replit: LogicArt — code visualization tool 🎨

Turns TypeScript/JavaScript into interactive flowcharts. Just added GitHub deeplinks so you can visualize any public repo instantly.

Example: \`logic.art/?github=owner/repo&path=src/file.ts\`

Features beyond visualization:
- Complexity scoring
- Execution path analysis
- Bug detection
- Model Arena (compare AI models)

Built and deployed on Replit. Open source: github.com/JPaulGrayson/Logicart`;
    }
  }
};

export default function DiscordCampaign() {
  const { toast } = useToast();
  const [selectedRepo, setSelectedRepo] = useState<FeaturedRepo | null>(FEATURED_REPOS[0]);
  const [selectedFile, setSelectedFile] = useState<DemoFile | null>(FEATURED_REPOS[0]?.demoFiles[0] || null);
  const [selectedAudience, setSelectedAudience] = useState<AudienceType>("openclaw");
  const [generatedContent, setGeneratedContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showStrategyTips, setShowStrategyTips] = useState(false);

  const generateShowcaseContent = () => {
    if (!selectedRepo) {
      toast({
        title: "Select a repository",
        description: "Choose a featured repo first",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    
    setTimeout(() => {
      const template = AUDIENCE_TEMPLATES[selectedAudience];
      const content = template.generatePost(selectedRepo, selectedFile || undefined);
      setGeneratedContent(content);
      setIsGenerating(false);
    }, 500);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedContent);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Post content copied to clipboard. Paste it in Discord!"
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Please select and copy the text manually",
        variant: "destructive"
      });
    }
  };

  const selectRepo = (repo: FeaturedRepo) => {
    setSelectedRepo(repo);
    setSelectedFile(repo.demoFiles[0] || null);
  };

  return (
    <>
      <header className="bg-card shadow-sm border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <SiDiscord className="text-indigo-500" />
              LogicArt Discord Campaign
            </h2>
            <p className="text-muted-foreground mt-1">
              Create showcase posts for AI/dev Discord communities
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Github className="h-3 w-3" />
              logic.art
            </Badge>
            <Badge variant="secondary">Open Source</Badge>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                Select Repository & Demo Files
              </CardTitle>
              <CardDescription>
                OpenClaw is the primary showcase - you're visualizing their own code for maximum authenticity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {FEATURED_REPOS.map((repo) => (
                  <div
                    key={repo.name}
                    onClick={() => selectRepo(repo)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                      selectedRepo?.name === repo.name 
                        ? "border-indigo-400 bg-indigo-700" 
                        : "border-gray-700 bg-black hover:border-indigo-400"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-white">{repo.displayName}</span>
                      {repo.name === "openclaw" && (
                        <Badge className="bg-green-500 text-white text-xs">Primary</Badge>
                      )}
                    </div>
                    <p className="text-sm text-white line-clamp-2 mb-2">
                      {repo.description}
                    </p>
                    <div className="text-sm text-white">
                      {repo.demoFiles.length} demo files
                    </div>
                  </div>
                ))}
              </div>

              {selectedRepo && selectedRepo.demoFiles.length > 0 && (
                <div className="mt-4 p-4 bg-black rounded-lg">
                  <h4 className="font-bold mb-3 text-white text-base">Working Demo URLs (verified)</h4>
                  <div className="space-y-2">
                    {selectedRepo.demoFiles.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                          selectedFile?.path === file.path
                            ? "bg-indigo-700 border-2 border-indigo-400"
                            : "bg-gray-900 hover:bg-gray-800 border border-gray-700"
                        }`}
                      >
                        <div>
                          <div className="font-bold text-base text-white">{file.name}</div>
                          <div className="text-sm text-white">{file.description}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-indigo-600 text-white text-sm font-bold border-0">{file.lines} lines</Badge>
                          <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700" asChild onClick={(e) => e.stopPropagation()}>
                            <a href={file.logicartUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRepo?.insights && (
                <div className="mt-4 p-4 bg-black rounded-lg border-2 border-amber-400">
                  <h4 className="font-bold mb-2 flex items-center gap-2 text-amber-300 text-base">
                    <Lightbulb className="h-5 w-5 text-amber-300" />
                    Key Insights from Analysis
                  </h4>
                  <ul className="text-sm space-y-1">
                    {selectedRepo.insights.map((insight, i) => (
                      <li key={i} className="text-white">• {insight}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Target Audience</CardTitle>
              <CardDescription>
                Each audience gets a tailored post - contribution first, promotion second
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedAudience} onValueChange={(v) => setSelectedAudience(v as AudienceType)}>
                <TabsList className="grid w-full grid-cols-4">
                  {Object.entries(AUDIENCE_TEMPLATES).map(([key, template]) => (
                    <TabsTrigger key={key} value={key} className="text-xs">
                      {template.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {Object.entries(AUDIENCE_TEMPLATES).map(([key, template]) => (
                  <TabsContent key={key} value={key} className="mt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                      <div className="flex gap-1">
                        {template.servers.map((server) => (
                          <Badge key={server} variant="outline" className="text-xs">{server}</Badge>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>

              <Button 
                onClick={generateShowcaseContent}
                disabled={isGenerating || !selectedRepo}
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Discord Post
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {generatedContent && (
            <Card className="border-indigo-200 bg-indigo-50/50 dark:bg-indigo-900/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <SiDiscord className="text-indigo-500" />
                    Generated Post
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyToClipboard}
                    className="gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 text-green-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy to Clipboard
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-[#36393f] rounded-lg p-4 text-white font-sans text-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                      JP
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-white">JPaulGrayson</span>
                        <span className="text-gray-400 text-xs">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-gray-100 leading-relaxed break-words">
                        {generatedContent}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Target Discord Servers
                </CardTitle>
                <Badge variant="outline">Some require verification</Badge>
              </div>
              <CardDescription>
                Servers organized by tier - start with Tier 1 for maximum authenticity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((tier) => (
                  <div key={tier}>
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <Badge variant={tier === 1 ? "default" : "secondary"}>Tier {tier}</Badge>
                      {tier === 1 && "Primary - AI/Agent Communities"}
                      {tier === 2 && "Technical/ML Communities"}
                      {tier === 3 && "Platform-Specific"}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {DISCORD_SERVERS.filter(s => s.tier === tier).map((server) => (
                        <div key={server.name} className="p-3 border border-gray-700 rounded-lg bg-black">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-white">{server.name}</span>
                            <Badge className="bg-indigo-600 text-white text-xs border-0">{server.members}</Badge>
                          </div>
                          <p className="text-sm text-white mb-2">{server.audience}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1 flex-wrap">
                              {server.channels.slice(0, 2).map((ch) => (
                                <Badge className="bg-gray-700 text-white text-xs border-0">{ch}</Badge>
                              ))}
                            </div>
                            <Button variant="ghost" size="sm" className="text-white hover:bg-gray-800" asChild>
                              <a href={server.inviteLink} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowStrategyTips(!showStrategyTips)}
              >
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Posting Strategy Tips
                </CardTitle>
                {showStrategyTips ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
            {showStrategyTips && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-black border border-blue-500 rounded-lg">
                    <h4 className="font-bold mb-2 text-blue-400">Suggested Order</h4>
                    <ol className="text-sm space-y-1 list-decimal list-inside text-white">
                      <li><strong>OpenClaw Discord</strong> — Most authentic, you're showcasing their code</li>
                      <li><strong>LangChain / AutoGPT</strong> — Agent tool builders, natural fit</li>
                      <li><strong>OpenAI Developer Community</strong> — Broader AI audience</li>
                      <li><strong>Replit Discord</strong> — Home platform, supportive community</li>
                      <li><strong>Hugging Face / Programmer's Hangout</strong> — Based on bandwidth</li>
                    </ol>
                  </div>
                  <div className="p-4 bg-black border border-green-500 rounded-lg">
                    <h4 className="font-bold mb-2 text-green-400">Timing Tips</h4>
                    <ul className="text-sm space-y-1 text-white">
                      <li>• Post during active hours (US morning/afternoon)</li>
                      <li>• Don't spam multiple channels in same server</li>
                      <li>• Wait for engagement before posting to next server</li>
                      <li>• Respond to comments to build relationships</li>
                    </ul>
                  </div>
                </div>
                <div className="p-4 bg-black border border-amber-500 rounded-lg">
                  <h4 className="font-bold mb-2 text-amber-400">Tone Guidance</h4>
                  <ul className="text-sm space-y-1 text-white">
                    <li>• <strong>Contribution first, promotion second</strong></li>
                    <li>• Frame as "I visualized X and noticed some interesting patterns"</li>
                    <li>• Collaborative tone, NOT "I found your bugs"</li>
                    <li>• Let the quality of the analysis speak for itself</li>
                    <li>• Offer value before asking for anything</li>
                  </ul>
                </div>
                <div className="p-4 bg-black border border-purple-500 rounded-lg">
                  <h4 className="font-bold mb-2 text-purple-400">Quick Start Checklist (Per Server)</h4>
                  <ul className="text-sm space-y-1 text-white">
                    <li>☐ Click invite link</li>
                    <li>☐ Complete any verification steps (some servers require this)</li>
                    <li>☐ Read #rules or #welcome channel</li>
                    <li>☐ Find #showcase or #i-made-this channel</li>
                    <li>☐ Post your LogicArt content</li>
                    <li>☐ Engage with responses</li>
                  </ul>
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">Note: LangChain uses Slack</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    LangChain primarily uses Slack instead of Discord. Consider posting there too.
                  </p>
                </div>
                <Button variant="outline" asChild>
                  <a href="https://langchain.com/join-community" target="_blank" rel="noopener noreferrer">
                    Join LangChain Slack
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </>
  );
}
