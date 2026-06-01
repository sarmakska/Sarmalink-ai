# Voice routes

## POST /api/v1/tts

Body:

```json
{ "text": "Hello world", "voice": "default", "language": "en" }
```

Returns `audio/wav` bytes.

Cascade:

1. Cloudflare Workers AI MeloTTS, rotating across up to four account/token pairs.
2. Gemini TTS (`gemini-2.5-flash-preview-tts`), rotating across all configured Gemini keys.

Supported language codes: `en`, `es`, `fr`, `zh`, `ja`, `ko`.

## POST /api/v1/stt

`multipart/form-data` with one field, `file`, containing the audio (webm, mp3, wav, m4a all accepted).

Returns:

```json
{ "ok": true, "text": "...", "language": "en", "provider": "groq" }
```

Cascade:

1. Groq Whisper Large v3 Turbo, rotating across all keys.
2. Cloudflare Workers AI Whisper, rotating across account/token pairs.

## Required env (example)

```
GROQ_API_KEY=your-groq-key
GROQ_API_KEY_2=your-other-groq-key
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-token
GOOGLE_GEMINI_API_KEY=your-gemini-key
```
