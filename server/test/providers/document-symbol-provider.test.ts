import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Context } from '../../src/context';
import DocumentProcessor from '../../src/document-processor';
import DocumentSymbolProvider from '../../src/providers/document-symbol-provider';
import { createTestContext, range } from '../helpers';

describe('DocumentSymbolProvider', () => {
	let provider: DocumentSymbolProvider;
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(() => {
		ctx = createTestContext();
		processor = new DocumentProcessor(ctx);
		provider = new DocumentSymbolProvider(ctx);
	});

	describe('#register()', () => {
		it('regsiters', () => {
			const conn = {
				onDocumentSymbol: jest.fn()
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onDocumentSymbol).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('documentSymbolProvider');
		});
	});

	describe('#onDocumentSymbol()', () => {
		it('lists variables', async () =>
			await given('!let foo = 1').has(variable.at(range(0, 5, 0, 8)).named('foo')));

		it('lists labels', async () =>
			await given('foo:').has(field.at(range(0, 0, 0, 3)).named('foo')));
	});

	// Test Director
	const given = (...code: string[]) => {
		// Arrange: document from code
		const symbolsProvider = async () => {
			const uri = ctx.workspaceFolders[0].uri + '/example.rcasm';
			const textDocument = TextDocument.create(uri, 'rcasm', 0, code.join('\n'));
			await processor.process(textDocument);
			return await provider.onDocumentSymbol({ textDocument });
		};
		return {
			has: async <E>(...expected: readonly E[]) => expect(await symbolsProvider()).toEqual(expected)
		};
	};

	const symbol = {
		ofKind: (kind: lsp.SymbolKind) => ({
			at: (range: lsp.Range) => ({
				named: (name: string) =>
					({
						kind,
						name,
						range,
						selectionRange: range
					}) as lsp.DocumentSymbol
			})
		})
	};

	const field = symbol.ofKind(lsp.SymbolKind.Field);
	const variable = symbol.ofKind(lsp.SymbolKind.Variable);
});
