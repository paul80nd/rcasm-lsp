import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Context } from '../../src/context';
import DocumentProcessor from '../../src/document-processor';
import ReferencesProvider from '../../src/providers/references-provider';
import { createTestContext, range } from '../helpers';

describe('ReferencesProvider', () => {
	let provider: ReferencesProvider;
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(() => {
		ctx = createTestContext();
		processor = new DocumentProcessor(ctx);
		provider = new ReferencesProvider(ctx);
	});

	describe('#register()', () => {
		it('regsiters', () => {
			const conn = {
				onReferences: jest.fn()
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onReferences).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('referencesProvider');
		});
	});

	describe('#onReferences()', () => {
		it('returns references for a definition', async () =>
			await given('!let foo = 123', 'ldi a, foo', 'ldi m, foo')
				.refsAt(0, 6)
				.are(range(1, 7, 1, 10), range(2, 7, 2, 10), range(0, 5, 0, 8)));
	});

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
			refsAt: (r: number, c: number) => {
				// Action: provide references
				const refsProvider = async () => {
					const doc = await docProvider();
					return {
						refs: await provider.onReferences({
							position: lsp.Position.create(r, c),
							textDocument: doc,
							context: { includeDeclaration: true }
						}),
						doc
					};
				};
				return {
					// Assert: refs
					are: async (...expected: readonly lsp.Range[]) => {
						const actual = await refsProvider();
						expect(actual.refs).toEqual(
							expected.map(
								e =>
									({
										uri: actual.doc.uri,
										range: e
									}) as lsp.Location
							)
						);
					}
				};
			}
		};
	};
});
