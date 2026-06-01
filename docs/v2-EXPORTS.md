# Exports: PDF and XLSX

## POST /api/v1/export/pdf

Body:

```json
{ "content": "# Title\n\nSome **markdown** body.", "filename": "report" }
```

Returns `application/pdf`. Built with pdfkit. Markdown handling is intentionally minimal: `# `, `## `, `### ` headings, blank-line paragraphs, and `- ` bullets.

## POST /api/v1/export/xlsx

Single-sheet body:

```json
{
    "headers": ["Name", "Score"],
    "rows": [["Alice", 92], ["Bob", 87]],
    "filename": "scores"
}
```

Multi-sheet body:

```json
{
    "sheets": [
        { "name": "Q1", "headers": ["Month", "Revenue"], "rows": [["Jan", 1200], ["Feb", 1500]] },
        { "name": "Q2", "headers": ["Month", "Revenue"], "rows": [["Apr", 1800]] }
    ],
    "filename": "revenue"
}
```

Returns the `.xlsx` file.

## Reasoning-leak stripper

`lib/sanitize/reasoning.ts` exposes `stripReasoning(text)` and `createStreamStripper()` for stateful token-by-token stripping. Wire `createStreamStripper()` into your chat-stream output to drop `<think>…</think>` blocks and chatty preambles before tokens reach the client.
