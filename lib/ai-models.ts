// ============================================================================
// Cascade AI — Model Registry
// Single source of truth for model definitions, limits, and cascade chains.
// Shared between backend (/api/ai-chat, /api/ai-quota) and frontend selector.
// ============================================================================

export type ModelId = "auto" | "smart" | "reasoner" | "live" | "fast" | "vision" | "coder"

// ── Auto-router: picks the best model per message based on intent ───────────
// Simple regex-based classifier. Zero extra API calls, instant.
// Runs server-side before the cascade fires.
export function autoRouteIntent(message: string): Exclude<ModelId, "auto"> {
  const text = message.trim()
  const lower = text.toLowerCase()
  const wordCount = text.split(/\s+/).length

  // Code: triple backticks, common programming keywords, file extensions
  if (/```|\bfunction\s*\(|\bclass\s+\w|\bconst\s+\w|\blet\s+\w|\bimport\s+\w|\bdef\s+\w|<\w+\s*\/?>|SELECT\s.+FROM|\.(?:ts|tsx|jsx|js|py|rb|rs|go|java|cs|cpp|c|h|sql|sh|yaml|yml|json)\b/i.test(text)) {
    return "coder"
  }
  if (/\b(fix|refactor|debug|write|generate).{0,40}\b(code|function|script|query|component|class|module|test|bug|error)\b/i.test(lower)) {
    return "coder"
  }

  // Live: current events, news, prices, weather, tracking, FX, today/now/year refs
  if (/\b(today|yesterday|right now|now|currently|latest|current|this (week|month|year)|breaking|news|weather|forecast|temperature|rain|sunny|stock price|exchange rate|currency|convert|gbp to|usd to|eur to|forex|score|who won|recent|just happened|2025|2026|2027|price of|cost of|rate of|how much is|how much does|minimum wage|interest rate|inflation|election|who is the|prime minister|president|container|tracking|shipment|cargo|where is my|track my)\b/i.test(lower)) {
    return "live"
  }

  // Reasoner: explicit deep-thinking cues, complex math, logic puzzles
  if (/\b(step[- ]?by[- ]?step|prove|proof|reason through|think carefully|analyse deeply|logic puzzle|solve this problem|show your (work|working)|derive|theorem)\b/i.test(lower)) {
    return "reasoner"
  }
  // Long maths expressions, programming algorithm questions
  if (/(\d+\s*[+\-*/^%]\s*){3,}|integral of|differentiate|big[- ]o\b|complexity of/i.test(text)) {
    return "reasoner"
  }

  // Fast: short simple questions, one-liners
  if (wordCount <= 6 && !/[?!.]/.test(text.slice(-1)) === false && !/\b(explain|analyse|compare|summarise|describe|write|draft)\b/i.test(lower)) {
    return "fast"
  }
  if (/^(what's|whats|when|who|where) (is|are|was|were) \w+\??$/i.test(text) && wordCount < 8) {
    return "fast"
  }

  // Default: Smart handles everything else
  return "smart"
}

export type ProviderType =
  | "groq"
  | "cerebras"
  | "sambanova"
  | "gemini-grounded"
  | "openrouter"
  | "openrouter-free"

export interface CascadeStep {
  provider: ProviderType
  model: string
  label: string              // Human-readable label shown in UI (e.g. "Cerebras Qwen 3 235B")
}

export interface ModelDefinition {
  id: ModelId
  name: string
  emoji: string
  tagline: string
  description: string
  knowledge: string
  cutoffDate: string
  badge?: string
  recommended: boolean
  perUserDailyLimit: number
  totalDailyCapacity: number
  cascade: CascadeStep[]
}

// ── The 7 user-facing models (Auto + 6 specific) ─────────────────────────────
export const MODELS: Record<ModelId, ModelDefinition> = {
  auto: {
    id: "auto",
    name: "Auto",
    emoji: "🎯",
    tagline: "Picks the best model for every question",
    description:
      "Reads your question and routes it to the right brain — Coder for code, Reasoner for hard problems, Live for today's news, Fast for quick lookups, Smart for everything else. You'll see which one answered. No need to pick yourself.",
    knowledge: "Auto-routed across all 6 models",
    cutoffDate: "varies by routed model",
    badge: "NEW",
    recommended: true,
    perUserDailyLimit: 2000,
    totalDailyCapacity: 20000,
    cascade: [
      // Placeholder — autoRouteIntent() decides the real cascade at runtime
      { provider: "groq", model: "openai/gpt-oss-120b", label: "Auto router" },
    ],
  },
  smart: {
    id: "smart",
    name: "Smart",
    emoji: "✨",
    tagline: "Best for almost anything",
    description:
      "Everyday assistant. Polished emails, summaries, analysis, brainstorming, translation — picks from 11 free models and uses whichever is fastest and best.",
    knowledge: "Trained up to April 2025",
    cutoffDate: "April 2025",
    badge: "BEST",
    recommended: true,
    perUserDailyLimit: 1000,
    totalDailyCapacity: 10000,
    // Cascade verified live 2026-04-16 via scripts/discover-models.mjs.
    // Quality-first: SambaNova DeepSeek V3.2 (frontier) → Groq GPT-OSS 120B (44ms)
    // → SambaNova Llama-4-Maverick → Groq Llama 3.3 70B → deep :free fallback pool.
    cascade: [
      { provider: "sambanova", model: "DeepSeek-V3.2", label: "SambaNova DeepSeek V3.2" },
      { provider: "groq", model: "openai/gpt-oss-120b", label: "Groq GPT-OSS 120B" },
      { provider: "sambanova", model: "Llama-4-Maverick-17B-128E-Instruct", label: "SambaNova Llama 4 Maverick" },
      { provider: "sambanova", model: "DeepSeek-V3.1", label: "SambaNova DeepSeek V3.1" },
      { provider: "groq", model: "llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B" },
      { provider: "sambanova", model: "Meta-Llama-3.3-70B-Instruct", label: "SambaNova Llama 3.3 70B" },
      { provider: "cerebras", model: "qwen-3-235b-a22b-instruct-2507", label: "Cerebras Qwen 3 235B" },
      { provider: "groq", model: "qwen/qwen3-32b", label: "Groq Qwen 3 32B" },
      { provider: "openrouter-free", model: "openai/gpt-oss-120b:free", label: "OpenRouter GPT-OSS 120B (free)" },
      { provider: "openrouter-free", model: "nvidia/nemotron-3-super-120b-a12b:free", label: "OpenRouter Nemotron 120B (free)" },
      { provider: "openrouter-free", model: "z-ai/glm-4.5-air:free", label: "OpenRouter GLM-4.5 Air (free)" },
      { provider: "openrouter-free", model: "nvidia/nemotron-3-nano-30b-a3b:free", label: "OpenRouter Nemotron Nano 30B (free)" },
      { provider: "openrouter-free", model: "arcee-ai/trinity-large-preview:free", label: "OpenRouter Arcee Trinity (free)" },
      { provider: "openrouter-free", model: "google/gemma-3-12b-it:free", label: "OpenRouter Gemma 3 12B (free)" },
    ],
  },
  reasoner: {
    id: "reasoner",
    name: "Reasoner",
    emoji: "🧠",
    tagline: "Deep thinking & complex problems",
    description:
      "For when I need to really think. Complex code, multi-step logic, deep analysis, maths, strategy. Uses DeepSeek V3.2 and reasoning-tuned models.",
    knowledge: "Trained up to December 2024",
    cutoffDate: "December 2024",
    badge: "DEEP",
    recommended: true,
    perUserDailyLimit: 500,
    totalDailyCapacity: 5000,
    cascade: [
      { provider: "sambanova", model: "DeepSeek-V3.2", label: "SambaNova DeepSeek V3.2" },
      { provider: "sambanova", model: "DeepSeek-V3.1", label: "SambaNova DeepSeek V3.1" },
      { provider: "groq", model: "openai/gpt-oss-120b", label: "Groq GPT-OSS 120B" },
      { provider: "sambanova", model: "DeepSeek-V3.1-cb", label: "SambaNova DeepSeek V3.1-cb" },
      { provider: "cerebras", model: "qwen-3-235b-a22b-instruct-2507", label: "Cerebras Qwen 3 235B" },
      { provider: "sambanova", model: "Llama-4-Maverick-17B-128E-Instruct", label: "SambaNova Llama 4 Maverick" },
      { provider: "groq", model: "llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B" },
      { provider: "openrouter-free", model: "openai/gpt-oss-120b:free", label: "OpenRouter GPT-OSS 120B (free)" },
      { provider: "openrouter-free", model: "z-ai/glm-4.5-air:free", label: "OpenRouter GLM-4.5 Air (free)" },
      { provider: "openrouter-free", model: "nvidia/nemotron-3-super-120b-a12b:free", label: "OpenRouter Nemotron 120B (free)" },
    ],
  },
  live: {
    id: "live",
    name: "Live",
    emoji: "🔴",
    tagline: "Real-time web search & current events",
    description:
      "For things happening RIGHT NOW. Current news, weather, prices, scores — anything from the last few months. Grounds every answer with live Google Search.",
    knowledge: "Real-time via live Google Search",
    cutoffDate: "real-time (live web search, no fixed cutoff)",
    badge: "NEW",
    recommended: true,
    perUserDailyLimit: 1000,
    totalDailyCapacity: 10000,
    cascade: [
      { provider: "gemini-grounded", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash + Google Search" },
      { provider: "gemini-grounded", model: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite + Google Search" },
      { provider: "gemini-grounded", model: "gemini-3-flash-preview", label: "Gemini 3 Flash + Google Search" },
      { provider: "groq", model: "openai/gpt-oss-120b", label: "Groq GPT-OSS 120B + Tavily search" },
    ],
  },
  fast: {
    id: "fast",
    name: "Fast",
    emoji: "⚡",
    tagline: "Instant replies, simple questions",
    description:
      "Lightning fast on Cerebras (2000 tokens/sec). Quick lookups, short questions, anything you want back in under a second.",
    knowledge: "Trained up to December 2023",
    cutoffDate: "December 2023",
    badge: "∞",
    recommended: true,
    perUserDailyLimit: 5000,
    totalDailyCapacity: 50000,
    cascade: [
      { provider: "groq", model: "openai/gpt-oss-20b", label: "Groq GPT-OSS 20B (41ms)" },
      { provider: "groq", model: "llama-3.1-8b-instant", label: "Groq Llama 3.1 8B Instant" },
      { provider: "cerebras", model: "llama3.1-8b", label: "Cerebras Llama 3.1 8B (2000 tok/sec)" },
      { provider: "openrouter-free", model: "nvidia/nemotron-nano-9b-v2:free", label: "OpenRouter Nemotron Nano 9B (free)" },
      { provider: "openrouter-free", model: "liquid/lfm-2.5-1.2b-thinking:free", label: "OpenRouter Liquid LFM 2.5 (free)" },
      { provider: "openrouter-free", model: "openai/gpt-oss-20b:free", label: "OpenRouter GPT-OSS 20B (free)" },
      { provider: "openrouter-free", model: "google/gemma-3-4b-it:free", label: "OpenRouter Gemma 3 4B (free)" },
      { provider: "openrouter-free", model: "google/gemma-3n-e4b-it:free", label: "OpenRouter Gemma 3n 4B (free)" },
      { provider: "openrouter-free", model: "google/gemma-3n-e2b-it:free", label: "OpenRouter Gemma 3n 2B (free)" },
    ],
  },
  vision: {
    id: "vision",
    name: "Vision",
    emoji: "👁",
    tagline: "Image understanding (auto-activates)",
    description:
      "Reads photos, screenshots, diagrams, charts, receipts. Auto-activates when you upload an image — no manual switch needed.",
    knowledge: "Trained up to August 2024",
    cutoffDate: "August 2024",
    recommended: false,
    perUserDailyLimit: 500,
    totalDailyCapacity: 5000,
    cascade: [
      { provider: "groq", model: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Groq Llama-4-Scout 17B" },
      { provider: "gemini-grounded", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash (vision)" },
      { provider: "openrouter-free", model: "google/gemma-4-31b-it:free", label: "OpenRouter Gemma 4 31B (free)" },
      { provider: "openrouter-free", model: "google/gemma-4-26b-a4b-it:free", label: "OpenRouter Gemma 4 26B (free)" },
      { provider: "openrouter-free", model: "nvidia/nemotron-nano-12b-v2-vl:free", label: "OpenRouter Nemotron Nano VL (free)" },
      { provider: "openrouter-free", model: "google/gemma-3-27b-it:free", label: "OpenRouter Gemma 3 27B (free)" },
    ],
  },
  coder: {
    id: "coder",
    name: "Coder",
    emoji: "💻",
    tagline: "Code, refactor, debug, review",
    description:
      "Tuned for programming tasks. Generates clean code, explains patterns, spots bugs, writes tests. Picks the best coder model across 3 providers.",
    knowledge: "Trained up to April 2025",
    cutoffDate: "April 2025",
    badge: "NEW",
    recommended: true,
    perUserDailyLimit: 800,
    totalDailyCapacity: 8000,
    cascade: [
      { provider: "sambanova", model: "DeepSeek-V3.2", label: "SambaNova DeepSeek V3.2 (code)" },
      { provider: "groq", model: "openai/gpt-oss-120b", label: "Groq GPT-OSS 120B" },
      { provider: "cerebras", model: "qwen-3-235b-a22b-instruct-2507", label: "Cerebras Qwen 3 235B (code)" },
      { provider: "sambanova", model: "DeepSeek-V3.1", label: "SambaNova DeepSeek V3.1 (code)" },
      { provider: "groq", model: "qwen/qwen3-32b", label: "Groq Qwen 3 32B" },
      { provider: "openrouter-free", model: "z-ai/glm-4.5-air:free", label: "OpenRouter GLM-4.5 Air (free)" },
      { provider: "openrouter-free", model: "openai/gpt-oss-120b:free", label: "OpenRouter GPT-OSS 120B (free)" },
      { provider: "openrouter-free", model: "qwen/qwen3-coder:free", label: "OpenRouter Qwen3 Coder (free)" },
      { provider: "openrouter-free", model: "arcee-ai/trinity-large-preview:free", label: "OpenRouter Arcee Trinity (free)" },
    ],
  },
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export const MODEL_LIST: ModelDefinition[] = Object.values(MODELS)

export const MODELS_RECOMMENDED: ModelDefinition[] = MODEL_LIST.filter(
  (m) => m.recommended
)

export function getModel(id: string | undefined | null): ModelDefinition {
  if (!id || !(id in MODELS)) return MODELS.smart
  return MODELS[id as ModelId]
}

export function isValidModelId(id: string): id is ModelId {
  return id in MODELS
}
