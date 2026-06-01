# Multi-step agent runner

`POST /api/v1/agent` with `{ "goal": "..." }` returns a `text/event-stream` of decomposed work.

Event shapes:

```
data: {"type":"step","index":0,"title":"Outline the sections"}
data: {"type":"token","index":0,"text":"..."}
data: {"type":"step_done","index":0,"output":"..."}
data: {"type":"done","summary":"..."}
data: {"type":"error","message":"..."}
```

Caps: five steps, sixty seconds per worker, one synthesiser call at the end. All three layers (planner, worker, synthesiser) call Groq Llama 3.3 70B.

## Client snippet

```ts
const res = await fetch('/api/v1/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal: 'Plan a one-week study schedule for learning Rust' }),
})
const reader = res.body!.getReader()
const decoder = new TextDecoder()
let buf = ''
while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    for (const line of buf.split('\n\n')) {
        if (line.startsWith('data: ')) {
            const ev = JSON.parse(line.slice(6))
            // handle ev
        }
    }
    buf = buf.endsWith('\n\n') ? '' : buf.slice(buf.lastIndexOf('\n\n') + 2)
}
```
