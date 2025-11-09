import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Context } from '../../src/context';
import DocumentProcessor from '../../src/document-processor';
import RenameProvider from '../../src/providers/rename-provider';
import { createTestContext, range } from '../helpers';

describe('RenameProvider', () => {
	let provider: RenameProvider;
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(() => {
		ctx = createTestContext();
		processor = new DocumentProcessor(ctx);
		provider = new RenameProvider(ctx);
	});

	describe('#register()', () => {
		it('regsiters', () => {
			const conn = {
				onPrepareRename: jest.fn(),
				onRenameRequest: jest.fn()
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onPrepareRename).toHaveBeenCalled();
			expect(conn.onRenameRequest).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('renameProvider');
		});
	});

	describe('#onPrepareRename()', () => {
		it('renames a definition', async () =>
			await given('!let foo = 123')
				.prepareRenameAt(0, 6)
				.ifFor(range(0, 5, 0, 8)));

		it('renames a reference', async () =>
			await given('ldi m,foo')
				.prepareRenameAt(0, 7)
				.ifFor(range(0, 6, 0, 9)));
	});

	describe('#onRenameRequest()', () => {
		it('renames symbols for a definition', async () =>
			await given('!let foo = 123', 'ldi m,foo', 'ldi j,foo')
				.renameAt(0, 6)
				.to('example')
				.marksChangesAt(range(0, 5, 0, 8), range(1, 6, 1, 9), range(2, 6, 2, 9)));

		it('renames symbols for a reference', async () =>
			await given('!let foo = 123', 'ldi m,foo', 'ldi j,foo')
				.renameAt(1, 8)
				.to('example')
				.marksChangesAt(range(0, 5, 0, 8), range(1, 6, 1, 9), range(2, 6, 2, 9)));
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
			prepareRenameAt: (r: number, c: number) => {
				// Action: rename
				const renameProvider = async () => {
					const doc = await docProvider();
					return await provider.onPrepareRename({
						position: lsp.Position.create(r, c),
						textDocument: doc
					});
				};
				return {
					// Assert: changes
					ifFor: async (expected: lsp.Range) => {
						expect(await renameProvider()).toEqual(expected);
					}
				};
			},
			renameAt: (r: number, c: number) => ({
				to: (newText: string) => {
					// Action: rename
					const renameProvider = async () => {
						const doc = await docProvider();
						return {
							renames: await provider.onRenameRequest({
								position: lsp.Position.create(r, c),
								textDocument: doc,
								newName: newText
							}),
							doc
						};
					};
					return {
						// Assert: changes
						marksChangesAt: async (...expected: readonly lsp.Range[]) => {
							const actual = await renameProvider();
							const changes = actual.renames.changes
								? actual.renames.changes[actual.doc.uri]
								: undefined;
							expect(changes).toEqual(
								expected.map(
									e =>
										({
											newText,
											range: e
										}) as lsp.TextEdit
								)
							);
						}
					};
				}
			})
		};
	};
});
