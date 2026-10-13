// Smoke test for the browser LSP bundle (out/server.browser.js), the build relay-computer-ide
// runs as a web worker. Loads the built file with a fake worker `self` and drives it the way the
// IDE's Monaco LSP client does. Run `npm run esbuild:prd` (or esbuild:dev) first.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundle = `${root}out/server.browser.js`;
const fixture = name => readFileSync(`${root}client/testFixture/${name}`, 'utf8');

// Messages posted by the server, and anything that escapes it
const sent = [];
const uncaught = [];
const onUncaught = e => uncaught.push(e);

// Minimal DedicatedWorkerGlobalScope for BrowserMessageReader/Writer
const worker = {
	onmessage: null,
	listeners: [],
	postMessage: m => sent.push(m),
	addEventListener(type, l) {
		if (type === 'message') {
			this.listeners.push(l);
		}
	},
	removeEventListener() {}
};
const deliver = data => {
	worker.onmessage?.({ data });
	worker.listeners.forEach(l => l({ data }));
};

const settle = () => delay(20);
let nextId = 0;
async function request(method, params) {
	const id = ++nextId;
	deliver({ jsonrpc: '2.0', id, method, params });
	for (let i = 0; i < 100; i++) {
		await settle();
		const response = sent.find(m => m.id === id);
		if (response) {
			assert.equal(
				response.error,
				undefined,
				`${method} failed: ${JSON.stringify(response.error)}`
			);
			return response.result;
		}
	}
	assert.fail(`no response to ${method}`);
}
const notify = (method, params) => deliver({ jsonrpc: '2.0', method, params });
const latestDiagnostics = uri =>
	sent.filter(m => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri).at(-1)
		?.params.diagnostics;

async function open(uri, text) {
	notify('textDocument/didOpen', { textDocument: { uri, languageId: 'rcasm', version: 1, text } });
	await settle();
}
async function change(uri, version, text) {
	notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text }] });
	await settle();
}

describe('browser LSP bundle', () => {
	before(async () => {
		assert.ok(existsSync(bundle), `${bundle} not found: run \`npm run esbuild:prd\` first`);
		process.on('uncaughtException', onUncaught);
		globalThis.self = worker;
		await import(pathToFileURL(bundle).href);
	});

	after(() => {
		process.off('uncaughtException', onUncaught);
		assert.deepEqual(uncaught, []);
		// The IDE posts a non-JSON-RPC boot message first, which the connection logs and ignores
		const unexpectedLogs = sent
			.filter(m => m.method === 'window/logMessage' && m.params.type === 1)
			.map(m => m.params.message)
			.filter(m => !m.includes('browser/boot'));
		assert.deepEqual(unexpectedLogs, []);
	});

	it('initializes as relay-computer-ide does', async () => {
		deliver({ type: 'browser/boot', mode: 'foreground' });
		const { capabilities } = await request('initialize', {
			processId: null,
			rootUri: null,
			workspaceFolders: null,
			capabilities: {}
		});
		notify('initialized', {});

		assert.deepEqual(Object.keys(capabilities).sort(), [
			'completionProvider',
			'definitionProvider',
			'documentHighlightProvider',
			'documentSymbolProvider',
			'foldingRangeProvider',
			'hoverProvider',
			'referencesProvider',
			'renameProvider',
			'textDocumentSync'
		]);
		assert.deepEqual(capabilities.completionProvider.triggerCharacters, ['!', '+']);
	});

	describe('with the macro example open', () => {
		const uri = 'inmemory://model/macros';
		const at = (line, character) => ({ textDocument: { uri }, position: { line, character } });

		before(() => open(uri, fixture('macros.rcasm')));

		it('publishes no diagnostics for valid source', () =>
			assert.deepEqual(latestDiagnostics(uri), []));

		it('hovers a macro call with its signature', async () => {
			const hover = await request('textDocument/hover', at(10, 12));
			assert.match(hover.contents.value, /!macro skip_if_zero\(val, n\)/);
		});

		it('resolves a labelled call scope into the macro body', async () => {
			const [def] = await request('textDocument/definition', at(13, 22));
			assert.deepEqual(def.range, {
				start: { line: 4, character: 0 },
				end: { line: 4, character: 5 }
			});
		});

		it('folds macro definitions', async () => {
			const folds = await request('textDocument/foldingRange', { textDocument: { uri } });
			assert.deepEqual(
				folds.map(f => [f.startLine, f.endLine]),
				[
					[0, 5],
					[6, 9],
					[15, 17]
				]
			);
		});

		it('lists macros as function symbols', async () => {
			const symbols = await request('textDocument/documentSymbol', { textDocument: { uri } });
			const macros = symbols.filter(s => s.kind === 12).map(s => s.name);
			assert.deepEqual(macros, ['skip_if_zero', 'twice', 'copy']);
		});

		it('completes macros on a call that is still being typed', async () => {
			await change(uri, 2, fixture('macros.rcasm') + '        +\n');
			const completions = await request('textDocument/completion', {
				...at(19, 9),
				context: { triggerKind: 2, triggerCharacter: '+' }
			});
			const items = completions.items ?? completions;
			assert.deepEqual(
				items.map(i => i.label),
				['skip_if_zero', 'twice', 'copy']
			);
			assert.equal(items[0].insertText, '+skip_if_zero(${1:val}, ${2:n})');
		});
	});

	it('underlines the call site of an error inside a macro expansion', async () => {
		const uri = 'inmemory://model/macro-diagnostics';
		await open(uri, fixture('macro-diagnostics.rcasm'));
		const call = latestDiagnostics(uri).find(d => d.range.start.line === 3);
		assert.equal(call.message, "In macro 'm': Unknown mnemonic 'bogus'");
		assert.deepEqual(call.relatedInformation[0].location.range, {
			start: { line: 1, character: 8 },
			end: { line: 1, character: 13 }
		});
	});
});
