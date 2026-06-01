/**
 * Live-data tool functions.
 *
 * All sources are free, no-key public APIs. Use these as ready-made tool
 * implementations for any chat path that needs current data.
 *
 *   getWeather(location)      Open-Meteo. Free, no key.
 *                             https://open-meteo.com/
 *                             ~10 000 requests/day soft cap.
 *
 *   getExchangeRates(base, ?) Frankfurter (ECB rates). Free, no key.
 *                             https://www.frankfurter.app/
 *                             No documented rate cap; fair use.
 *
 *   getNews(?query)           Hacker News via Algolia search. Free, no key.
 *                             https://hn.algolia.com/api
 *                             No documented hard cap.
 *
 * Example:
 *   const w = await getWeather('London')
 *   const fx = await getExchangeRates('GBP', ['EUR', 'USD'])
 *   const news = await getNews('rust')
 */

import { z } from 'zod'

export const WeatherSchema = z.object({
    location: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    temperatureC: z.number(),
    windKph: z.number(),
    weatherCode: z.number(),
    timeIso: z.string(),
})
export type Weather = z.infer<typeof WeatherSchema>

export async function getWeather(location: string): Promise<Weather> {
    const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
        { signal: AbortSignal.timeout(8000) },
    )
    if (!geo.ok) throw new Error(`geocoding failed: ${geo.status}`)
    const geoData = await geo.json() as any
    const first = geoData?.results?.[0]
    if (!first) throw new Error(`location not found: ${location}`)

    const fc = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}&current=temperature_2m,wind_speed_10m,weather_code`,
        { signal: AbortSignal.timeout(8000) },
    )
    if (!fc.ok) throw new Error(`forecast failed: ${fc.status}`)
    const fcData = await fc.json() as any
    return WeatherSchema.parse({
        location: first.name,
        latitude: first.latitude,
        longitude: first.longitude,
        temperatureC: fcData?.current?.temperature_2m ?? 0,
        windKph: fcData?.current?.wind_speed_10m ?? 0,
        weatherCode: fcData?.current?.weather_code ?? 0,
        timeIso: String(fcData?.current?.time ?? new Date().toISOString()),
    })
}

export const ExchangeRatesSchema = z.object({
    base: z.string(),
    date: z.string(),
    rates: z.record(z.string(), z.number()),
})
export type ExchangeRates = z.infer<typeof ExchangeRatesSchema>

export async function getExchangeRates(base = 'GBP', targets?: string[]): Promise<ExchangeRates> {
    const sym = targets?.length ? `&symbols=${targets.map((s) => s.toUpperCase()).join(',')}` : ''
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base.toUpperCase()}${sym}`, {
        signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`frankfurter failed: ${res.status}`)
    const data = await res.json() as any
    return ExchangeRatesSchema.parse({
        base: data?.base ?? base.toUpperCase(),
        date: String(data?.date ?? ''),
        rates: data?.rates ?? {},
    })
}

export const NewsItemSchema = z.object({
    title: z.string(),
    url: z.string().optional(),
    points: z.number().optional(),
    author: z.string().optional(),
    createdAt: z.string().optional(),
})
export const NewsSchema = z.object({ items: z.array(NewsItemSchema) })
export type News = z.infer<typeof NewsSchema>

export async function getNews(query?: string): Promise<News> {
    const url = query
        ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`
        : `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`hn failed: ${res.status}`)
    const data = await res.json() as any
    const items = (data?.hits ?? []).map((h: any) => ({
        title: String(h.title ?? h.story_title ?? ''),
        url: h.url ?? undefined,
        points: typeof h.points === 'number' ? h.points : undefined,
        author: h.author ?? undefined,
        createdAt: h.created_at ?? undefined,
    }))
    return NewsSchema.parse({ items })
}
