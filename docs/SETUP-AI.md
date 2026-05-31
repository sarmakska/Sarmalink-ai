# AI-Assisted Setup Guide

Let an AI assistant (Claude Code, ChatGPT, Gemini, Cursor, etc.) set up SarmaLink-AI for you. No terminal knowledge needed.

## How to use

1. Clone or download this repo
2. Open it in your AI coding tool (Claude Code, Cursor, VS Code with Copilot, etc.)
3. Paste the prompt below
4. Answer the AI's questions — it handles everything else

## The Setup Prompt

Copy and paste this entire block into your AI assistant:

---

```
I just cloned SarmaLink-AI and need help setting it up. Read CLAUDE.md first for project context.

Walk me through the full setup step by step. For each step, tell me exactly what to do, wait for me to confirm, then move on. Don't skip ahead.

## Step 1 — Install dependencies
Run `npm install` for me.

## Step 2 — Supabase setup
I need a Supabase account. Walk me through:
1. Creating a free Supabase project at https://supabase.com
2. Finding my project URL, anon key, and service role key (Settings > API)
3. Give me the exact values to paste back here

## Step 3 — Database tables
Once I give you the Supabase keys:
1. Read the migration file at `supabase/migrations/001_sarmalink_ai.sql`
2. Tell me to paste it into the Supabase SQL Editor and run it
3. Confirm the tables were created

## Step 4 — AI provider keys (minimum: Groq)
Walk me through getting a free API key from Groq:
1. Sign up at https://console.groq.com (free, Google sign-in)
2. Create an API key
3. I'll paste it back here

Then ask me if I want to add more providers (all optional, all free):
- SambaNova (DeepSeek V3.2 — frontier reasoning)
- Cerebras (ultra-fast inference)
- Google Gemini (live web search)
- OpenRouter (17+ free fallback models)
- Tavily (web search)
- Cloudflare (image generation + file storage)

For each one I say yes to, walk me through signup and key creation.

## Step 5 — Create .env.local
Using all the keys I gave you:
1. Read `.env.example` to see the template
2. Create `.env.local` with my actual keys filled in
3. Set NEXT_PUBLIC_APP_NAME to whatever I want my assistant called
4. Set NEXT_PUBLIC_COMPANY_NAME to my company/org name

## Step 6 — Verify setup
Run these commands and tell me if anything fails:
1. `npx tsc --noEmit` (typecheck)
2. `npm test` (should see 151 tests pass)
3. `npm run build` (production build)

If anything fails, fix it.

## Step 7 — Launch
Run `npm run dev` and tell me the URL to open.

## Step 8 — Optional: Deploy to Vercel
If I want to deploy publicly, walk me through:
1. Pushing the repo to my GitHub
2. Importing into Vercel at https://vercel.com
3. Setting all environment variables in Vercel's dashboard
4. Deploying

## Step 9 — Optional: Lock down registration
If I want to restrict who can sign up, tell me how to:
- Set up Supabase Auth email restrictions
- Use ADMIN_EMAILS env var to protect the health endpoint
- Disable public signups in Supabase dashboard (Authentication > Settings > Enable sign-ups toggle)

## After setup
If you fixed any bugs or improved anything during this setup, create a commit and tell me how to submit a PR back to https://github.com/sarmakska/sarmalink-ai — contributions are welcome.
```

---

## What the AI will do

The AI reads `CLAUDE.md` (project context), `.env.example` (all variables), and `supabase/migrations/` (database schema). It then:

1. Installs dependencies
2. Walks you through creating free accounts (Supabase, Groq, optional providers)
3. Creates your `.env.local` with your actual keys
4. Runs the database migration
5. Verifies the build works
6. Launches the app or deploys to Vercel
7. Optionally locks down registration

**Total time: ~15 minutes. Zero terminal knowledge required.**

## Supported AI tools

| Tool | How to use |
|---|---|
| **Claude Code** | Open repo in terminal, paste the prompt |
| **Cursor** | Open repo, Cmd+K or chat, paste the prompt |
| **VS Code + Copilot** | Open repo, Copilot Chat, paste the prompt |
| **ChatGPT (Code Interpreter)** | Upload the repo as a zip, paste the prompt |
| **Gemini** | Open in Google AI Studio or IDE plugin, paste the prompt |

## Troubleshooting

If the AI gets stuck, share the error message with it. Common issues:

- **"Cannot find module"** — run `npm install` again
- **Build fails** — check that all required env vars are set in `.env.local`
- **Auth not working** — verify Supabase URL and anon key are correct
- **No chat response** — verify at least one AI provider key (GROQ_API_KEY) is set

## Contributing back

If the AI improved something during your setup, please submit a PR. See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

Built by [Sarma Linux](https://sarmalinux.com) — open source, MIT license.
