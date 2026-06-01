# Image generation

`POST /api/v1/images/generate`

Body:

```json
{ "prompt": "a cottage on a cliff at sunset", "model": "@cf/black-forest-labs/flux-1-schnell" }
```

Response:

```json
{ "ok": true, "base64": "iVBORw0...", "url": null, "provider": "cloudflare-flux" }
```

When R2 is configured (`R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`), the route also uploads the PNG and returns the object URL in `url`.

Cascade: rotates across up to four Cloudflare account/token pairs.

## Required env (example)

```
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_ACCOUNT_ID_2=your-other-account-id
CLOUDFLARE_API_TOKEN_2=your-other-token

R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_BUCKET_NAME=sarmalink-ai-attachments
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret
```
