import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Context } from '../../src/context';
import DocumentProcessor from '../../src/document-processor';
import FoldingRangeProvider from '../../src/providers/folding-range-provider';
import { createTestContext } from '../helpers';

describe('FoldingRnageProvider', () => {
	let provider: FoldingRangeProvider;
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(() => {
		ctx = createTestContext();
		processor = new DocumentProcessor(ctx);
		provider = new FoldingRangeProvider(ctx);
	});

	describe('#register()', () => {
		it('regsiters', () => {
			const conn = {
				onFoldingRanges: jest.fn()
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onFoldingRanges).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('foldingRangeProvider');
		});
	});

	describe('#onFoldingRanges()', () => {
		it('folds scope', async () => await foldsFor('foo: {', 'add', '}').are(region.over(0, 2)));

		it('folds for directive', async () =>
			await foldsFor('add', '!for i in range(2,5) {', '  add', '}').are(region.over(1, 3)));

		it('folds for with nested if directive', async () =>
			await foldsFor(
				'add',
				'!for i in range(2,5) {',
				'  !if (i == 3) {',
				'    add',
				'  }',
				'  add',
				'}'
			).are(region.over(1, 6), region.over(2, 4)));
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
			folds: () => {
				// Action: provide folds
				const foldingRangeProvider = async () => {
					const doc = await docProvider();
					return await provider.onFoldingRanges({ textDocument: doc });
				};
				return {
					// Assert: completions
					are: async (...expected: lsp.FoldingRange[]) =>
						expect(await foldingRangeProvider()).toEqual(expected)
				};
			}
		};
	};

	const foldsFor = (...code: string[]) => given(...code).folds();

	const region = {
		over: (startLine: number, endLine: number): lsp.FoldingRange => ({
			startLine,
			endLine,
			kind: 'region'
		})
	};
});
