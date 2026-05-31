# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm test` — Jest under `server/test/`. Single file: `npx jest server/test/providers/hover-provider.test.ts`. Single name: add `-t "pattern"`.
- `npm run test-e2e` — Mocha-based end-to-end test that boots VS Code against `client/testFixture/`. Requires `npm run compile` first so `client/out/` exists.
- `npm run esbuild:dev` / `esbuild:prd` — Bundle the **browser** server (`server/src/server.browser.ts` → `server/out/server.browser.js`) for web-extension use. Uses `server/tsconfig.browser.json` and is independent of the `tsc -b` build that produces the Node server.

## Architecture

### Two server entrypoints

- `server/src/server.ts` — Node LSP over IPC, what the VS Code extension spawns.
- `server/src/server.browser.ts` — Web-worker LSP via `BrowserMessageReader/Writer`, bundled by esbuild.

They have **separate provider registries**: `providers/index.ts` (Node) and `providers/index.browser.ts` (browser, omits providers that touch Node-only APIs). When adding or removing a provider, update both or the browser build silently drifts.

### Provider pattern

Each LSP capability is a class implementing `Provider` (`server/src/providers/index.ts`):

```ts
register(connection, clientCapabilities): ServerCapabilities
```

`registerProviders` instantiates them with the shared `Context` and merges their returned capability fragments into the `InitializeResult`. To add a feature: write a provider, wire its connection handlers in `register()`, return its `ServerCapabilities` slice, append it to the `providers` array (in both index files — see above).

### Context and the document store

`Context` (`server/src/context.ts`) is passed to every provider and holds `store: Map<uri, ProcessedDocument>` plus `connection`, `logger`, `workspaceFolders`, `config`.

`DocumentProcessor.process()` (`document-processor.ts`) is the **single funnel** that parses and stores a document. The text-document-sync provider calls it on open/change; every other provider reads via `ctx.store.get(uri)` and assumes the entry is present. If you add a code path that needs a document, route it through the sync provider rather than parsing ad-hoc.

### Parser adapter

`server/src/parser/parser.ts` calls `rcasm.parseOnly()` from `@paul80nd/rcasm`, then `AstAdapter` translates the upstream AST into the internal `INode` tree (`nodes.ts`) and builds a `SymbolScope` tree (`scopes.ts`). Providers consume `INode` only — they do **not** import `rcasm.*` types. If a feature needs new AST information, extend the adapter rather than leaking upstream types upward. `symbols.ts` then walks tree + scopes to produce the `Symbols` index used by definition/reference/rename/document-symbol providers.
