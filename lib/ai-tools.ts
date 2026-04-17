// ============================================================================
// Cascade AI — Live Data Tools (free, no API keys needed)
// Called by the chat route when it detects intent for real-time data.
// All APIs are truly free, no keys, no rate limits worth worrying about.
// ============================================================================

// ── Exchange Rates (frankfurter.app — ECB data, free, no key) ────────────
export async function getExchangeRates(baseCurrency = 'GBP', targets?: string[]): Promise<string> {
    try {
        const to = targets?.join(',') || 'USD,EUR,INR,CNY,JPY,AED,HKD,AUD,CAD,CHF,SGD,TRY,BRL'
        const res = await fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}&to=${to}`)
        if (!res.ok) return '[Exchange rate service unavailable]'
        const data = await res.json()
        const lines = Object.entries(data.rates as Record<string, number>)
            .map(([cur, rate]) => `1 ${baseCurrency} = ${rate.toFixed(4)} ${cur}`)
            .join('\n')
        return `**Live Exchange Rates** (source: European Central Bank, ${data.date})\n\n${lines}`
    } catch {
        return '[Exchange rate service unavailable]'
    }
}

// ── Weather (Open-Meteo — free, no key, accurate, global) ────────────────
const WEATHER_CODES: Record<number, string> = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
    55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    85: 'Slight snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
    96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
}

interface GeoResult { name: string; latitude: number; longitude: number; country: string }

async function geocode(location: string): Promise<GeoResult | null> {
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en`)
        const data = await res.json()
        const r = data.results?.[0]
        if (!r) return null
        return { name: r.name, latitude: r.latitude, longitude: r.longitude, country: r.country }
    } catch { return null }
}

export async function getWeather(location: string): Promise<string> {
    try {
        const geo = await geocode(location)
        if (!geo) return `[Could not find location: "${location}"]`
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weathercode,windspeed_10m,winddirection_10m,uv_index` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=auto&forecast_days=3`
        )
        if (!res.ok) return '[Weather service unavailable]'
        const data = await res.json()
        const c = data.current
        const desc = WEATHER_CODES[c?.weathercode] ?? 'Unknown'

        let result = `**Weather in ${geo.name}, ${geo.country}** (live)\n\n`
        result += `**Now:** ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C) — ${desc}\n`
        result += `Wind: ${c.windspeed_10m} km/h · Humidity: ${c.relative_humidity_2m}% · UV: ${c.uv_index}\n\n`

        if (data.daily) {
            result += '**3-Day Forecast:**\n'
            for (let i = 0; i < 3; i++) {
                const day = new Date(data.daily.time[i]).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                const hi = data.daily.temperature_2m_max[i]
                const lo = data.daily.temperature_2m_min[i]
                const rain = data.daily.precipitation_probability_max[i]
                const code = WEATHER_CODES[data.daily.weathercode[i]] ?? ''
                result += `- **${day}:** ${lo}°C – ${hi}°C · ${code} · ${rain}% rain chance\n`
            }
        }
        return result
    } catch {
        return '[Weather service unavailable]'
    }
}

// ── Container / Shipment Tracking ────────────────────────────────────────
// Uses Tavily to search for real container status, then appends direct links.
const TAVILY_KEYS_POOL = Array.from({ length: 6 }, (_, i) =>
    process.env[`TAVILY_API_KEY_${i + 1}`]
).filter(Boolean) as string[]

// Container prefix → carrier mapping (ISO 6346)
const CARRIER_PREFIXES: Record<string, string> = {
    'MAEU': 'Maersk', 'MSKU': 'Maersk', 'MRKU': 'Maersk', 'MRSU': 'Maersk',
    'MSCU': 'MSC', 'MEDU': 'MSC',
    'CMAU': 'CMA CGM', 'CGMU': 'CMA CGM',
    'HLCU': 'Hapag-Lloyd', 'HLXU': 'Hapag-Lloyd',
    'CCLU': 'COSCO', 'COSU': 'COSCO', 'CSNU': 'COSCO',
    'EISU': 'Evergreen', 'EGHU': 'Evergreen', 'EMCU': 'Evergreen',
    'ONEY': 'ONE', 'ONEU': 'ONE',
    'YMLU': 'Yang Ming', 'YMMU': 'Yang Ming',
    'ZIMU': 'ZIM', 'ZCSU': 'ZIM',
    'TGBU': 'Hapag-Lloyd', 'TRIU': 'Triton (leased)',
    'TCNU': 'Textainer (leased)', 'FSCU': 'Florens (leased)',
    'GESU': 'Seaco (leased)', 'CAIU': 'CAI (leased)',
}

function detectCarrier(ref: string): string | null {
    const prefix = ref.slice(0, 4).toUpperCase()
    return CARRIER_PREFIXES[prefix] || null
}

function getTrackingUrl(carrier: string, ref: string): string {
    const urls: Record<string, string> = {
        'Maersk': `https://www.maersk.com/tracking/${ref}`,
        'MSC': `https://www.msc.com/track-a-shipment?agencyPath=msc&trackingNumber=${ref}`,
        'CMA CGM': `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${ref}`,
        'Hapag-Lloyd': `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${ref}`,
        'COSCO': `https://elines.coscoshipping.com/ebusiness/cargotracking?trackingType=CONTAINER&number=${ref}`,
        'Evergreen': `https://www.shipmentlink.com/servlet/TDB1_CargoTracking.do?BolNos=${ref}`,
        'ONE': `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${ref}`,
        'Yang Ming': `https://www.yangming.com/e-service/track-trace/track-trace.aspx?containerNo=${ref}`,
        'ZIM': `https://www.zim.com/tools/track-a-shipment?consnumber=${ref}`,
    }
    return urls[carrier] || ''
}

export async function getTrackingLinks(containerOrRef: string): Promise<string> {
    const ref = containerOrRef.trim().toUpperCase()
    const carrier = detectCarrier(ref)

    // Search for REAL status using multiple specific queries via Tavily
    let searchResults = ''
    const queries = [
        `"${ref}" container tracking current location port`,
        `${ref} shipping vessel ETA arrival`,
        carrier ? `${carrier} ${ref} tracking status` : `${ref} container shipment status`,
    ]

    for (const query of queries) {
        if (searchResults) break
        for (const key of TAVILY_KEYS_POOL) {
            try {
                const res = await fetch('https://api.tavily.com/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: key,
                        query,
                        max_results: 5,
                        search_depth: 'advanced',
                    }),
                })
                if (res.status === 429) continue
                if (!res.ok) continue
                const data = await res.json()
                const relevant = (data.results ?? []).filter((r: any) =>
                    r.content?.toLowerCase().includes(ref.toLowerCase()) ||
                    r.title?.toLowerCase().includes(ref.toLowerCase()) ||
                    r.content?.toLowerCase().includes('container') ||
                    r.content?.toLowerCase().includes('vessel')
                )
                if (relevant.length > 0) {
                    searchResults = relevant
                        .slice(0, 4)
                        .map((r: any) => `Source: ${r.url}\n${r.title}\n${r.content?.slice(0, 500) ?? ''}`)
                        .join('\n\n---\n\n')
                }
                break
            } catch { continue }
        }
    }

    let result = ''

    if (carrier) {
        result += `Container ${ref} belongs to **${carrier}**.\n\n`
        const url = getTrackingUrl(carrier, ref)
        if (url) {
            result += `**Direct tracking link:** ${url}\n\n`
        }
    }

    if (searchResults) {
        result += `**Live search results for ${ref}:**\n\n${searchResults}\n\n`
        result += `Use the information above to answer the user's question about where the container is, its current status, which vessel it's on, and when it arrives. If the search results contain port names, ETAs, or vessel names, include them in your answer.\n\n`
    } else {
        result += `I searched the web but couldn't find live tracking data for ${ref}. This may mean the container hasn't been loaded yet, or the tracking data isn't publicly indexed.\n\n`
        if (carrier) {
            result += `The user should check the ${carrier} tracking link above for real-time status.\n\n`
        }
    }

    if (!carrier) {
        result += `**All shipping line tracking links for ${ref}:**\n`
        result += `- Maersk: https://www.maersk.com/tracking/${ref}\n`
        result += `- MSC: https://www.msc.com/track-a-shipment?agencyPath=msc&trackingNumber=${ref}\n`
        result += `- CMA CGM: https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${ref}\n`
        result += `- Hapag-Lloyd: https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${ref}\n`
        result += `- COSCO: https://elines.coscoshipping.com/ebusiness/cargotracking?trackingType=CONTAINER&number=${ref}\n`
        result += `- ONE: https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${ref}\n`
    }

    return result
}

// ── Currency Conversion (instant) ────────────────────────────────────────
export async function convertCurrency(amount: number, from: string, to: string): Promise<string> {
    try {
        const res = await fetch(`https://api.frankfurter.app/latest?amount=${amount}&from=${from.toUpperCase()}&to=${to.toUpperCase()}`)
        if (!res.ok) return '[Conversion unavailable]'
        const data = await res.json()
        const converted = Object.values(data.rates as Record<string, number>)[0]
        return `**${amount.toLocaleString()} ${from.toUpperCase()} = ${converted?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${to.toUpperCase()}**\n\nRate: 1 ${from.toUpperCase()} = ${(converted! / amount).toFixed(4)} ${to.toUpperCase()} (ECB, ${data.date})`
    } catch {
        return '[Conversion unavailable]'
    }
}
