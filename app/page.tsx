import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cascade AI — Open Source Multi-Provider AI Assistant",
  description: "36 AI engines, 7 providers, automatic failover. Built by Sarma Linux. Free to deploy.",
}

const PROVIDERS = [
  { name: "Groq", models: "GPT-OSS 120B/20B, Llama 3.3 70B, Qwen 3 32B, Llama-4 Scout", speed: "41ms first token", url: "https://console.groq.com", color: "#f97316" },
  { name: "SambaNova", models: "DeepSeek V3.2 (685B MoE), V3.1, Llama 4 Maverick", speed: "Frontier reasoning", url: "https://cloud.sambanova.ai", color: "#8b5cf6" },
  { name: "Cerebras", models: "Qwen 3 235B, Llama 3.1 8B", speed: "2,000 tok/sec (WSE-3 chip)", url: "https://cloud.cerebras.ai", color: "#06b6d4" },
  { name: "Google Gemini", models: "2.5 Flash, Flash Lite, Gemini 3 Flash Preview", speed: "Live Google Search grounding", url: "https://aistudio.google.com", color: "#4285f4" },
  { name: "OpenRouter", models: "17+ free models — GPT-OSS, Nemotron, GLM-4.5, Gemma 4", speed: "Deep cascade fallback", url: "https://openrouter.ai", color: "#10b981" },
  { name: "Cloudflare", models: "FLUX.2 klein 9B/4B (image gen + editing)", speed: "~1.5s per image", url: "https://dash.cloudflare.com", color: "#f59e0b" },
  { name: "Tavily", models: "Structured web search", speed: "1,000 searches/month free", url: "https://app.tavily.com", color: "#ef4444" },
]

const MODES = [
  { emoji: "✨", name: "Smart", depth: 14, limit: "1,000/day", engine: "DeepSeek V3.2 (685B)", desc: "Emails, summaries, analysis, writing — outscores GPT-4o on maths and code" },
  { emoji: "🧠", name: "Reasoner", depth: 10, limit: "500/day", engine: "DeepSeek V3.2 + V3.1", desc: "Complex logic, maths, strategy — visible reasoning traces" },
  { emoji: "🔴", name: "Live", depth: 4, limit: "1,000/day", engine: "Gemini + Google Search", desc: "Real-time web search, weather, exchange rates, container tracking" },
  { emoji: "⚡", name: "Fast", depth: 9, limit: "5,000/day", engine: "Groq GPT-OSS 20B (41ms)", desc: "Lightning fast — first token in 41 milliseconds" },
  { emoji: "💻", name: "Coder", depth: 9, limit: "800/day", engine: "DeepSeek V3.2", desc: "Code generation, debugging, refactoring — topped SWE-bench" },
  { emoji: "👁", name: "Vision", depth: 6, limit: "500/day", engine: "Llama-4 Scout 17B", desc: "Image understanding, OCR, charts — auto-activates on image upload" },
]

const FEATURES = [
  { icon: "🔄", title: "Cascade Failover", desc: "Up to 14 engines per mode. If one is busy, the next fires in <50ms. Users never see errors." },
  { icon: "🧠", title: "Persistent Memory", desc: "Learns who you are across conversations — name, role, preferences. Like ChatGPT memory." },
  { icon: "🎨", title: "Image Gen & Edit", desc: "FLUX.2 klein generates images from text. Edit existing images with natural language — colour changes actually work." },
  { icon: "📎", title: "Document Analysis", desc: "Upload PDFs, Excel, Word — up to 10 files. AI reads and answers questions about the content." },
  { icon: "💱", title: "Live Exchange Rates", desc: "Real-time ECB rates for 13+ currencies. No API key needed." },
  { icon: "🌤", title: "Weather Anywhere", desc: "Current conditions + 3-day forecast for any city. Powered by Open-Meteo." },
  { icon: "📦", title: "Container Tracking", desc: "Auto-detects carrier from container number. Searches for live status via Tavily." },
  { icon: "🎯", title: "Auto-Router", desc: "Detects intent from your message — code, search, quick answer, deep thinking — and picks the right mode." },
]

const STEPS = [
  { num: "1", title: "Clone the repo", cmd: "git clone https://github.com/sarmakska/cascade-ai.git && cd cascade-ai && npm install" },
  { num: "2", title: "Get free API keys", cmd: "Sign up at Groq, SambaNova, Cerebras, Gemini, OpenRouter, Cloudflare, Tavily — all free, no card" },
  { num: "3", title: "Configure", cmd: "cp .env.example .env.local — then paste your keys" },
  { num: "4", title: "Set up database", cmd: "Create a Supabase project (free) — run the migration SQL" },
  { num: "5", title: "Deploy", cmd: "npm run dev — or push to Vercel for production" },
]

export default function HomePage() {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#050505", color: "#ebe8e3", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');
        .ca * { box-sizing: border-box; }
        .ca ::selection { background: rgba(167,139,250,0.3); color: #fff; }

        .ca-hero { text-align: center; padding: 100px 32px 80px; position: relative; overflow: hidden; }
        .ca-hero::before { content: ''; position: absolute; top: -100px; left: 50%; transform: translateX(-50%); width: 800px; height: 500px; background: radial-gradient(ellipse, rgba(124,58,237,0.12), transparent 60%); filter: blur(80px); pointer-events: none; }
        .ca-hero .badge { position: relative; display: inline-block; padding: 8px 18px; background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.3); border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #a78bfa; margin-bottom: 32px; }
        .ca-hero h1 { position: relative; font-family: 'Instrument Serif', serif; font-size: 84px; line-height: 0.95; color: #ebe8e3; margin-bottom: 24px; letter-spacing: -0.03em; }
        .ca-hero h1 em { font-style: italic; color: #a78bfa; }
        @media (max-width: 700px) { .ca-hero h1 { font-size: 48px; } }
        .ca-hero p { position: relative; font-size: 18px; color: rgba(255,255,255,0.55); max-width: 640px; margin: 0 auto 40px; line-height: 1.65; }
        .ca-hero .btns { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; position: relative; }
        .ca-hero .btn-primary { display: inline-flex; align-items: center; gap: 10px; padding: 16px 36px; background: #ebe8e3; color: #0a0a0a; border-radius: 999px; font-size: 14px; font-weight: 700; text-decoration: none; transition: all 0.2s; }
        .ca-hero .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 40px rgba(235,232,227,0.2); }
        .ca-hero .btn-secondary { display: inline-flex; align-items: center; gap: 10px; padding: 16px 36px; background: transparent; color: #ebe8e3; border: 1px solid rgba(255,255,255,0.2); border-radius: 999px; font-size: 14px; font-weight: 700; text-decoration: none; transition: all 0.2s; }
        .ca-hero .btn-secondary:hover { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.05); }

        .ca-stats { display: flex; justify-content: center; gap: 48px; padding: 60px 32px; flex-wrap: wrap; }
        .ca-stat { text-align: center; }
        .ca-stat .num { font-family: 'Instrument Serif', serif; font-size: 56px; color: #ebe8e3; line-height: 1; }
        .ca-stat .num em { font-style: italic; color: #a78bfa; }
        .ca-stat .lbl { font-size: 13px; color: rgba(255,255,255,0.45); margin-top: 8px; }

        .ca-section { max-width: 1200px; margin: 0 auto; padding: 80px 32px; }
        .ca-section .sh { font-family: 'Instrument Serif', serif; font-size: 52px; color: #ebe8e3; margin-bottom: 14px; letter-spacing: -0.02em; line-height: 1; text-align: center; }
        .ca-section .sh em { font-style: italic; color: #a78bfa; }
        @media (max-width: 700px) { .ca-section .sh { font-size: 36px; } }
        .ca-section .ss { font-size: 16px; color: rgba(255,255,255,0.5); margin-bottom: 48px; max-width: 640px; margin-left: auto; margin-right: auto; line-height: 1.6; text-align: center; }

        .ca-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 900px) { .ca-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .ca-grid { grid-template-columns: 1fr; } }
        .ca-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 28px 24px; transition: all 0.3s; position: relative; overflow: hidden; }
        .ca-card:hover { border-color: rgba(167,139,250,0.3); transform: translateY(-3px); }
        .ca-card .icon { font-size: 28px; margin-bottom: 16px; }
        .ca-card .title { font-family: 'Instrument Serif', serif; font-size: 22px; color: #ebe8e3; margin-bottom: 4px; }
        .ca-card .tag { font-size: 11px; color: #a78bfa; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 10px; }
        .ca-card .desc { font-size: 13px; color: rgba(255,255,255,0.5); line-height: 1.6; }

        .ca-mode { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 900px) { .ca-mode { grid-template-columns: 1fr; } }
        .ca-mode-card { background: linear-gradient(180deg, rgba(124,58,237,0.06), rgba(255,255,255,0.01)); border: 1px solid rgba(124,58,237,0.2); border-radius: 24px; padding: 32px 28px; text-align: center; transition: all 0.3s; }
        .ca-mode-card:hover { transform: translateY(-4px); border-color: rgba(167,139,250,0.4); }
        .ca-mode-card .emoji { font-size: 36px; margin-bottom: 12px; }
        .ca-mode-card .name { font-family: 'Instrument Serif', serif; font-size: 28px; color: #ebe8e3; margin-bottom: 4px; }
        .ca-mode-card .meta { font-size: 11px; color: #a78bfa; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 12px; }
        .ca-mode-card .engine { font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 10px; font-weight: 600; }
        .ca-mode-card .desc { font-size: 13px; color: rgba(255,255,255,0.45); line-height: 1.5; }

        .ca-providers { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
        .ca-prov { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 24px; transition: all 0.3s; }
        .ca-prov:hover { border-color: rgba(255,255,255,0.2); }
        .ca-prov .pname { font-family: 'Instrument Serif', serif; font-size: 24px; color: #ebe8e3; margin-bottom: 4px; }
        .ca-prov .pmodels { font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 6px; line-height: 1.5; }
        .ca-prov .pspeed { font-size: 11px; color: #a78bfa; font-weight: 600; margin-bottom: 10px; }
        .ca-prov a { font-size: 12px; color: #a78bfa; text-decoration: none; }
        .ca-prov a:hover { text-decoration: underline; }

        .ca-steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
        @media (max-width: 1000px) { .ca-steps { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .ca-steps { grid-template-columns: 1fr; } }
        .ca-step { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px 20px; }
        .ca-step .snum { font-family: 'Instrument Serif', serif; font-size: 38px; color: #a78bfa; opacity: 0.6; font-style: italic; margin-bottom: 10px; }
        .ca-step .stitle { font-family: 'Instrument Serif', serif; font-size: 17px; color: #ebe8e3; margin-bottom: 8px; }
        .ca-step .scmd { font-size: 11px; color: rgba(255,255,255,0.45); line-height: 1.6; }

        .ca-cascade { max-width: 700px; margin: 0 auto; padding: 40px; background: rgba(124,58,237,0.04); border: 1px solid rgba(124,58,237,0.15); border-radius: 24px; }
        .ca-cascade pre { font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.8; white-space: pre-wrap; font-family: 'SF Mono', 'Fira Code', monospace; }

        .ca-footer { text-align: center; padding: 80px 32px 40px; border-top: 1px solid rgba(255,255,255,0.06); }
        .ca-footer p { font-size: 14px; color: rgba(255,255,255,0.4); line-height: 1.6; max-width: 600px; margin: 0 auto; }
        .ca-footer a { color: #a78bfa; text-decoration: none; }
        .ca-footer a:hover { text-decoration: underline; }
      `}</style>

      <div className="ca">
        {/* HERO */}
        <div className="ca-hero">
          <div className="badge">Open Source · MIT License</div>
          <h1>Cascade <em>AI</em></h1>
          <p>An open-source AI assistant that routes every message through up to 14 engines across 7 providers. If one is busy, the next fires in under 50 milliseconds. Built by Sarma Linux. Free to deploy.</p>
          <div className="btns">
            <a href="https://github.com/sarmakska/cascade-ai" className="btn-primary">View on GitHub →</a>
            <a href="#get-started" className="btn-secondary">Get Started</a>
          </div>
        </div>

        {/* STATS */}
        <div className="ca-stats">
          <div className="ca-stat"><div className="num"><em>36</em></div><div className="lbl">AI Engines</div></div>
          <div className="ca-stat"><div className="num"><em>7</em></div><div className="lbl">Providers</div></div>
          <div className="ca-stat"><div className="num"><em>14</em></div><div className="lbl">Max Cascade Depth</div></div>
          <div className="ca-stat"><div className="num"><em>41</em>ms</div><div className="lbl">Fastest Response</div></div>
          <div className="ca-stat"><div className="num"><em>685</em>B</div><div className="lbl">Primary Model</div></div>
        </div>

        {/* HOW CASCADE WORKS */}
        <div className="ca-section">
          <h2 className="sh">How the <em>cascade</em> works</h2>
          <p className="ss">Every message is routed through multiple AI engines in order of quality. If one is at capacity, the next takes over instantly. Users never wait. Users never see errors.</p>
          <div className="ca-cascade">
            <pre>{`User: "What is the UK minimum wage now?"
  ↓
Auto-router detects "now" → routes to Live mode
  ↓
Step 1: Gemini 2.5 Flash + Google Search → 429 (busy)
Step 2: Gemini 2.5 Flash Lite + Search  → 200 OK ✓
  ↓
Streams answer with cited sources in real time
  ↓
Shows: "Cascade AI · Live · Gemini 2.5 Flash Lite · 1.8s"
  ↓
Memory extracts: "User asked about UK employment law"
  → remembered in all future conversations`}</pre>
          </div>
        </div>

        {/* 6 MODES */}
        <div className="ca-section">
          <h2 className="sh">Six <em>modes</em></h2>
          <p className="ss">Each mode is backed by a different cascade of engines, optimised for a specific type of task. The auto-router picks the right one from your message — or you choose manually.</p>
          <div className="ca-mode">
            {MODES.map(m => (
              <div key={m.name} className="ca-mode-card">
                <div className="emoji">{m.emoji}</div>
                <div className="name">{m.name}</div>
                <div className="meta">{m.limit} · {m.depth}-engine cascade</div>
                <div className="engine">{m.engine}</div>
                <div className="desc">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FEATURES */}
        <div className="ca-section">
          <h2 className="sh">Built-in <em>features</em></h2>
          <p className="ss">Every feature below works out of the box. No plugins. No extensions. Just clone, add your keys, and deploy.</p>
          <div className="ca-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="ca-card">
                <div className="icon">{f.icon}</div>
                <div className="title">{f.title}</div>
                <div className="desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* PROVIDERS */}
        <div className="ca-section">
          <h2 className="sh">Powered by <em>7 providers</em></h2>
          <p className="ss">Every provider offers a free tier — no credit card needed for any of them. Sign up, grab your API key, and add it to your .env.local file. You can add multiple keys per provider for higher throughput.</p>
          <div className="ca-providers">
            {PROVIDERS.map(p => (
              <div key={p.name} className="ca-prov">
                <div className="pname" style={{ borderLeft: `3px solid ${p.color}`, paddingLeft: 12 }}>{p.name}</div>
                <div className="pmodels">{p.models}</div>
                <div className="pspeed">{p.speed}</div>
                <a href={p.url} target="_blank" rel="noopener noreferrer">Sign up (free) →</a>
              </div>
            ))}
          </div>
        </div>

        {/* GET STARTED */}
        <div className="ca-section" id="get-started">
          <h2 className="sh">Get <em>started</em></h2>
          <p className="ss">Five steps to your own Cascade AI. Total setup time: under 30 minutes. Total cost: nothing.</p>
          <div className="ca-steps">
            {STEPS.map(s => (
              <div key={s.num} className="ca-step">
                <div className="snum">{s.num}</div>
                <div className="stitle">{s.title}</div>
                <div className="scmd">{s.cmd}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div className="ca-footer">
          <p>
            Cascade AI is open source under the <a href="https://github.com/sarmakska/cascade-ai/blob/main/LICENSE">MIT License</a>.
            Built by <a href="https://sarmalinux.com">Sarma Linux</a>.
            <br /><br />
            A huge thank you to Groq, SambaNova, Cerebras, Google, OpenRouter, Cloudflare, Tavily,
            Black Forest Labs, DeepSeek, Meta, and Alibaba/Qwen for making cutting-edge AI accessible through generous free tiers.
          </p>
        </div>
      </div>
    </div>
  )
}
