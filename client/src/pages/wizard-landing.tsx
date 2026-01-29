import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  Sparkles,
  Wand2,
  MessageSquare,
  GitBranch,
  Palette,
  Zap,
  CheckCircle2
} from "lucide-react";
import { trackPageView, trackEvent } from "@/lib/tracking";

export default function WizardLanding() {
  // Track page view on mount
  useEffect(() => {
    trackPageView('wizardofquack');
  }, []);

  const [quackFeedback, setQuackFeedback] = useState<{ x: number; y: number } | null>(null);
  const lastQuackTime = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playQuack = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    // 400ms cooldown
    if (now - lastQuackTime.current < 400) return;
    lastQuackTime.current = now;

    // Get click position relative to the container
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top - 30; // Offset above click point

    // Show visual feedback
    setQuackFeedback({ x, y });
    setTimeout(() => setQuackFeedback(null), 800);

    // Play sound
    if (!audioRef.current) {
      audioRef.current = new Audio('https://quack.us.com/sounds/receive.mp3');
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {
      console.log('Audio play blocked');
    });
  }, []);

  const handleGetStarted = (url: string) => {
    window.location.href = url;
  };

  const products = [
    {
      name: "Quack",
      emoji: "🦆",
      tagline: "Agent-to-Agent Messaging",
      description: "Stop copy/pasting between AI tools. Let your agents talk directly to each other.",
      color: "bg-yellow-500",
      borderColor: "border-yellow-400",
      features: ["Multi-platform messaging", "Control Room dashboard", "Auto-dispatch for Replit"],
      url: "https://quack.us.com",
      landingUrl: "https://x.quack.us.com",
      cta: "Try Quack Free"
    },
    {
      name: "LogicArt",
      emoji: "🎨",
      tagline: "The Art of Logic",
      description: "Turn AI-generated code into beautiful, interactive flowcharts instantly.",
      color: "bg-purple-500",
      borderColor: "border-purple-400",
      features: ["Code → Flowchart", "Visual debugging", "Export & share"],
      url: "https://logic.art",
      landingUrl: "https://logic.art/landing.html",
      cta: "Try LogicArt Free"
    },
    {
      name: "Orchestrate",
      emoji: "🎛️",
      tagline: "AI Workflow Command Center",
      description: "The premium bundle: Quack + LogicArt + LogicProcess. Everything you need.",
      color: "bg-indigo-500",
      borderColor: "border-indigo-400",
      features: ["All premium features", "LogicProcess workflows", "Priority support"],
      url: "https://orchestrate.us.com",
      landingUrl: "https://x.orchestrate.us.com",
      cta: "Get Orchestrate",
      premium: true
    }
  ];

  const painPoints = [
    { icon: MessageSquare, text: "Tired of copy/pasting between Claude, GPT, and Cursor?" },
    { icon: GitBranch, text: "Can't understand AI-generated code at a glance?" },
    { icon: Zap, text: "Want your AI agents to work together automatically?" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950">
      <div className="container mx-auto px-4 py-12 max-w-6xl">

        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center mb-6 relative">
            <img
              src="/images/wizard-hero.png"
              alt="The Wizard of Quack"
              className="w-48 h-48 object-contain drop-shadow-2xl"
            />
            <span className="text-5xl absolute -right-2 bottom-0">🦆</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4">
            Wizard of Quack
          </h1>

          <p className="text-2xl md:text-3xl text-yellow-400 font-semibold mb-6">
            <Sparkles className="inline w-6 h-6 mr-2" />
            AI Agent Magic, Simplified
            <Sparkles className="inline w-6 h-6 ml-2" />
          </p>

          <div className="max-w-3xl mx-auto mb-8">
            <p className="text-xl text-gray-300">
              A suite of tools for developers who vibe with AI.
              Make your agents communicate, visualize their code, and orchestrate workflows — like magic.
            </p>
          </div>

          {/* Architecture Diagrams - Side by Side Comparison */}
          <div className="mt-12">
            <h3 className="text-2xl font-bold text-white mb-2 text-center">Choose Your Conductor</h3>
            <p className="text-gray-400 text-center mb-6">Same Quack message bus. Your choice of AI orchestrator.</p>
            
            <div className="flex flex-wrap justify-center gap-8 max-w-6xl mx-auto items-start">
              {/* Claude Conductor */}
              <div className="relative group flex flex-col items-center">
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                  <span className="bg-orange-500 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg">
                    Deep Reasoning Mode
                  </span>
                </div>
                <div className="w-96 h-96 overflow-hidden rounded-2xl shadow-2xl">
                  <img
                    src="/images/wizard-architecture.jpg"
                    alt="Claude as Conductor - Deep Reasoning Architecture"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="mt-3 text-center">
                  <p className="text-orange-400 font-semibold">Claude Conductor</p>
                  <p className="text-gray-400 text-sm">Best for complex analysis & planning</p>
                </div>
              </div>

              {/* Grok Conductor */}
              <div className="relative group flex flex-col items-center" onClick={playQuack}>
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                  <span className="bg-green-500 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg flex items-center gap-1">
                    Fast Messaging Mode
                    <span className="animate-pulse">⚡</span>
                  </span>
                </div>
                <div className="w-96 h-96 overflow-hidden rounded-2xl shadow-2xl cursor-pointer">
                  <img
                    src="/images/wizard-architecture-grok.jpg"
                    alt="Grok as Conductor - Fast Messaging Architecture"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="mt-3 text-center">
                  <p className="text-green-400 font-semibold">Grok Conductor</p>
                  <p className="text-gray-400 text-sm">Best for fast automation & X integration</p>
                </div>

                {/* Quack feedback bubble */}
                {quackFeedback && (
                  <div
                    className="absolute pointer-events-none text-2xl"
                    style={{
                      left: quackFeedback.x,
                      top: quackFeedback.y,
                      animation: 'quackBubble 0.8s ease-out forwards'
                    }}
                  >
                    🦆 Quack!
                  </div>
                )}
              </div>
            </div>

            <style>{`
              @keyframes quackBubble {
                0% { opacity: 1; transform: translateY(0) scale(1); }
                50% { opacity: 1; transform: translateY(-30px) scale(1.2); }
                100% { opacity: 0; transform: translateY(-60px) scale(0.8); }
              }
            `}</style>

            <p className="text-center text-yellow-400 mt-6 text-sm font-medium">
              🦆 Click the Grok diagram to quack!
            </p>
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center text-white mb-8">
            Sound familiar?
          </h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {painPoints.map((point, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/10 backdrop-blur rounded-xl p-4">
                <point.icon className="w-8 h-8 text-yellow-400 flex-shrink-0" />
                <p className="text-gray-200">{point.text}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-yellow-400 font-semibold text-xl mt-8">
            <Wand2 className="inline w-5 h-5 mr-2" />
            We've got spells for that.
          </p>
        </div>

        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-white mb-4">
            Choose Your Magic
          </h2>
          <p className="text-center text-gray-400 mb-10">
            Start free, upgrade when you need more power
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {products.map((product) => (
              <Card
                key={product.name}
                className={`bg-gray-900/80 backdrop-blur border-2 ${product.borderColor} ${product.premium ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-indigo-950' : ''}`}
              >
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-12 h-12 ${product.color} rounded-xl flex items-center justify-center`}>
                      <span className="text-2xl">{product.emoji}</span>
                    </div>
                    <div>
                      <CardTitle className="text-xl text-white">{product.name}</CardTitle>
                      {product.premium && (
                        <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full font-bold">PREMIUM BUNDLE</span>
                      )}
                    </div>
                  </div>
                  <CardDescription className="text-gray-300 font-medium">
                    {product.tagline}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-400 text-sm mb-4">
                    {product.description}
                  </p>
                  <ul className="space-y-2 mb-6">
                    {product.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-gray-300">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-2">
                    <Button
                      className={`w-full ${product.color} hover:opacity-90 text-white font-bold`}
                      onClick={() => handleGetStarted(product.url)}
                    >
                      {product.cta}
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full text-gray-400 hover:text-white hover:bg-white/10"
                      onClick={() => window.open(product.landingUrl + "?preview=1", "_blank")}
                    >
                      Learn more
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="mb-16 bg-gradient-to-r from-yellow-500/20 to-purple-500/20 rounded-2xl p-8 border border-yellow-500/30">
          <h2 className="text-2xl font-bold text-center text-white mb-6">
            🧙‍♂️ The Wizard's Recommendation
          </h2>
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-gray-300 mb-6">
              <strong className="text-white">New to AI agent workflows?</strong> Start with <span className="text-yellow-400 font-bold">Quack</span> — it's free and solves the biggest pain point: copy/paste fatigue.
            </p>
            <p className="text-gray-300 mb-6">
              <strong className="text-white">Already using multiple AI tools daily?</strong> Go straight to <span className="text-indigo-400 font-bold">Orchestrate</span> — you'll save hours every week.
            </p>
            <Button
              size="lg"
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-8 py-6 text-lg rounded-xl shadow-lg"
              onClick={() => handleGetStarted("https://quack.us.com")}
            >
              Start Free with Quack
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">
            Works With Your Favorite AI Tools
          </h2>
          <div className="flex flex-wrap justify-center gap-4 text-gray-400">
            <span className="bg-white/10 px-4 py-2 rounded-lg">Claude</span>
            <span className="bg-green-500/20 border border-green-400/50 px-4 py-2 rounded-lg text-green-400 font-semibold">Grok ⚡ Best for messaging</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">Replit ⚡</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">Cursor</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">ChatGPT</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">Gemini</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">VS Code</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">Antigravity</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg text-gray-500">Copilot 🔜</span>
          </div>
        </div>

        <footer className="text-center text-gray-500 pt-8 border-t border-gray-800">
          <p className="mb-2">
            <span className="text-2xl">🧙‍♂️🦆</span>
          </p>
          <p className="text-sm">
            Wizard of Quack — AI Agent Magic for Developers
          </p>
          <p className="text-xs mt-2 text-gray-600">
            Part of the{" "}
            <a href="https://orchestrate.us.com" className="text-indigo-400 hover:underline">Orchestrate</a>
            {" "}family of tools
          </p>
        </footer>
      </div>
    </div>
  );
}
