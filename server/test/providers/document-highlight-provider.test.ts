import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Context } from '../../src/context';
import DocumentProcessor from '../../src/document-processor';
import DocumentHighlightProvider from '../../src/providers/document-highlight-provider';
import { createTestContext, range } from '../helpers';

describe('DocumentHighlightProvider', () => {
	let provider: DocumentHighlightProvider;
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(() => {
		ctx = createTestContext();
		processor = new DocumentProcessor(ctx);
		provider = new DocumentHighlightProvider(ctx);
	});

	describe('#register()', () => {
		it('regsiters', () => {
			const conn = {
				onDocumentHighlight: jest.fn()
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onDocumentHighlight).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('documentHighlightProvider');
		});
	});

	describe('#onDocumentHighlight()', () => {
		it('highlights definition from usage', async () =>
			await given('!let foo = 123', 'ldi m,foo')
				.highlightsAt(1, 8)
				.are(
					highlight.at(range(1, 6, 1, 9)).forRead(),
					highlight.at(range(0, 5, 0, 8)).forWrite()
				));
	});

	it('highlights usage from definition', async () =>
		await given('!let foo = 123', 'ldi m,foo')
			.highlightsAt(0, 7)
			.are(highlight.at(range(1, 6, 1, 9)).forRead(), highlight.at(range(0, 5, 0, 8)).forWrite()));

	it('returns no highlights if not in word', async () =>
		await given('ldi m,foo').highlightsAt(0, 1).are());

	// Test Director
	const given = (...code: string[]) => {
		// Arrange: document from code
		const docProvider = async () => {
			const uri = ctx.workspaceFolders[0].uri + '/example.rcasm';
			const textDocument = TextDocument.create(uri, 'rcasm', 0, code.join('\n'));
			await processor.process(textDocument);
			return textDocument;
		};
		return {
			highlightsAt: (r: number, c: number) => {
				// Action: provide highlights
				const highlightsProvider = async () => {
					const doc = await docProvider();
					return await provider.onDocumentHighlight({
						position: lsp.Position.create(r, c),
						textDocument: doc
					});
				};
				return {
					// Assert: highlights
					are: async <E>(...expected: readonly E[]) =>
						expect(await highlightsProvider()).toEqual(expected)
				};
			}
		};
	};

	const highlight = {
		at: (range: lsp.Range) => {
			const h1 = {
				forRead: () => h1.ofKind(lsp.DocumentHighlightKind.Read),
				forWrite: () => h1.ofKind(lsp.DocumentHighlightKind.Write),
				ofKind: (kind: lsp.DocumentHighlightKind) => ({
					range,
					kind
				})
			};
			return h1;
		}
	};
});
