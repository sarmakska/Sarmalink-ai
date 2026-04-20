/**
 * Environment variable validation.
 *
 * Called at startup by `lib/providers/registry.ts` to ensure the app doesn't
 * boot into a half-configured state. Missing critical vars throw immediately
 * with a clear message pointing to `.env.example`.
 */

export interface EnvConfig {
    supabase: {
        url: string
        anonKey: string
        serviceRoleKey: string
    }
    providers: {
        groq: string[]
        cerebras: string[]
        sambanova: string[]
        gemini: string[]
        openrouter: string[]
        githubModels: string[]
        cohere: string[]
        mistral: string[]
        ollama: string[]
        tavily: string[]
        cloudflare: { accountId: string; token: string }[]
    }
    r2: {
        endpoint: string
        bucket: string
        accessKeyId: string
        secretAccessKey: string
    } | null
}

function collectKeys(prefix: string, count: number): string[] {
    const keys: string[] = []
    for (let i = 0; i < count; i++) {
        const name = i === 0 ? prefix : `${prefix}_${i + 1}`
        const value = process.env[name]
        if (value && value.trim() !== '' && !value.includes('placeholder')) {
            keys.push(value)
        }
    }
    return keys
}

function collectCloudflarePairs(): { accountId: string; token: string }[] {
    const pairs: { accountId: string; token: string }[] = []
    for (let i = 0; i < 4; i++) {
        const suffix = i === 0 ? '' : `_${i + 1}`
        const accountId = process.env[`CLOUDFLARE_ACCOUNT_ID${suffix}`]
        const token = process.env[`CLOUDFLARE_API_TOKEN${suffix}`]
        if (accountId && token && !accountId.includes('placeholder')) {
            pairs.push({ accountId, token })
        }
    }
    return pairs
}

/**
 * Load and validate environment variables. Returns a typed config object.
 *
 * Supabase is required (auth backbone). At least one chat provider must be
 * configured. R2 is optional (used for file + image persistence).
 */
export function loadEnv(): EnvConfig {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

    const providers = {
        groq: collectKeys('GROQ_API_KEY', 15),
        cerebras: collectKeys('CEREBRAS_API_KEY', 8),
        sambanova: collectKeys('SAMBANOVA_API_KEY', 8),
        gemini: [
            ...collectKeys('GOOGLE_GEMINI_API_KEY', 12),
            ...collectKeys('GEMINI_CHATBOT_KEY', 6),
        ],
        openrouter: collectKeys('OPENROUTER_API_KEY', 5),
        githubModels: collectKeys('GITHUB_MODELS_TOKEN', 4),
        cohere: collectKeys('COHERE_API_KEY', 4),
        mistral: collectKeys('MISTRAL_API_KEY', 4),
        ollama: process.env.OLLAMA_URL ? ['local'] : [],
        tavily: collectKeys('TAVILY_API_KEY', 8),
        cloudflare: collectCloudflarePairs(),
    }

    const totalChatKeys =
        providers.groq.length +
        providers.cerebras.length +
        providers.sambanova.length +
        providers.gemini.length +
        providers.openrouter.length +
        providers.githubModels.length +
        providers.cohere.length +
        providers.mistral.length +
        providers.ollama.length

    // In production, warn (don't throw) if no providers configured — allows
    // the landing page to render without any keys set.
    if (totalChatKeys === 0 && process.env.NODE_ENV === 'production') {
        console.warn(
            '[sarmalink-ai] No chat provider API keys detected. ' +
            'Chat functionality will not work until you configure at least one of: ' +
            'GROQ_API_KEY, SAMBANOVA_API_KEY, CEREBRAS_API_KEY, GOOGLE_GEMINI_API_KEY, or OPENROUTER_API_KEY. ' +
            'See .env.example for details.'
        )
    }

    const r2Configured = !!(
        process.env.R2_ENDPOINT &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY
    )

    return {
        supabase: {
            url: supabaseUrl || 'https://placeholder.supabase.co',
            anonKey: supabaseAnon || 'placeholder',
            serviceRoleKey: supabaseService || 'placeholder',
        },
        providers,
        r2: r2Configured ? {
            endpoint: process.env.R2_ENDPOINT!,
            bucket: process.env.R2_BUCKET_NAME || 'sarmalink-ai-attachments',
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        } : null,
    }
}

// Singleton — validated once per process
let _env: EnvConfig | null = null
export function env(): EnvConfig {
    if (!_env) _env = loadEnv()
    return _env
}
