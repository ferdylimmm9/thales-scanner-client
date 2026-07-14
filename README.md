# @ferdylimmm9/thales-scanner-client

React hook for the **Thales QS2000 scanner bridge** — live MRZ / passport / ID
scan results over WebSocket, fully typed with [Zod](https://zod.dev). This is
the client half of [`thales-scanner-bridge`](https://github.com/ferdylimmm9/thales-scanner-bridge)
(the .NET service that talks to the actual scanner hardware) — install both.

```
[Thales QS2000] --USB--> [thales-scanner-bridge] --ws://localhost:8765--> [your React app]
                                                                            useDocumentScanner()
```

Implements **contract v1** of the bridge — see
[`thales-scanner-bridge`'s `CONTRACT.md`](https://github.com/ferdylimmm9/thales-scanner-bridge/blob/main/CONTRACT.md)
for the full language-neutral spec this package is built against. If you bump
past a contract version, check that doc first.

## Install

```bash
npm install @ferdylimmm9/thales-scanner-client zod
# or: pnpm add / yarn add
```

`react` (>=18) and `zod` (^3.23) are peer dependencies — this package doesn't
bundle its own copies.

## Usage

```tsx
import { useDocumentScanner } from '@ferdylimmm9/thales-scanner-client'

function ScanPanel() {
  const { connection, phase, lastScan, error, clearScan } = useDocumentScanner({
    url: process.env.NEXT_PUBLIC_THALES_BRIDGE_URL, // or your framework's env convention
  })

  if (connection !== 'connected') return <p>Scanner bridge: {connection}</p>
  if (lastScan) {
    // ...consume lastScan.mrz / .images / .chip, then:
    clearScan()
  }
  return <p>Reader: {phase}</p>
}
```

The hook needs no framework-specific setup — pass your bridge URL explicitly via
the `url` option (defaults to `ws://localhost:8765`, the bridge's default port).
It does **not** read `process.env` itself; how you get the URL into your component
is up to your bundler/framework (Next.js `NEXT_PUBLIC_*`, Vite `import.meta.env.VITE_*`, etc).

### API

```ts
useDocumentScanner(options?: {
  url?: string                 // default: 'ws://localhost:8765'
  enabled?: boolean             // default: true — set false to close the socket (e.g. dialog closed)
  onProtocolError?: (issue: { raw: unknown; zodError?: ZodError }) => void
}): {
  connection: 'connecting' | 'connected' | 'disconnected' | 'error'
  phase: 'idle' | 'waiting_for_document' | 'reading'
  lastScan: DocumentScanResult | null
  error: string | null
  clearScan: () => void
  reconnect: () => void
}
```

All contract types/schemas (`DocumentScanResult`, `MrzData`, `scannerMessageSchema`,
`SCAN_DOCUMENT_TYPE`, etc.) are also exported — see [`src/types.ts`](src/types.ts).

## Debugging on the client side

- **`onProtocolError`** — fires whenever a frame doesn't match the contract (malformed
  JSON, or a shape Zod rejects). `error` gives you a human string either way; this
  callback gives you the *structured* detail — the raw frame and, when it's a schema
  mismatch, the full `ZodError` (which field, what was expected). Wire it to your
  logging/error-reporting instead of guessing from the generic message:

  ```ts
  useDocumentScanner({
    onProtocolError: ({ raw, zodError }) => {
      console.error('scanner bridge contract mismatch', { raw, issues: zodError?.issues })
    },
  })
  ```

- **Chrome/Edge DevTools → Network → WS** shows every raw frame live, since it's plain
  `ws://localhost` traffic — this alone replaces most `console.log`-in-the-hook debugging.

See [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) for symptom → cause → fix.

## Versioning

Released via `semantic-release` on every push to `main`, driven by
[Conventional Commits](https://www.conventionalcommits.org/). `package.json`'s
`version` is owned by the release pipeline — don't hand-edit it.
