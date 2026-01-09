# LogicArt Campaign Strategies

## Overview

The LogicArt Sniper system uses 5 specialized strategies to find and engage developers on X/Twitter. Each strategy targets a specific audience with tailored messaging and action types.

## Strategy Summary

| Strategy | Emoji | Target Audience | Action Type | Intent Type |
|----------|-------|-----------------|-------------|-------------|
| **Vibe Coding Scout** | 🎯 | Users debating AI coding tools | Reply | Model Comparison / Debate |
| **Spaghetti Detective** | 🍝 | Senior devs with legacy code pain | Reply | Complexity Pain / Suffering |
| **Bootcamp Savior** | 🎓 | Beginners stuck on bugs | Reply | Beginner Struggling |
| **Arena Referee** | 🏛️ | Viral AI model debates | Quote Tweet | AI Model Debate |
| **Code Flowchart** | 📊 | Tweets containing code snippets | Quote Tweet | Code Detection |

---

## 1. Vibe Coding Scout 🎯

**Description:** Find users debating AI model performance - invite them to the Cage Match

**Selection Criteria:**
- Users comparing AI coding tools (Cursor, Copilot, Claude, etc.)
- Frustrated with AI hallucinations or failures
- Asking "which AI is best for coding?"

**Search Terms:**
| Category | Keywords |
|----------|----------|
| Vibe Coding Platforms | `vibe coding`, `vibe coder`, `Cursor AI`, `Cursor vs`, `Windsurf ai`, `Replit agent`, `Bolt.new`, `v0 dev`, `Lovable ai`, `GitHub Copilot`, `Codeium`, `Aider ai` |
| Model Debates | `Claude vs GPT`, `Grok code`, `which model is best`, `Claude is dumb`, `GPT not working`, `best coding AI`, `model comparison` |
| Frustration Signals | `hallucinating`, `hallucination`, `model keeps failing`, `switched to GPT`, `Cursor hallucinating` |

**Positive Intent Signals:** `vs`, `better`, `worse`, `compared`, `hallucinating`, `frustrated`, `not working`, `struggling`, `broken`, `buggy`

**Reply Tone:** Competitive, Fun - "Let's settle this in the Cage Match"

---

## 2. Spaghetti Detective 🍝

**Description:** Find senior devs suffering from legacy code complexity

**Selection Criteria:**
- Developers dealing with inherited codebases
- Complaints about unmaintainable or confusing code
- Technical debt discussions

**Search Terms:**
| Category | Keywords |
|----------|----------|
| Code Complexity | `spaghetti code`, `legacy codebase`, `technical debt`, `refactoring hell` |
| Understanding Pain | `can't understand this code`, `inherited this codebase`, `code archaeology`, `who wrote this` |
| Frustration | `wtf is this code`, `unmaintainable code`, `codebase is a mess`, `lost in the code`, `debugging nightmare` |

**Positive Intent Signals:** `nightmare`, `mess`, `spaghetti`, `legacy`, `inherited`, `refactor`, `confusing`, `complex`, `stuck`, `lost`, `wtf`

**Reply Tone:** Professional - "Here is a map out of the woods"

---

## 3. Bootcamp Savior 🎓

**Description:** Find beginners stuck on basic bugs - mentor with kindness [PRIORITY]

**Selection Criteria:**
- New programmers learning to code
- Stuck on syntax errors or basic concepts
- Using learning hashtags like #100DaysOfCode

**Search Terms:**
| Category | Keywords |
|----------|----------|
| Learning Hashtags | `#100DaysOfCode`, `#CodeNewbie`, `coding bootcamp` |
| Beginner Problems | `stuck on loop`, `why isn't this working`, `syntax error`, `TypeError`, `undefined is not a function` |
| Help Requests | `python help`, `javascript help`, `learning to code`, `first project`, `beginner question`, `new to programming`, `help please` |
| Confusion | `can someone explain`, `what am I doing wrong`, `stuck for hours` |

**Positive Intent Signals:** `stuck`, `help`, `beginner`, `newbie`, `learning`, `first time`, `don't understand`, `confused`, `error`, `not working`, `please`

**Reply Tone:** Mentor, Kind - "I visualized your bug for you"

**Note:** Excludes expert signals (staff engineer, principal engineer, tech lead, CTO, etc.) to avoid tone mismatch

---

## 4. Arena Referee 🏛️

**Description:** Find viral AI debates & broadcast the verdict via Quote Tweet

**Selection Criteria:**
- Tweets comparing AI models (Grok vs Claude, etc.)
- Debates about which AI is smarter/better
- Discussions about AI accuracy and hallucinations

**Search Terms:**
| Category | Keywords |
|----------|----------|
| Model Comparisons | `which ai is better`, `which AI is best`, `grok vs claude`, `claude vs grok`, `gpt vs claude`, `gemini vs claude` |
| Model Opinions | `is grok better`, `is claude better`, `grok is smarter`, `claude is smarter`, `best LLM`, `worst LLM` |
| Truth/Accuracy | `is grok true`, `AI hallucination`, `grok lies`, `claude lies`, `AI lying`, `which AI is more accurate` |
| Coding AI | `best coding AI`, `cursor vs windsurf`, `copilot vs cursor`, `which AI codes best`, `AI coding battle` |
| General Opinions | `grok is overrated`, `claude is overrated`, `AI comparison`, `LLM comparison` |

**Positive Intent Signals:** `vs`, `better`, `worse`, `smarter`, `compared`, `comparison`, `battle`, `showdown`, `debate`, `true`, `lies`, `accurate`, `overrated`, `underrated`

**Reply Tone:** Competitive, Fun - "Let's settle this in the Arena"

**Action:** Quote Tweet with AI Council verdict (runs debate through 4 AI models)

---

## 5. Code Flowchart 📊

**Description:** Detect tweets containing code snippets and generate visual flowcharts

**Selection Criteria:**
- Tweets containing code blocks (markdown fences)
- Posts with inline code patterns (curly braces, semicolons, function syntax)
- Code-heavy tweets with high symbol density

**Code Detection Logic:**
| Method | Description |
|--------|-------------|
| Markdown Fences | Detects \`\`\` code blocks |
| Syntax Patterns | Keywords like `function`, `const`, `if`, `for`, `return`, `class`, `import` |
| Symbol Density | High concentration of `{}`, `()`, `;`, `=>`, `===` |
| Language Hints | Detects Python, JavaScript, TypeScript, Rust, Go patterns |

**Search Terms:**
| Category | Keywords |
|----------|----------|
| Debug/Help | `code bug`, `my code`, `code not working`, `debug this`, `help with code` |
| Code Review | `code review`, `what's wrong with`, `fix this code`, `this works but` |
| Sharing Code | `wrote this function`, `here's my code`, `check out this` |

**Positive Intent Signals:** Code fence blocks, high symbol density (>15%), syntax keywords, function definitions

**Negative Signals:** Promotional content, job listings, tutorial links

**Reply Tone:** Helpful, Educational - "Visualized your logic flow"

**Action:** Quote Tweet with AI-generated flowchart image + CTA to Arena

**Generated Content Format:**
- Flowchart image: Visual representation of code logic
- CTA message: Drives traffic to logic.art/x for full AI analysis

---

## Global Safety Filters

All strategies automatically filter out tweets containing:

| Category | Filtered Terms |
|----------|----------------|
| Politics/Hate | `maga`, `woke`, `leftist`, `rightist`, `trump`, `biden`, `gender war`, `pronouns`, `racist`, `fascist` |
| Crypto | `.eth`, `crypto`, `token`, `nft`, `blockchain`, `web3`, `defi`, `hodl`, `wagmi` |

**Negative Signals (all strategies):** `hiring`, `job`, `course`, `tutorial`, `sponsor`, `discount`, `affiliate`, `founder`, `CEO`, `we're building`, `launching`, `promo`

---

## Product Link

All strategies direct users to: **https://logic.art/x**
