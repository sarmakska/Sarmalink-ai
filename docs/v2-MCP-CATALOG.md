# MCP-shaped tool catalog

`POST /api/v1/mcp/catalog` exposes an in-process tool registry over HTTP.

Authentication: bearer token from `MCP_INTERNAL_KEY`.

```
Authorization: Bearer <MCP_INTERNAL_KEY>
```

Request shapes:

```json
{ "tool": "list_tools" }
{ "tool": "echo", "args": { "message": "hi" } }
```

Built-in demo tools:

| Tool          | Args                | Returns                |
| ------------- | ------------------- | ---------------------- |
| `current_time`| `{}`                | `{ "now": "2026-..." }`|
| `random_uuid` | `{}`                | `{ "uuid": "..." }`    |
| `echo`        | `{ "message": "..." }` | `{ "message": "..." }` |

## Registering a tool

```ts
import { registerTool } from '@/lib/v2/mcp-catalog'
import { z } from 'zod'

registerTool({
    name: 'add',
    description: 'Add two numbers.',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => ({ sum: a + b }),
})
```

The catalog is separate from the existing MCP passthrough at `/api/v1/mcp`, which forwards to remote MCP servers configured per-plugin.
