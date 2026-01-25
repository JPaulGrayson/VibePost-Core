import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowRight, 
  ExternalLink, 
  Check, 
  X, 
  Zap, 
  Clock,
  Inbox,
  GitBranch,
  Code,
  Users,
  FileText,
  Bot,
  GraduationCap,
  ChevronDown,
  ChevronUp
} from "lucide-react";

const ORCHESTRATE_VISITED_KEY = "orchestrate_landing_visited";

export default function OrchestrateLanding() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPreview = params.get("preview") === "1";
    if (isPreview) return;
    
    const hasVisited = localStorage.getItem(ORCHESTRATE_VISITED_KEY);
    if (hasVisited) {
      window.location.href = "https://orchestrate.us.com";
    }
  }, []);

  const handleGetOrchestrate = () => {
    localStorage.setItem(ORCHESTRATE_VISITED_KEY, "true");
    window.location.href = "https://orchestrate.us.com";
  };

  const bundles = [
    {
      name: "QUACK",
      subtitle: "Premium",
      description: "Multi-agent messaging",
      color: "bg-yellow-500",
    },
    {
      name: "LOGICART",
      subtitle: "Premium", 
      description: "Code → Flowchart",
      color: "bg-purple-500",
    },
    {
      name: "LOGICPROCESS",
      subtitle: "",
      description: "Visual workflow builder",
      color: "bg-blue-500",
    },
  ];

  const quackFeatures = [
    { feature: "Send/receive messages", free: true, premium: true },
    { feature: "Dashboard UI", free: true, premium: true },
    { feature: "Workflow buttons", free: true, premium: true },
    { feature: "Sound notifications", free: true, premium: true },
    { feature: "Control Room", free: false, premium: true },
    { feature: "Multi-inbox management", free: false, premium: true },
    { feature: "Auto-dispatch (Replit ⚡)", free: false, premium: true },
    { feature: "Toast notifications", free: false, premium: true },
    { feature: "Priority support", free: false, premium: true },
  ];

  const logicArtFeatures = [
    { feature: "Basic flowcharts", free: true, premium: true },
    { feature: "Code → Flowchart", free: true, premium: true },
    { feature: "Advanced visualizations", free: false, premium: true },
    { feature: "Export options", free: false, premium: true },
    { feature: "Team sharing", free: false, premium: true },
    { feature: "API access", free: false, premium: true },
  ];

  const platforms = [
    { name: "Claude", status: "available", features: "Full MCP integration" },
    { name: "Replit", status: "available", features: "Auto-dispatch via webhook", special: true },
    { name: "Cursor", status: "available", features: "Send/receive messages" },
    { name: "ChatGPT", status: "available", features: "Dashboard + API access" },
    { name: "Gemini", status: "available", features: "Dashboard + API access" },
    { name: "VS Code", status: "available", features: "Via Cursor integration" },
    { name: "Grok", status: "coming", features: "Coming soon" },
    { name: "GitHub Copilot", status: "coming", features: "Coming soon" },
    { name: "Windsurf", status: "coming", features: "Coming soon" },
  ];

  const howItWorks = [
    { step: 1, title: "Connect Your Agents", description: "Point your AI tools to Quack. One API, all platforms." },
    { step: 2, title: "Orchestrate from Control Room", description: "See all messages, approve tasks, track progress — one dashboard." },
    { step: 3, title: "Visualize with LogicArt", description: "Turn generated code into flowcharts. Debug faster. Ship with confidence." },
    { step: 4, title: "Automate with LogicProcess", description: "Build visual workflows that coordinate multiple agents automatically." },
  ];

  const useCases = [
    { icon: Code, title: "Development Teams", description: "Claude architects → Cursor implements → Replit deploys → LogicArt documents" },
    { icon: FileText, title: "Content Pipelines", description: "GPT drafts → Claude edits → Gemini fact-checks → You publish" },
    { icon: Bot, title: "AI Automation", description: "Build complex multi-agent workflows where each AI handles what it's best at" },
    { icon: GraduationCap, title: "Learning & Teaching", description: "Visualize how AI-generated code works. Perfect for education and code review." },
  ];

  const faqs = [
    { q: "Can I use Quack without Orchestrate?", a: "Yes! Quack Inbox is free and open source. Use it standalone at quack.us.com or self-host." },
    { q: "Can I use LogicArt without Orchestrate?", a: "Yes! LogicArt Studio is free at logic.art. Upgrade to Premium for advanced features." },
    { q: "Do I need to install anything?", a: "Nope. Everything runs in your browser. Just tell your AI agents about the Quack API." },
    { q: "What AI platforms are supported?", a: "Claude, Replit, Cursor, ChatGPT, Gemini, and more. See full compatibility list above." },
    { q: "Is there a self-hosted option?", a: "Yes! Quack is open source. Self-host for free. LogicArt Studio is also available for self-hosting." },
    { q: "Can I upgrade from LogicArt Premium to Orchestrate?", a: "Yes! Your LogicArt Premium subscription cost will be prorated toward Orchestrate." },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-indigo-900/20">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        
        {/* Hero Section */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center justify-center mb-6">
            <span className="text-7xl">🎛️</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            Orchestrate
          </h1>
          
          <p className="text-2xl md:text-3xl text-indigo-600 dark:text-indigo-400 font-semibold mb-6">
            Your AI Workflow Command Center
          </p>
          
          <div className="max-w-3xl mx-auto mb-8">
            <p className="text-lg text-gray-600 dark:text-gray-300">
              The premium toolkit for developers who use AI agents. Manage multi-agent messaging, 
              visualize code logic, and build automated workflows — all in one place.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all"
              onClick={() => window.open("https://quack.us.com", "_blank")}
            >
              Start Free with Quack
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button 
              size="lg" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all"
              onClick={handleGetOrchestrate}
            >
              Get Orchestrate
              <Zap className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* What's Included - The Bundle */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            The Orchestrate Bundle
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-8">
            Three powerful tools, one subscription
          </p>
          
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 overflow-hidden shadow-xl">
            <div className="bg-indigo-600 text-white text-center py-4">
              <h3 className="text-2xl font-bold">ORCHESTRATE</h3>
              <p className="text-indigo-200">AI Workflow Command Center</p>
            </div>
            <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-700">
              {bundles.map((bundle) => (
                <div key={bundle.name} className="p-6 text-center">
                  <div className={`w-16 h-16 ${bundle.color} rounded-2xl mx-auto mb-4 flex items-center justify-center`}>
                    <span className="text-white font-bold text-2xl">{bundle.name[0]}</span>
                  </div>
                  <h4 className="font-bold text-xl text-gray-900 dark:text-white">{bundle.name}</h4>
                  {bundle.subtitle && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">{bundle.subtitle}</span>
                  )}
                  <p className="mt-2 text-gray-600 dark:text-gray-300">{bundle.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quack Premium */}
        <div className="mb-20">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-4xl">🦆</span>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Quack Premium
            </h2>
          </div>
          <p className="text-center text-xl text-yellow-600 dark:text-yellow-400 font-semibold mb-8">
            Agent Messaging, Supercharged
          </p>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl border shadow-lg overflow-hidden max-w-3xl mx-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-4 text-left text-gray-900 dark:text-white font-semibold">Feature</th>
                  <th className="px-6 py-4 text-center text-gray-900 dark:text-white font-semibold">Free Inbox</th>
                  <th className="px-6 py-4 text-center text-gray-900 dark:text-white font-semibold">Premium</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {quackFeatures.map((item) => (
                  <tr key={item.feature} className={!item.free ? "bg-yellow-50 dark:bg-yellow-900/10" : ""}>
                    <td className="px-6 py-3 text-gray-700 dark:text-gray-300">
                      {!item.free && <span className="font-semibold">{item.feature}</span>}
                      {item.free && item.feature}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {item.free ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <Check className="w-5 h-5 text-green-500 mx-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-8 max-w-3xl mx-auto">
            <Card className="border-2 border-yellow-400 bg-white dark:bg-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <Inbox className="w-6 h-6 text-yellow-500" />
                  Control Room
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-200">
                  Manage all your agent inboxes from one dashboard. See pending tasks across Claude, Replit, Cursor, GPT, and more. 
                  Approve, delegate, and track — without switching tabs.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* LogicArt Premium */}
        <div className="mb-20">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-4xl">🎨</span>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              LogicArt Premium
            </h2>
          </div>
          <p className="text-center text-xl text-purple-600 dark:text-purple-400 font-semibold mb-8">
            See What Your Code Actually Does
          </p>
          
          <p className="text-center text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Turn AI-generated code into interactive flowcharts. Debug visually. Understand logic at a glance.
          </p>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl border shadow-lg overflow-hidden max-w-3xl mx-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-4 text-left text-gray-900 dark:text-white font-semibold">Feature</th>
                  <th className="px-6 py-4 text-center text-gray-900 dark:text-white font-semibold">Free Studio</th>
                  <th className="px-6 py-4 text-center text-gray-900 dark:text-white font-semibold">Premium</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {logicArtFeatures.map((item) => (
                  <tr key={item.feature} className={!item.free ? "bg-purple-50 dark:bg-purple-900/10" : ""}>
                    <td className="px-6 py-3 text-gray-700 dark:text-gray-300">
                      {!item.free && <span className="font-semibold">{item.feature}</span>}
                      {item.free && item.feature}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {item.free ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <Check className="w-5 h-5 text-green-500 mx-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* LogicProcess */}
        <div className="mb-20">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-4xl">⚙️</span>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              LogicProcess
            </h2>
          </div>
          <p className="text-center text-xl text-blue-600 dark:text-blue-400 font-semibold mb-8">
            Build Workflows Visually
          </p>
          
          <p className="text-center text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Create automated workflows by connecting nodes. No code required.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border">
              <GitBranch className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Drag & drop</h4>
                <p className="text-gray-600 dark:text-gray-300 text-sm">workflow builder</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border">
              <Users className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Connect AI agents</h4>
                <p className="text-gray-600 dark:text-gray-300 text-sm">as workflow steps</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border">
              <Zap className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Trigger actions</h4>
                <p className="text-gray-600 dark:text-gray-300 text-sm">based on conditions</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border">
              <Clock className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Monitor progress</h4>
                <p className="text-gray-600 dark:text-gray-300 text-sm">in real-time</p>
              </div>
            </div>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-gray-500 dark:text-gray-400 italic">
              Example: Claude drafts content → GPT reviews → Replit deploys → Slack notifies
            </p>
          </div>
        </div>

        {/* Platform Compatibility */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Platform Compatibility
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-8">
            Works with the AI tools you already use
          </p>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl border shadow-lg overflow-hidden max-w-3xl mx-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-4 text-left text-gray-900 dark:text-white font-semibold">Platform</th>
                  <th className="px-6 py-4 text-center text-gray-900 dark:text-white font-semibold">Status</th>
                  <th className="px-6 py-4 text-left text-gray-900 dark:text-white font-semibold">Features</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {platforms.map((platform) => (
                  <tr key={platform.name} className={platform.special ? "bg-orange-50 dark:bg-orange-900/10" : ""}>
                    <td className="px-6 py-3 text-gray-900 dark:text-white font-medium">
                      {platform.name}
                      {platform.special && <span className="ml-1">⚡</span>}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {platform.status === "available" ? (
                        <Check className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-gray-400">🔜</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600 dark:text-gray-300 text-sm">
                      {platform.features}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-orange-600 dark:text-orange-400 font-medium">
              ⚡ <strong>Replit Special:</strong> Messages approved for Replit trigger automatically — zero manual steps!
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            How It Works
          </h2>
          
          <div className="grid md:grid-cols-4 gap-6">
            {howItWorks.map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h4 className="font-bold text-gray-900 dark:text-white mb-2">{item.title}</h4>
                <p className="text-gray-600 dark:text-gray-300 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Use Cases */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Use Cases
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {useCases.map((useCase) => (
              <Card key={useCase.title} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                      <useCase.icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <CardTitle className="text-lg">{useCase.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">{useCase.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div id="pricing" className="mb-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Pricing
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-12">
            Start building today — no credit card required
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Free Tier */}
            <Card className="border-2 bg-white dark:bg-gray-800">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900 dark:text-white">Free Tools</CardTitle>
                <p className="text-gray-600 dark:text-gray-400">Get started for free</p>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-6">$0</div>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    Quack Inbox
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    LogicArt Studio
                  </li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full mt-6"
                  onClick={() => window.open("https://quack.us.com", "_blank")}
                >
                  Start Free
                </Button>
              </CardContent>
            </Card>

            {/* LogicArt Premium */}
            <Card className="border-2 border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900 dark:text-white">LogicArt Premium</CardTitle>
                <p className="text-gray-600 dark:text-gray-400">Full visualization power</p>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
                  $10<span className="text-lg font-normal text-gray-600 dark:text-gray-400">/month</span>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    Full LogicArt features
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    Export options
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    API access
                  </li>
                </ul>
                <Button 
                  className="w-full mt-6 bg-purple-600 hover:bg-purple-700"
                  onClick={() => window.open("https://logic.art", "_blank")}
                >
                  Get LogicArt
                </Button>
              </CardContent>
            </Card>

            {/* Orchestrate Bundle */}
            <Card className="border-2 border-indigo-400 dark:border-indigo-600 relative overflow-hidden bg-white dark:bg-gray-800">
              <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                BEST VALUE
              </div>
              <CardHeader>
                <CardTitle className="text-xl text-gray-900 dark:text-white">Orchestrate Bundle</CardTitle>
                <p className="text-gray-600 dark:text-gray-400">Everything included</p>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  $20<span className="text-lg font-normal text-gray-600 dark:text-gray-400">/month</span>
                </div>
                <p className="text-sm text-green-600 dark:text-green-400 mb-4">
                  or $199/year (save $41!)
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    Orchestrate Control Room
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    Quack Premium
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    LogicArt Premium
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    LogicProcess
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Check className="w-4 h-4 text-green-500" />
                    Priority support
                  </li>
                </ul>
                <Button className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700" onClick={handleGetOrchestrate}>
                  Get Orchestrate
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            FAQ
          </h2>
          
          <div className="max-w-2xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden"
              >
                <button
                  className="w-full px-6 py-4 text-left flex items-center justify-between"
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  <span className="font-medium text-gray-900 dark:text-white">{faq.q}</span>
                  {openFaq === index ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-4 text-gray-600 dark:text-gray-300">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="mb-16 text-center bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-12">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to Orchestrate Your AI Workflow?
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-8 max-w-xl mx-auto">
            <strong>Free:</strong> Start with Quack Inbox and LogicArt Studio — no credit card required.<br />
            <strong>Premium:</strong> Get the full Orchestrate bundle for $20/month.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="outline"
              className="px-8 py-6 text-lg rounded-xl border-2"
              onClick={() => window.open("https://quack.us.com", "_blank")}
            >
              Start Free
            </Button>
            <Button 
              size="lg" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-6 text-lg rounded-xl shadow-lg"
              onClick={handleGetOrchestrate}
            >
              Get Orchestrate
              <Zap className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-gray-900 dark:text-white font-semibold mb-2">
            Orchestrate — Your AI Workflow Command Center
          </p>
          <div className="flex justify-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
            <a href="https://quack.us.com" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-500 transition-colors">
              Quack
            </a>
            <span>·</span>
            <a href="https://logic.art" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-500 transition-colors">
              LogicArt
            </a>
            <span>·</span>
            <a href="https://github.com/jpaulgrayson" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-500 transition-colors">
              GitHub
            </a>
            <span>·</span>
            <a href="https://x.com/jpaulgrayson" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-500 transition-colors">
              Twitter
            </a>
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            Made with 🦆 by Paul Grayson
          </p>
        </div>
      </div>
    </div>
  );
}
