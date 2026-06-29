# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reference projects

Two upstream projects inform work here — use each for what it's good at:

- **[grahambates/m68k-lsp](https://github.com/grahambates/m68k-lsp)** — an assembly LSP with the same shape as this
  one (provider pattern, parser adapter, browser build) and the original inspiration for the architecture. It's the
  closest **domain** match, so it's the best reference for _how an assembly-LSP feature should look_. Caveat: it tracks
  older dependency versions — mine it for design, not for versions.
- **[microsoft/vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)** — the canonical
  Node LSP whose packages we depend on (`vscode-languageserver`, `vscode-languageclient`,
  `vscode-languageserver-textdocument`, …). Reference for _how new LSP protocol features are implemented_ and the
  _authoritative dependency and toolchain versions_ to pin to (TypeScript, ESLint, `@types/node`, `@types/vscode`, and
  the LSP packages themselves). Prefer its pinned versions over npm "latest".

## Commands

- `npm test` — Jest under `server/test/`. Single file: `npx jest server/test/providers/hover-provider.test.ts`. Single
  name: add `-t "pattern"`.
- `npm run test-e2e` — Mocha-based end-to-end test that boots VS Code against `client/testFixture/`. Requires
  `npm run compile` first so `client/out/` exists.
- `npm run esbuild:dev` / `esbuild:prd` — Bundle the **browser** server (`server/src/server.browser.ts` →
  `server/out/server.browser.js`) for web-extension use. Uses `server/tsconfig.browser.json` and is independent of the
  `tsc -b` build that produces the Node server.

## Verifying changes

- `npm test` runs through `ts-jest` and won't catch everything `tsc -b` would — always run `npm run compile` too when
  changing types or tsconfigs.
- `tsc -b` is incremental: stale `**/tsconfig.tsbuildinfo` masks errors. Delete the buildinfo files before treating a
  clean `compile` as proof.
- Each tsconfig pins `types: [...]` (server `["node"]`, client `["mocha", "node", "vscode"]`, browser `[]`) to keep the
  `@types/jest` ↔ `@types/mocha` globals (`describe`, `it`, `beforeEach`) from colliding. Adding a new `@types/*` devDep
  means adding it here too, or it won't be picked up.

## Architecture

### Two server entrypoints

- `server/src/server.ts` — Node LSP over IPC, what the VS Code extension spawns.
- `server/src/server.browser.ts` — Web-worker LSP via `BrowserMessageReader/Writer`, bundled by esbuild.

They have **separate provider registries**: `providers/index.ts` (Node) and `providers/index.browser.ts` (browser, omits
providers that touch Node-only APIs). When adding or removing a provider, update both or the browser build silently
drifts.

### Provider pattern

Each LSP capability is a class implementing `Provider` (`server/src/providers/index.ts`):

```ts
register(connection, clientCapabilities): ServerCapabilities
```

`registerProviders` instantiates them with the shared `Context` and merges their returned capability fragments into the
`InitializeResult`. To add a feature: write a provider, wire its connection handlers in `register()`, return its
`ServerCapabilities` slice, append it to the `providers` array (in both index files — see above).

### Context and the document store

`Context` (`server/src/context.ts`) is passed to every provider and holds `store: Map<uri, ProcessedDocument>` plus
`connection`, `logger`, `workspaceFolders`, `config`.

`DocumentProcessor.process()` (`document-processor.ts`) is the **single funnel** that parses and stores a document. The
text-document-sync provider calls it on open/change; every other provider reads via `ctx.store.get(uri)` and assumes the
entry is present. If you add a code path that needs a document, route it through the sync provider rather than parsing
ad-hoc.

### Parser adapter

`server/src/parser/parser.ts` calls `rcasm.parseOnly()` from `@paul80nd/rcasm`, then `AstAdapter` translates the
upstream AST into the internal `INode` tree (`nodes.ts`) and builds a `SymbolScope` tree (`scopes.ts`). Providers
consume `INode` only — they do **not** import `rcasm.*` types. If a feature needs new AST information, extend the
adapter rather than leaking upstream types upward. `symbols.ts` then walks tree + scopes to produce the `Symbols` index
used by definition/reference/rename/document-symbol providers.
