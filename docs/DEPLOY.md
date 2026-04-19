# SarmaLink-AI Deployment Guide

## Prerequisites

- GitHub account with access to the repository
- Vercel account (free Hobby tier works)
- Supabase account (free tier: 1GB database, 50K monthly active users)
- At least one AI provider API key (all offer free tiers)

## 1. Supabase Project Setup

### Create project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Choose a region close to your Vercel deployment (e.g., London for UK).
3. Set a strong database password (you won't need it directly -- the app uses API keys).

### Run the migration

1. In the Supabase dashboard, go to **SQL Editor**.
2. Open `supabase/migrations/001_sarmalink_ai.sql` from the repo.
3. Paste the entire contents and click **Run**.

This creates:
- `ai_chat_sessions` -- chat conversations
- `ai_chat_usage` -- per-user daily quotas
- `ai_events` -- observability log
- `ai_user_memories` -- persistent user memory
- `ai_usage_today` -- admin usage view

### Collect credentials

From **Settings > API** in your Supabase project:
- `NEXT_PUBLIC_SUPABASE_URL` -- the project URL (e.g., `https://abcxyz.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` -- the `anon` / `public` key
- `SUPABASE_SERVICE_ROLE_KEY` -- the `service_role` key (keep secret)

### Configure auth

1. Go to **Authentication > Providers**.
2. Enable **Email** sign-in (enabled by default).
3. Optionally enable **Google**, **GitHub**, etc.
4. Under **URL Configuration**, set the Site URL to your production domain.

## 2. AI Provider API Keys

Sign up for free tiers (no credit card required for any of these):

| Provider   | Sign-up URL                                    | Key format     |
|------------|------------------------------------------------|----------------|
| Groq       | https://console.groq.com                       | `gsk_...`      |
| SambaNova  | https://cloud.sambanova.ai                     | plain string   |
| Cerebras   | https://cloud.cerebras.ai                      | `csk-...`      |
| Gemini     | https://aistudio.google.com/app/apikey          | `AIzaSy...`    |
| OpenRouter | https://openrouter.ai                           | `sk-or-v1-...` |
| Tavily     | https://app.tavily.com                          | `tvly-...`     |
| Cloudflare | https://dash.cloudflare.com                     | (account+token)|

**Tip:** Create multiple accounts per provider for higher throughput. The app supports up to 15 Groq keys, 18 Gemini keys, 8 SambaNova keys, etc.

## 3. Cloudflare R2 (Optional -- File Storage)

1. In the Cloudflare dashboard, go to **R2 Object Storage**.
2. Create a bucket named `sarmalink-ai-attachments` (or your preferred name).
3. Under **R2 > Manage R2 API Tokens**, create a token with read/write permissions.
4. Note the `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.

Without R2, file uploads still work via in-memory base64 processing, but files are not persisted between sessions.

## 4. Vercel Deployment

### Import project

1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Import the GitHub repository.
3. Framework Preset: **Next.js** (auto-detected).
4. Root Directory: `.` (default).
5. Build Command: `next build` (default).
6. Output Directory: `.next` (default).

### Environment variables

In the Vercel project settings, go to **Settings > Environment Variables** and add:

**Required:**
```
NEXT_PUBLIC_SUPABASE_URL       = https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJ...
SUPABASE_SERVICE_ROLE_KEY      = eyJ...
```

**At least one chat provider (add as many keys as you have):**
```
GROQ_API_KEY                   = gsk_...
GROQ_API_KEY_2                 = gsk_...
SAMBANOVA_API_KEY              = ...
CEREBRAS_API_KEY               = csk-...
GOOGLE_GEMINI_API_KEY          = AIzaSy...
OPENROUTER_API_KEY             = sk-or-v1-...
```

**Optional (enhanced features):**
```
TAVILY_API_KEY_1               = tvly-...
CLOUDFLARE_ACCOUNT_ID          = ...
CLOUDFLARE_API_TOKEN           = ...
R2_ENDPOINT                    = https://....r2.cloudflarestorage.com
R2_BUCKET_NAME                 = sarmalink-ai-attachments
R2_ACCESS_KEY_ID               = ...
R2_SECRET_ACCESS_KEY           = ...
NEXT_PUBLIC_APP_URL            = https://yourdomain.com
NEXT_PUBLIC_APP_NAME           = SarmaLink-AI
NEXT_PUBLIC_COMPANY_NAME       = Your Company
```

Set all variables for **Production**, **Preview**, and **Development** environments (or scope as needed).

### Deploy

Click **Deploy**. Vercel will build and deploy. First deploy takes 1-2 minutes.

## 5. Custom Domain (Optional)

1. In Vercel project settings, go to **Settings > Domains**.
2. Add your domain (e.g., `ai.yourcompany.com`).
3. Update DNS records as instructed by Vercel (CNAME or A record).
4. Update `NEXT_PUBLIC_APP_URL` to match your domain.
5. Update **Supabase > Authentication > URL Configuration > Site URL** to your domain.

## 6. Production Checklist

### Critical

- [ ] Supabase migration has been run (all 4 tables + 1 view exist)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set (not the anon key)
- [ ] At least one chat provider key is configured and valid
- [ ] Supabase Site URL matches your production domain
- [ ] Supabase redirect URLs include your production domain

### Recommended

- [ ] Multiple Groq keys configured (prevents rate limiting under load)
- [ ] Gemini keys configured (enables Live mode and PDF extraction)
- [ ] Tavily key configured (enables web search fallback)
- [ ] Cerebras key configured (enables AI auto-router, ~200ms classification)
- [ ] Cloudflare keys configured (enables image generation)
- [ ] R2 configured (enables persistent file storage)
- [ ] OpenRouter key configured (last-resort fallback)

### Monitoring

- [ ] Check `ai_events` table periodically for `rate_limit` and `error` events
- [ ] Monitor `ai_usage_today` view for daily usage patterns
- [ ] Set up Supabase database alerts if available
- [ ] Review Vercel function logs for unhandled exceptions

### Security

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is never exposed to the client
- [ ] All API keys are in Vercel environment variables (not in code)
- [ ] Supabase auth providers are configured (email + optional OAuth)
- [ ] Consider adding RLS policies to database tables (not currently implemented)

## Updating

1. Push changes to `main` (or your production branch).
2. Vercel auto-deploys on push.
3. For database schema changes, run new migration SQL in Supabase SQL Editor manually.
4. For new provider keys, add them in Vercel Settings > Environment Variables and redeploy.

## Local Development

```bash
# Clone the repo
git clone https://github.com/sarmakska/sarmalink-ai.git
cd sarmalink-ai

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your actual keys

# Start dev server
npm run dev
```

The dev server runs at `http://localhost:3000`.
