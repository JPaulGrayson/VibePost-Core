import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Sparkles, Github, Check, Loader2 } from "lucide-react";
import { SiDiscord } from "react-icons/si";

interface GitHubRepo {
  name: string;
  description: string;
  url: string;
  stars: number;
  language: string;
}

const FEATURED_REPOS = [
  {
    name: "anthropic-claude-tools",
    description: "Official Claude tools and SDK for building AI applications",
    url: "https://github.com/anthropics/anthropic-sdk-python",
    stars: 15000,
    language: "Python"
  },
  {
    name: "LangChain",
    description: "Framework for developing applications powered by language models",
    url: "https://github.com/langchain-ai/langchain",
    stars: 75000,
    language: "Python"
  },
  {
    name: "AutoGPT",
    description: "Autonomous AI agent that can complete complex tasks",
    url: "https://github.com/Significant-Gravitas/AutoGPT",
    stars: 158000,
    language: "Python"
  },
  {
    name: "OpenDevin",
    description: "Platform for AI software engineers and development agents",
    url: "https://github.com/OpenDevin/OpenDevin",
    stars: 25000,
    language: "Python"
  },
  {
    name: "Crew AI",
    description: "Framework for orchestrating role-playing AI agents",
    url: "https://github.com/joaomdmoura/crewAI",
    stars: 12000,
    language: "Python"
  }
];

const DISCORD_TEMPLATES = {
  showcase: {
    name: "Showcase Post",
    description: "For #showcase and #i-made-this channels",
    template: (repo: string, description: string, logicartUrl: string) => `**LogicArt Code Visualization: ${repo}**

I ran the ${repo} codebase through LogicArt to visualize its architecture and code flow.

${description}

**What you're seeing:**
- Function dependencies mapped as flowing connections
- Color-coded by complexity and call frequency  
- Interactive zoom into any module

**Try it yourself:** ${logicartUrl}

Built with LogicArt - turning code into visual stories.`
  },
  technical: {
    name: "Technical Deep-Dive",
    description: "For developer-focused channels",
    template: (repo: string, description: string, logicartUrl: string) => `**Code Architecture Breakdown: ${repo}**

Just visualized the ${repo} source with LogicArt - here's what the dependency graph reveals:

${description}

**Key insights from the visualization:**
- Entry points clearly visible
- Cyclic dependencies highlighted
- Module boundaries easy to trace

Perfect for code review, onboarding, or understanding legacy code.

**Interactive version:** ${logicartUrl}`
  },
  casual: {
    name: "Casual Share",
    description: "For general chat channels",
    template: (repo: string, description: string, logicartUrl: string) => `Just turned ${repo} into art

${description}

There's something satisfying about seeing code as a visual network. You can actually *see* how functions call each other.

Link if you want to explore: ${logicartUrl}`
  }
};

type TemplateKey = keyof typeof DISCORD_TEMPLATES;

export default function DiscordCampaign() {
  const { toast } = useToast();
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [customRepoUrl, setCustomRepoUrl] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>("showcase");
  const [customDescription, setCustomDescription] = useState("");
  const [logicartUrl, setLogicartUrl] = useState("https://vibeappz.com/logicart");
  const [generatedContent, setGeneratedContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateShowcaseContent = () => {
    if (!selectedRepo && !customRepoUrl) {
      toast({
        title: "Select a repository",
        description: "Choose a featured repo or enter a custom GitHub URL",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    
    setTimeout(() => {
      const repoName = selectedRepo?.name || customRepoUrl.split("/").pop() || "Repository";
      const description = customDescription || selectedRepo?.description || "An amazing open-source project";
      
      const template = DISCORD_TEMPLATES[selectedTemplate];
      const content = template.template(repoName, description, logicartUrl);
      
      setGeneratedContent(content);
      setIsGenerating(false);
    }, 800);
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

  const selectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setCustomRepoUrl("");
    setCustomDescription(repo.description);
  };

  return (
    <>
      <header className="bg-card shadow-sm border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <SiDiscord className="text-indigo-500" />
              Discord Campaign
            </h2>
            <p className="text-muted-foreground mt-1">
              Create LogicArt showcase posts for Discord communities
            </p>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                Select GitHub Repository
              </CardTitle>
              <CardDescription>
                Choose a popular open-source repo or enter a custom GitHub URL
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {FEATURED_REPOS.map((repo) => (
                  <div
                    key={repo.name}
                    onClick={() => selectRepo(repo)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                      selectedRepo?.name === repo.name 
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" 
                        : "border-gray-200 hover:border-indigo-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{repo.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {repo.language}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {repo.description}
                    </p>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <span>⭐</span>
                      <span>{(repo.stars / 1000).toFixed(0)}k</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-sm text-muted-foreground">or enter custom URL</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <Input
                placeholder="https://github.com/owner/repo"
                value={customRepoUrl}
                onChange={(e) => {
                  setCustomRepoUrl(e.target.value);
                  setSelectedRepo(null);
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Post Template</CardTitle>
              <CardDescription>
                Choose a template style for different Discord channel types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v as TemplateKey)}>
                <TabsList className="grid w-full grid-cols-3">
                  {Object.entries(DISCORD_TEMPLATES).map(([key, template]) => (
                    <TabsTrigger key={key} value={key}>
                      {template.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {Object.entries(DISCORD_TEMPLATES).map(([key, template]) => (
                  <TabsContent key={key} value={key} className="mt-4">
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customize Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Description</label>
                <Textarea
                  placeholder="Custom description for this repository..."
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">LogicArt URL</label>
                <Input
                  placeholder="https://vibeappz.com/logicart"
                  value={logicartUrl}
                  onChange={(e) => setLogicartUrl(e.target.value)}
                />
              </div>
              <Button 
                onClick={generateShowcaseContent}
                disabled={isGenerating}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
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
                    <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
                      L
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white">LogicArt Bot</span>
                        <Badge className="bg-indigo-500 text-white text-xs px-1.5 py-0">BOT</Badge>
                        <span className="text-gray-400 text-xs">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-gray-100 leading-relaxed">
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
              <CardTitle>Recommended Discord Servers</CardTitle>
              <CardDescription>
                Post your LogicArt showcase in these communities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { name: "OpenAI Developer Community", channel: "#showcase", audience: "AI builders" },
                  { name: "Hugging Face", channel: "#show-and-tell", audience: "Open-source AI" },
                  { name: "LangChain Discord", channel: "#showcase", audience: "Agent developers" },
                  { name: "The Programmer's Hangout", channel: "#i-made-this", audience: "General devs" },
                ].map((server) => (
                  <div key={server.name} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium text-sm">{server.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {server.channel} • {server.audience}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a 
                        href="https://discord.com/invite" 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </>
  );
}
