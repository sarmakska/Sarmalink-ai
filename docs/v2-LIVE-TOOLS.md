# Live data tools

`lib/tools/live.ts` provides three async functions backed by free, no-key public APIs.

## getWeather(location)

Source: Open-Meteo (`open-meteo.com`).
Rate limit: ~10 000 requests/day soft cap.

```ts
import { getWeather } from '@/lib/tools/live'

const w = await getWeather('London')
// { location, latitude, longitude, temperatureC, windKph, weatherCode, timeIso }
```

## getExchangeRates(base, targets?)

Source: Frankfurter (ECB rates, `frankfurter.app`).
Rate limit: fair use, no documented hard cap.

```ts
const fx = await getExchangeRates('GBP', ['EUR', 'USD'])
// { base: 'GBP', date: '2026-06-01', rates: { EUR: 1.18, USD: 1.27 } }
```

## getNews(query?)

Source: Hacker News via Algolia (`hn.algolia.com`).
Rate limit: no documented hard cap.

```ts
const n = await getNews('rust')
// { items: [{ title, url, points, author, createdAt }] }
```

## Wiring

When the auto-router or smart classifier returns `live`, your chat path can invoke any combination of these tools and stitch the result into the system prompt. None of them require an API key.
