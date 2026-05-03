# Make SarmaLink-AI yours

SarmaLink-AI is fully open-source under MIT. Fork it, rebrand it, plug
in your Supabase, change the logo, swap the colours, and ship a
production AI gateway under your own brand in an afternoon.

This guide covers the full white-label path:

1. Fork the repo
2. Spin up the front end with Vercel v0
3. Provision your own Supabase
4. Swap logo, colours, copy
5. Wire your own auth, login, and dashboard
6. Deploy to Vercel
7. Optional: connect the [terraform-stack](https://github.com/sarmakska/terraform-stack) so the whole thing is reproducible

## Step 1: Fork

```bash
gh repo fork sarmakska/Sarmalink-ai --clone --remote
cd Sarmalink-ai
git remote rename origin upstream
git remote rename fork origin
```

You now have a fork you control with `upstream` pointing back at this
repo so you can pull future improvements.

## Step 2: Spin a front end with Vercel v0

The repo ships with a working front end already, but if you want a
**different** UI under the same backend — your branding, your
information architecture, your funnel — v0 is the fastest path.

> **Open v0:** https://v0.dev

Paste the prompt below. Replace the placeholders inside `<<...>>`. v0
will generate a fully styled Next.js front end you can drop into the
repo's `app/` directory.

### v0 prompt template (copy/paste)

```
Build a complete Next.js 15 (App Router) front end for an
OpenAI-compatible AI gateway product called <<YOUR PRODUCT NAME>>.

PRODUCT POSITIONING
- Name: <<YOUR PRODUCT NAME>>
- One-line: <<YOUR ONE-LINE PITCH e.g. "Free frontier AI for builders, with automatic failover across 14 engines">>
- Audience: <<YOUR AUDIENCE e.g. "indie developers and small teams">>
- Tone: <<YOUR TONE e.g. "confident, technical, no fluff">>

VISUAL IDENTITY
- Primary colour: <<HEX e.g. #7c3aed>>
- Accent colour: <<HEX e.g. #22d3ee>>
- Background: dark (zinc-950 base) with subtle gradient blobs
- Typography: Geist for body, Playfair Display for hero serif headings
- Logo: text-only, font <<YOUR LOGO FONT e.g. Lobster>>, no icon
- Vibe reference: <<3 reference sites e.g. linear.app, vercel.com, anthropic.com>>

PAGES TO GENERATE (each as its own file under app/)
1. / (home) — hero, three feature blocks, code sample of OpenAI-compatible call,
   social proof strip, CTA to sign up.
2. /pricing — three tiers (Free / Pro / Team) with the same OpenAI-compatible
   endpoint and quota tier table.
3. /docs — start page linking to: quickstart, models list, examples.
4. /login — email + magic link form (Supabase Auth) and OAuth buttons (GitHub, Google).
5. /signup — same as login but optimised for first-time conversion.
6. /dashboard — authenticated. Shows: API keys (create, revoke), usage
   chart (daily token count for last 30 days), recent requests table,
   plan usage gauge against the user's quota.
7. /dashboard/keys — full CRUD for API keys with copy-to-clipboard.
8. /dashboard/usage — detailed usage breakdown by model and engine.
9. /dashboard/billing — current plan, upgrade button to Stripe.
10. /settings — profile, theme, sign out.

COMPONENTS
- Top nav with logo (left), Pricing/Docs/Sign in (right), mobile menu
- Footer with three columns (Product, Resources, Legal)
- Auth-gated layout for /dashboard/* using Supabase server-side session check
- Code samples in shadcn/ui Tabs (curl, Node.js, Python)

TECH
- Next.js 15 App Router, React 19, TypeScript
- Tailwind CSS v4, shadcn/ui, Radix UI
- Framer Motion for hero entrance animations only
- recharts for the dashboard usage chart
- @supabase/ssr for auth (already in the repo's package.json)
- lucide-react icons

CONSTRAINTS
- No emojis anywhere unless the user has specified them in their copy.
- Server components by default. Client components only where needed
  (forms, charts, interactive dashboard widgets).
- Accessible: every form has labels, every button has an aria-label
  where the icon stands alone, focus rings visible on dark.
- Mobile-first; everything must look right at 375px wide.

DELIVER
Generate every page and the components. Provide a final list of files
written and the layout file structure. Do not generate fake data —
mark dashboard data with TODO comments showing exactly what
Supabase query or API call should fill it.
```

That prompt typically lands you ~12 files of generated code. Drop them
into your fork's `app/` directory, replacing the existing pages. Keep
`app/api/*` from the original — that is the backend.

## Step 3: Provision your own Supabase

The fastest path: use [terraform-stack](https://github.com/sarmakska/terraform-stack)
which provisions Supabase + Vercel + Cloudflare in one apply. Or do it
manually:

1. Create a Supabase project at https://app.supabase.com
2. Copy the project URL, anon key, service-role key
3. Run the SQL migrations from `supabase/migrations/` in order via the
   Supabase SQL editor or `supabase db push`
4. Enable Auth providers you want (Email, GitHub, Google) in the
   Authentication settings

### Required env vars

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service>

# At least one provider key for the failover gateway to work:
GROQ_API_KEY=...           # recommended primary
OPENAI_API_KEY=...         # optional fallback
GEMINI_API_KEY=...         # optional fallback
OPENROUTER_API_KEY=...     # optional fallback

# Branding (read by the layout/components)
NEXT_PUBLIC_APP_NAME="My AI Gateway"
NEXT_PUBLIC_APP_DOMAIN="my-gateway.com"
```

A complete env list is in `docs/ENV-MATRIX.md`.

## Step 4: Swap logo, colours, copy

### Logo

Edit `components/layout/animated-logo.tsx` (or whatever the v0
generation produced). The default is text-only Lobster script;
replace with your wordmark.

### Colours

Tailwind v4 reads tokens from `app/globals.css`. Look for the CSS
custom properties block:

```css
:root {
  --primary: 262 83% 58%;       /* your primary HSL */
  --accent: 187 95% 53%;        /* your accent HSL */
  --background: 240 10% 4%;
}
```

Update the HSL values. Tailwind classes like `bg-primary` and
`text-primary` pick them up everywhere automatically.

### Copy

Strings live in the page components themselves (no i18n yet). Use a
find-and-replace across `app/**/*.tsx` to swap "SarmaLink-AI" for your
product name. The v0 prompt above already inlines your name.

## Step 5: Auth, login, dashboard

The repo ships with auth helpers in `lib/supabase/`. The v0-generated
`/login`, `/signup`, and `/dashboard` use them directly:

```typescript
// app/login/page.tsx (skeleton)
'use server'
import { createClient } from '@/lib/supabase/server'

export async function signInWithEmail(email: string) {
  const supabase = await createClient()
  await supabase.auth.signInWithOtp({ email })
}
```

The `/dashboard` layout file should redirect unauthenticated users to
`/login`:

```typescript
// app/dashboard/layout.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')
  return <>{children}</>
}
```

API key management is wired in `app/api/v1/keys/`. The v0 dashboard
calls those endpoints from the client.

## Step 6: Deploy to Vercel

```bash
# from your fork
vercel link
vercel env pull .env.local           # pulls down anything you set in dashboard
vercel deploy --prod
```

Or via the Vercel dashboard:
1. Import your fork
2. Set every env var from Step 3
3. Deploy

The first build runs Supabase migrations against the project URL you
configured. Make sure your service role key is set or the build will
exit early with a clear error.

## Step 7: Reproducible everywhere with terraform-stack (optional)

If you want the whole stack — Vercel project + Supabase project +
Cloudflare DNS + R2 + KV — to be reproducible from scratch in any
region:

```bash
git clone https://github.com/sarmakska/terraform-stack.git
cd terraform-stack
cp terraform.tfvars.example terraform.tfvars
# edit project_name, domain, github_repo to point at your fork
terraform init && terraform apply
```

You then have a full second environment (staging, preview region, etc.)
with one command.

## What you can change vs what to keep

You can change:
- All branding, copy, colours, fonts, layouts
- The set of pages, the information architecture
- The pricing tiers, the marketing site, the docs
- The login providers, the dashboard widgets

You should keep (or you will be rebuilding the backend):
- `app/api/*` — the OpenAI-compatible gateway, failover, plugin routes
- `lib/providers/` — registry and failover logic
- `lib/plugins/` — cross-repo plugin system
- `lib/integrations/manus.ts` — Manus client
- `supabase/migrations/` — schema for keys, usage, sessions

That split is the point: the backend is the value, the front end is
where you make it yours.

## Licence reminder

MIT. The only requirement is keeping the LICENSE file in your fork.
Attribution in your README is appreciated but not required.

## Help

- Issues on the upstream repo: https://github.com/sarmakska/Sarmalink-ai/issues
- Sarma's site: https://sarmalinux.com
- Manus referral (extra credits): https://manus.im/invitation/AIRTDVWVEWKCK4R
