# Contributing to SarmaLink-AI

Thanks for wanting to contribute. Here's how.

## First-time contributors — start here

👉 **[`docs/OPEN-ISSUES.md`](docs/OPEN-ISSUES.md)** lists every open, well-scoped task with acceptance criteria. That's the fastest path from clone to merged PR. Items labelled `good first issue` are sized for a day of focused work.

## Development setup

```bash
git clone https://github.com/sarmakska/sarmalink-ai.git
cd sarmalink-ai
npm install
cp .env.example .env.local
# Add your API keys to .env.local
npm run dev
```

## Running checks

Before opening a PR, run:

```bash
npm test                # unit tests
npx tsc --noEmit        # typecheck
npx next lint           # lint
npm run build           # production build
```

CI runs all of these on every push and pull request. Your PR will be blocked if any fail.

## Code style

- **TypeScript** — no `any` in new code. If you need to cast, explain why in a comment.
- **Imports** — use the `@/` alias for internal imports, not relative paths like `../../`.
- **Formatting** — 4-space indents, single quotes, no semicolons at end of lines (or match the existing file).
- **Comments** — explain the *why*, not the *what*. Don't narrate the code.

## Adding a new AI provider

1. Add the provider ID to the `ProviderType` union in `lib/ai-models.ts`.
2. Add endpoint + key pool in `lib/providers/registry.ts`:
   ```ts
   case 'your-provider': return 'https://api.yourprovider.com/v1/chat/completions'
   ```
3. Add keys to `.env.example` with clear documentation.
4. Add the provider's models to one or more failover definitions.
5. Write a test in `__tests__/failover.test.ts` verifying the provider is tried in the right order.

## Adding a new live tool

1. Add the tool function to `lib/ai-tools.ts`.
2. Add intent detection in the route at `app/api/ai-chat/route.ts` (inside the `toolData` block).
3. Ensure the tool returns structured text that the AI can format naturally.
4. Add the relevant keywords to the `autoRouteIntent` function in `lib/ai-models.ts` so Live mode is triggered.
5. Document the tool in the README under "Built-in Live Tools".

## Commit messages

Follow conventional commits format:

```
feat: add support for Mistral AI provider
fix: correct failover ordering when all Gemini keys are rate-limited
docs: document new container tracking tool
refactor: extract provider registry from route handler
test: add unit tests for auto-router
chore: bump dependencies
```

## Pull requests

- Keep PRs small and focused on one concern.
- Include tests for new behaviour.
- Update relevant documentation.
- Link related issues.
- Be patient — reviews are best-effort.

## Reporting bugs

Open an issue with:

- Clear reproduction steps
- Expected vs actual behaviour
- Your environment (Node version, OS)
- Relevant logs (sanitise API keys first)

## Security

Do not open public issues for security vulnerabilities. Email `sarma@sarmalinux.com` instead. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
