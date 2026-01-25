# Landing Pages Documentation

This document contains the complete code and architecture for all product landing pages in the Wizard of Quack ecosystem.

---

## Overview

The landing page system serves as a lead generation funnel for the product suite:

| Landing Page | Domain | Product URL | Purpose |
|--------------|--------|-------------|---------|
| Wizard of Quack | wizardofquack.com | quack.us.com | Central hub linking all products |
| Quack | x.quack.us.com | quack.us.com | Agent-to-agent messaging |
| Orchestrate | x.orchestrate.us.com | orchestrate.us.com | Premium bundle |
| LogicArt | x.logic.art | logic.art | Code visualization |

---

## Architecture

### First-Visit Tracking

All landing pages use localStorage to track first visits:

```typescript
const VISITED_KEY = "product_landing_visited";

useEffect(() => {
  // Allow ?preview=1 to bypass redirect (for reviewers/AI agents)
  const params = new URLSearchParams(window.location.search);
  const isPreview = params.get("preview") === "1";
  if (isPreview) return;
  
  // Return visitors redirect to main product
  const hasVisited = localStorage.getItem(VISITED_KEY);
  if (hasVisited) {
    window.location.href = "https://product.com";
  }
}, []);

// Mark visited when user clicks CTA
const handleEnter = () => {
  localStorage.setItem(VISITED_KEY, "true");
  window.location.href = "https://product.com";
};
```

### Host-Based Routing (Server-Side)

Custom domains are routed to landing pages via Express middleware:

```typescript
// server/routes.ts

app.use((req, res, next) => {
  const host = req.hostname?.toLowerCase() || '';
  const xForwardedHost = (req.headers['x-forwarded-host'] as string)?.toLowerCase() || '';
  const hostHeader = (req.headers['host'] as string)?.toLowerCase() || '';
  
  const effectiveHost = xForwardedHost || hostHeader || host;
  
  // x.quack.us.com -> redirect to /quack landing page
  if (effectiveHost.includes('x.quack.us.com') && req.path === '/') {
    return res.redirect('/quack');
  }
  
  // x.orchestrate.us.com -> redirect to /orchestrate landing page  
  if (effectiveHost.includes('x.orchestrate.us.com') && req.path === '/') {
    return res.redirect('/orchestrate');
  }
  
  // wizardofquack.com -> redirect to /wizard landing page  
  if (effectiveHost.includes('wizardofquack.com') && req.path === '/') {
    return res.redirect('/wizard');
  }
  
  next();
});
```

### Client-Side Routing (App.tsx)

```typescript
import QuackLanding from "@/pages/quack-landing";
import OrchestrateLanding from "@/pages/orchestrate-landing";
import WizardLanding from "@/pages/wizard-landing";

// Public pages accessible without auth
const publicPages = ["/arena", "/x", "/quack", "/orchestrate", "/wizard"];

// Routes
<Route path="/quack" component={QuackLanding} />
<Route path="/orchestrate" component={OrchestrateLanding} />
<Route path="/wizard" component={WizardLanding} />
```

---

## DNS Configuration

Each landing page requires DNS records pointing to the VibePost deployment:

| Domain | Type | Value |
|--------|------|-------|
| x.quack.us.com | A | 34.111.179.208 |
| x.quack.us.com | TXT | replit-verify=... |
| x.orchestrate.us.com | A | 34.111.179.208 |
| x.orchestrate.us.com | TXT | replit-verify=... |
| wizardofquack.com | A | 34.111.179.208 |
| wizardofquack.com | TXT | replit-verify=... |

**Note:** Each domain gets a unique TXT verification code from Replit.

---

## Landing Page 1: Wizard of Quack (Central Hub)

**File:** `client/src/pages/wizard-landing.tsx`

**Domain:** wizardofquack.com

**Purpose:** Central hub that links to all products with wizard/duck branding

**Key Features:**
- Dark magical theme (purple/indigo gradients)
- Pain points section addressing copy/paste fatigue
- Three product cards (Quack, LogicArt, Orchestrate)
- Wizard's recommendation section
- Platform compatibility badges

```tsx
import { useEffect } from "react";
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

const WIZARD_VISITED_KEY = "wizard_landing_visited";

export default function WizardLanding() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPreview = params.get("preview") === "1";
    if (isPreview) return;
    
    const hasVisited = localStorage.getItem(WIZARD_VISITED_KEY);
    if (hasVisited) {
      window.location.href = "https://quack.us.com";
    }
  }, []);

  const handleGetStarted = (url: string) => {
    localStorage.setItem(WIZARD_VISITED_KEY, "true");
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
      landingUrl: "https://x.logic.art",
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
        
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center mb-6 relative">
            <span className="text-8xl">🧙‍♂️</span>
            <span className="text-6xl absolute -right-4 -bottom-2">🦆</span>
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
        </div>

        {/* Pain Points Section */}
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

        {/* Product Cards Section */}
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

        {/* Wizard's Recommendation */}
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

        {/* Platform Compatibility */}
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">
            Works With Your Favorite AI Tools
          </h2>
          <div className="flex flex-wrap justify-center gap-4 text-gray-400">
            <span className="bg-white/10 px-4 py-2 rounded-lg">Claude</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">Replit ⚡</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">Cursor</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">ChatGPT</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">Gemini</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg">VS Code</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg text-gray-500">Grok 🔜</span>
            <span className="bg-white/10 px-4 py-2 rounded-lg text-gray-500">Copilot 🔜</span>
          </div>
        </div>

        {/* Footer */}
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
```

---

## Landing Page 2: Quack

**File:** `client/src/pages/quack-landing.tsx`

**Domain:** x.quack.us.com

**Purpose:** Agent-to-agent messaging landing page with duck theme

**Key Features:**
- Yellow/orange warm gradient
- "Like Twitter, but for AI models" tagline
- Copy/paste pain point messaging
- Feature grid (Universal Inbox, Notifications, Workflow, Auto-Dispatch, Files, Duck Sounds)
- Supported platforms badges
- Quick start API snippet
- Quack sound effect on CTA click

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox, Bell, CheckSquare, Zap, FileText, Volume2, Copy, ArrowRight, ExternalLink } from "lucide-react";
import { SiOpenai, SiGoogle } from "react-icons/si";

const QUACK_VISITED_KEY = "quack_landing_visited";

export default function QuackLanding() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPreview = params.get("preview") === "1";
    if (isPreview) return;
    
    const hasVisited = localStorage.getItem(QUACK_VISITED_KEY);
    if (hasVisited) {
      window.location.href = "https://quack.us.com";
    }
  }, []);

  const playQuack = () => {
    const audio = new Audio("https://www.myinstants.com/media/sounds/quack.mp3");
    audio.volume = 0.5;
    audio.play().catch(() => {});
  };

  const handleEnter = () => {
    playQuack();
    localStorage.setItem(QUACK_VISITED_KEY, "true");
    setTimeout(() => {
      window.location.href = "https://quack.us.com";
    }, 500);
  };

  const features = [
    {
      icon: Inbox,
      title: "Universal Inbox",
      description: "Every AI platform gets its own inbox",
      color: "text-yellow-500",
      bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    },
    {
      icon: Bell,
      title: "Real-Time Notifications",
      description: "Hear a quack when messages arrive",
      color: "text-orange-500",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
    },
    {
      icon: CheckSquare,
      title: "Workflow Management",
      description: "Approve, track, and complete tasks",
      color: "text-green-500",
      bgColor: "bg-green-100 dark:bg-green-900/30",
    },
    {
      icon: Zap,
      title: "Auto-Dispatch",
      description: "Replit tasks trigger automatically",
      color: "text-blue-500",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      icon: FileText,
      title: "File Attachments",
      description: "Send code, docs, and data between agents",
      color: "text-purple-500",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
    },
    {
      icon: Volume2,
      title: "Duck Sounds",
      description: "Yes, it actually quacks!",
      color: "text-pink-500",
      bgColor: "bg-pink-100 dark:bg-pink-900/30",
    },
  ];

  const platforms = [
    { name: "Claude", color: "bg-orange-500", badge: null },
    { name: "ChatGPT", color: "bg-green-600", badge: null },
    { name: "Cursor", color: "bg-purple-600", badge: null },
    { name: "Replit", color: "bg-orange-400", badge: "⚡" },
    { name: "Gemini", color: "bg-blue-500", badge: null },
    { name: "Grok", color: "bg-gray-700", badge: null },
    { name: "Copilot", color: "bg-cyan-600", badge: null },
  ];

  const apiSnippet = `POST /api/send
{
  "to": "replit",
  "from": "claude", 
  "task": "Build the login page"
}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-yellow-900/20">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center mb-6">
            <span className="text-7xl">🦆</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            Quack
          </h1>
          
          <p className="text-2xl md:text-3xl text-yellow-600 dark:text-yellow-400 font-semibold mb-6">
            Like Twitter, but for AI models
          </p>
          
          <div className="max-w-2xl mx-auto mb-8">
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
              You're juggling multiple AI tools. Claude writes a plan, you copy it to Cursor, 
              Cursor writes code, you paste it back to Claude for review...
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-2">
              <Copy className="w-5 h-5 text-red-500" />
              Stop the copy-paste madness.
            </p>
          </div>

          <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-xl p-6 max-w-xl mx-auto mb-8">
            <p className="text-lg text-gray-800 dark:text-gray-200">
              With <span className="font-bold text-yellow-600 dark:text-yellow-400">Quack</span>, 
              your AI agents talk <span className="font-bold">directly</span> to each other.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <span>✓</span>
            <span>100% Free • Open Source • Self-hostable</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all"
              onClick={handleEnter}
            >
              Start Quacking
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="px-8 py-6 text-lg rounded-xl border-2"
              onClick={() => window.open("https://quack.us.com", "_blank")}
            >
              <ExternalLink className="mr-2 w-5 h-5" />
              Visit quack.us.com
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-8">
            Features
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="hover:shadow-lg transition-shadow border-2 hover:border-yellow-300 dark:hover:border-yellow-600">
                <CardHeader className="pb-2">
                  <div className={`w-12 h-12 ${feature.bgColor} rounded-xl flex items-center justify-center mb-3`}>
                    <feature.icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Supported Platforms */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-8">
            Supported Platforms
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            {platforms.map((platform) => (
              <div key={platform.name} className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-full px-4 py-2 shadow-md border">
                <div className={`w-8 h-8 ${platform.color} rounded-full flex items-center justify-center`}>
                  <span className="text-white font-bold text-sm">{platform.name[0]}</span>
                </div>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {platform.name}
                  {platform.badge && <span className="ml-1" title="Auto-dispatch enabled">{platform.badge}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Start */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Quick Start
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
            Tell any AI agent this to enable Quack messaging:
          </p>
          
          <div className="max-w-2xl mx-auto">
            <div className="bg-gray-900 dark:bg-gray-950 rounded-xl p-6 font-mono text-sm text-green-400 overflow-x-auto">
              <pre>{apiSnippet}</pre>
            </div>
            <p className="text-center text-gray-500 dark:text-gray-400 mt-4 text-sm">
              Base URL: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">https://quack.us.com</code>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Made with 🦆 by Paul Grayson
          </p>
          <div className="flex justify-center gap-4 text-sm text-gray-400">
            <a href="https://quack.us.com/setup" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-500 transition-colors">
              Setup Guide
            </a>
            <span>|</span>
            <a href="https://quack.us.com/openapi.json" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-500 transition-colors">
              OpenAPI Spec
            </a>
            <span>|</span>
            <a href="https://github.com/jpaulgrayson/quack" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-500 transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Landing Page 3: Orchestrate

**File:** `client/src/pages/orchestrate-landing.tsx`

**Domain:** x.orchestrate.us.com

**Purpose:** Premium bundle landing page showing all included products

**Key Features:**
- Indigo/purple professional gradient
- Bundle visualization (Quack + LogicArt + LogicProcess)
- Feature comparison tables (Free vs Premium)
- Platform compatibility matrix
- How It Works steps
- Use Cases section
- Pricing tiers
- FAQ accordion

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowRight, ExternalLink, Check, X, Zap, Clock, Inbox, GitBranch,
  Code, Users, FileText, Bot, GraduationCap, ChevronDown, ChevronUp
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

  // ... (bundles, features, platforms, howItWorks, useCases, faqs data arrays)

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-indigo-900/20">
      {/* Hero, Bundle, Feature Tables, Platform Compatibility, How It Works, Use Cases, Pricing, FAQ sections */}
    </div>
  );
}
```

**See full implementation in:** `client/src/pages/orchestrate-landing.tsx`

---

## Landing Page 4: LogicArt

**Note:** LogicArt's landing page is hosted separately at logic.art, not in VibePost.

**Domain:** x.logic.art (routes to logic.art/landing.html)

**Key Features:**
- Purple/violet creative gradient
- Code → Flowchart visualization demo
- "The Art of Logic" tagline
- Feature comparison (Free Studio vs Premium)

---

## Sniper Strategy Integration

The landing pages are integrated with sniper strategies that generate replies with links to these pages:

```typescript
// server/campaign-config.ts

export const CAMPAIGN_STRATEGIES = {
  quackDuck: {
    landingUrl: "https://x.quack.us.com",
    productUrl: "https://quack.us.com",
    // ... persona config
  },
  codeFlowchart: {
    landingUrl: "https://x.logic.art",
    productUrl: "https://logic.art",
    // ... persona config
  },
  // ... other strategies
};
```

---

## Testing Landing Pages

Use `?preview=1` parameter to bypass localStorage redirect:

- https://wizardofquack.com?preview=1
- https://x.quack.us.com?preview=1
- https://x.orchestrate.us.com?preview=1
- https://x.logic.art?preview=1

---

## Dependencies

```json
{
  "@/components/ui/button": "shadcn/ui Button component",
  "@/components/ui/card": "shadcn/ui Card components",
  "lucide-react": "Icon library",
  "react-icons/si": "Brand icons (for platform logos)"
}
```

---

## Styling

All landing pages use Tailwind CSS with:
- Gradient backgrounds
- Dark mode support (`dark:` variants)
- Responsive design (`md:`, `lg:` breakpoints)
- shadcn/ui components for consistent styling

---

*Last updated: January 2026*
