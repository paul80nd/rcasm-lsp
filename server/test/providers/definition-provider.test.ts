import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Context } from '../../src/context';
import DocumentProcessor from '../../src/document-processor';
import DefinitionProvider from '../../src/providers/definition-provider';
import { createTestContext, range } from '../helpers';

describe('DefinitionProvider', () => {
	let provider: DefinitionProvider;
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(() => {
		ctx = createTestContext();
		processor = new DocumentProcessor(ctx);
		provider = new DefinitionProvider(ctx);
	});

	describe('#register()', () => {
		it('regsiters', () => {
			const conn = {
				onDefinition: jest.fn()
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onDefinition).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('definitionProvider');
		});
	});

	describe('#onDefinition()', () => {
		it('returns a definition for a label', async () =>
			await given(`test: add\njmp test`)
				.symbolAt(1, 6)
				.hasDefinitionAt(range(0, 0, 0, 4)));

		it('finds definition if label follows after', async () =>
			await given(`jmp test\ntest: add`)
				.symbolAt(0, 6)
				.hasDefinitionAt(range(1, 0, 1, 4)));

		it('finds definition for label inside scope', async () => {
			const g = given(`jmp scp::test\nscp: {\ntest: add\n}`);
			await g.symbolAt(0, 6).hasDefinitionAt(range(2, 0, 2, 4));
			await g.symbolAt(0, 10).hasDefinitionAt(range(2, 0, 2, 4));
		});

		it('returns a definition for a label outside scope', async () =>
			await given(`test: add\nscope: {\njmp ::test\n}`)
				.symbolAt(2, 7)
				.hasDefinitionAt(range(0, 0, 0, 4)));

		it('returns definitions for refs split on §', async () => {
			const g = given('fra: inc\nldi m,fra§parr\nparr: add');
			await g.symbolAt(1, 8).hasDefinitionAt(range(0, 0, 0, 3));
			await g.symbolAt(1, 12).hasDefinitionAt(range(2, 0, 2, 4));
		});
	});

	// Test Director
	const given = (code: string) => {
		// Arrange: document from code
		const docProvider = async () => {
			const uri = ctx.workspaceFolders[0].uri + '/example.rcasm';
			const textDocument = TextDocument.create(uri, 'rcasm', 0, code);
			await processor.process(textDocument);
			return textDocument;
		};
		return {
			// Filter: symbol at position
			symbolAt: (r: number, c: number) => {
				// Action: provide definitions
				const defsProvider = async () => {
					const doc = await docProvider();
					return {
						defs: await provider.onDefinition({
							position: lsp.Position.create(r, c),
							textDocument: doc
						}),
						doc
					};
				};
				return {
					// Assert: definition for symbol
					hasDefinitionAt: async (range: lsp.Range) => {
						const actual = await defsProvider();
						expect(actual.defs).toEqual([{ range, uri: actual.doc.uri }]);
					}
				};
			}
		};
	};
});
