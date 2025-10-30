import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Context } from '../../src/context';
import DocumentProcessor from '../../src/document-processor';
import CompletionProvider from '../../src/providers/completion-provider';
import { createTestContext } from '../helpers';
import assert from 'assert';

describe('CompletionProvider', () => {
	let provider: CompletionProvider;
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(async () => {
		ctx = await createTestContext();
		processor = new DocumentProcessor(ctx);
		provider = new CompletionProvider(ctx);
	});

	// Create and process text doc
	const createDoc = async (filename: string, text: string) => {
		const uri = ctx.workspaceFolders[0].uri + '/' + filename;
		const textDocument = TextDocument.create(uri, 'vasmmot', 0, text);
		await processor.process(textDocument);
		return textDocument;
	};

	const completionFor = (v: string) => CompletionTest.for(v);

	class CompletionTest {

		public static for(value: string): CompletionTest {
			const offset = value.indexOf('|');
			assert.ok(offset !== -1, `| missing in '${value}'`);
			value = value.substring(0, offset) + value.substring(offset + 1);
			return new CompletionTest(value, offset);
		}

		private constructor(private value: string, private offset: number) { }

		private async doCompletion(): Promise<lsp.CompletionItem[]> {
			const textDocument = await createDoc('example.s', this.value);
			return await provider.onCompletion({
				position: lsp.Position.create(0, this.offset),
				textDocument,
			});
		}

		public async includes<E,>(expected: readonly E[]) {
			expect(await this.doCompletion()).toIncludeAllPartialMembers(expected);
		};

		public async doesNotInclude<E,>(expected: readonly E[]) {
			expect(await this.doCompletion()).not.toIncludeAllPartialMembers(expected);
		};

		public async hasNothing() {
			expect(await this.doCompletion()).toHaveLength(0);
		};
	}

	describe('#register()', () => {
		it('regsiters', () => {
			const conn = {
				onCompletion: jest.fn(),
				onCompletionResolve: jest.fn(),
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onCompletion).toHaveBeenCalled();
			expect(conn.onCompletionResolve).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('completionProvider');
		});
	});

	describe('#onCompletion()', () => {

		test('completes mnemonics', async function () {
			await completionFor('|').includes([{ label: 'ldi' }, { label: 'add' }]);
			await completionFor(' |').includes([{ label: 'ldi' }, { label: 'add' }]);
			await completionFor('ld|').includes([{ label: 'ldi' }]);
			await completionFor(' l|').includes([{ label: 'ldi' }]);
			await completionFor('label: |').includes([{ label: 'ldi' }, { label: 'add' }]);
			await completionFor('label: l|').includes([{ label: 'ldi' }]);
			await completionFor(' ld| a,5').includes([{ label: 'ldi' }]);
			await completionFor('label: l| ; comment').includes([{ label: 'ldi' }]);
		});

		test('completes directives', async function () {
			await completionFor('|').includes([{ label: '!align' }, { label: 'add' }]);
			await completionFor(' |').includes([{ label: '!word' }, { label: 'add' }]);
			await completionFor(' !|').includes([{ label: '!align' }, { label: '!byte' }, { label: '!fill' }, { label: '!for' }, { label: '!word' }]);
			await completionFor('label: |').includes([{ label: '!fill' }, { label: 'add' }]);
			await completionFor('label: !|').includes([{ label: '!fill' }]);
			await completionFor('label: !f| ; comment').includes([{ label: '!fill' }, { label: '!for' }]);
		});

		test('completion includes label description', async () => {
			await completionFor('bc|').includes([{ label: 'bcs', labelDetails: { description: 'Branch Conditionally: Carry Set' } }]);
			await completionFor('!a|').includes([{ label: '!align', labelDetails: { description: 'Define Align' } }]);
		});

		test('completion includes kind', async () => {
			await completionFor('bc|').includes([{ label: 'bcs', kind: lsp.CompletionItemKind.Method }]);
			await completionFor('!a|').includes([{ label: '!align', kind: lsp.CompletionItemKind.Keyword }]);
		});

		test('directive completions have sort order', async () =>
			await completionFor('|').includes([
				{ label: '!align', sortText: 'align' },
				{ label: '!byte', sortText: 'byte' }
			]));

		it('excludes unsupported mnemonics', async () => await
			completionFor('  di|').doesNotInclude([{ label: 'div' }]));

		it('includes supported mnemonics', async () => {
			const textDocument = await createDoc('example.s', '  di');
			const ctx020: Context = {
				...ctx,
				config: {
					...ctx.config,
					processors: ['rcasm', 'rcasm+div'],
				},
			};
			const provider020 = new CompletionProvider(ctx020);

			const completions = await provider020.onCompletion({
				position: lsp.Position.create(0, 4),
				textDocument,
			});

			expect(completions).toContainEqual(
				expect.objectContaining({ label: 'div' })
			);
		});

		it('matches case on mnemonics', async () => await
			completionFor('MO|').includes([{ label: 'MOV' }]));

		it('completes an operand on first character', async () => await
			completionFor('  mov |').includes([{ label: 'd0' }]));

		it('completes an operand with registers', async () => await
			completionFor('move d|').includes([{ label: 'd0' }]));

		it('matches case on registers', async () => await
			completionFor('move D|').includes([{ label: 'D0' }]));

		// it('completes an operand with a symbol', async () => {
		// 	const textDocument = await createDoc(
		// 		'example.s',
		// 		`foo = 1
		//   move f
		//       `
		// 	);

		// 	const completions = await provider.onCompletion({
		// 		position: lsp.Position.create(1, 8),
		// 		textDocument,
		// 	});

		// 	expect(completions).toContainEqual(
		// 		expect.objectContaining({ label: 'foo' })
		// 	);
		// });

		// 		it('completes local symbols', async () => {
		// 			const textDocument = await createDoc(
		// 				'example.s',
		// 				`global1:
		// .local1:
		// global2:
		// .local2:
		//   bsr .l
		// global3:
		// .local3:
		//       `
		// 			);

		// 			const completions = await provider.onCompletion({
		// 				position: lsp.Position.create(4, 8),
		// 				textDocument,
		// 			});

		// 			expect(completions).toContainEqual(
		// 				expect.objectContaining({ label: '.local2' })
		// 			);
		// 			expect(completions).not.toContainEqual(
		// 				expect.objectContaining({ label: '.local1' })
		// 			);
		// 			expect(completions).not.toContainEqual(
		// 				expect.objectContaining({ label: '.local3' })
		// 			);
		// 		});

		// it('does not complete on first character of line', async () => await
		// 	completionFor('|').hasNothing());

		// 		it('includes comment documentation before declaration', async () => {
		// 			const textDocument = await createDoc(
		// 				'example.s',
		// 				`; test 123
		// ; example
		// foo = 123
		//  move fo`
		// 			);

		// 			const completions = await provider.onCompletion({
		// 				position: lsp.Position.create(2, 9),
		// 				textDocument,
		// 			});

		// 			expect(completions).toContainEqual(
		// 				expect.objectContaining({
		// 					documentation: { kind: 'markdown', value: 'test 123  \nexample' },
		// 				})
		// 			);
		// 		});

		// 		it('includes comment documentation on same line as declaration', async () => {
		// 			const textDocument = await createDoc(
		// 				'example.s',
		// 				`foo = 123 ; example
		//  move fo`
		// 			);

		// 			const completions = await provider.onCompletion({
		// 				position: lsp.Position.create(1, 8),
		// 				textDocument,
		// 			});

		// 			expect(completions).toContainEqual(
		// 				expect.objectContaining({
		// 					documentation: { kind: 'markdown', value: 'example' },
		// 				})
		// 			);
		// 		});

		// TODO: signature specific operand competions

		// PROVIDES SNIPPETS
		// test('completes mnemonics', async function () {
		// 	// await completionFor('|', {
		// 	// 	items: [
		// 	// 		{ label: 'ldi', resultText: 'ldi ${1:a},${2:0}' },
		// 	// 		{ label: 'add', resultText: 'add' }
		// 	// 	]
		// 	// });
		// 	// await completionFor(' |', {
		// 	// 	items: [
		// 	// 		{ label: 'ldi', resultText: ' ldi ${1:a},${2:0}' },
		// 	// 		{ label: 'add', resultText: ' add' }
		// 	// 	]
		// 	// });
		// 	await completionFor(' l|', {
		// 		items: [{ label: 'ldi', resultText: ' ldi ${1:a},${2:0}' }]
		// 	});

		// 	// await completionFor('label: |', {
		// 	// 	items: [
		// 	// 		{ label: 'ldi', resultText: 'label: ldi ${1:a},${2:0}' },
		// 	// 		{ label: 'add', resultText: 'label: add' }
		// 	// 	]
		// 	// });

		// 	await completionFor('label: l|', {
		// 		items: [{ label: 'ldi', resultText: 'label: ldi ${1:a},${2:0}' }]
		// 	});

		// 	await completionFor(' ld| a,5', {
		// 		items: [{ label: 'ldi', resultText: ' ldi ${1:a},${2:0} a,5' }]
		// 	});

		// 	await completionFor('label: l| ; comment', {
		// 		items: [{ label: 'ldi', resultText: 'label: ldi ${1:a},${2:0} ; comment' }]
		// 	});
		// });

		// PROVIDES SNIPPETS
		// test('completes directives', async function () {
		// 	// 	await completionFor('|', {
		// 	// 		items: [
		// 	// 			{ label: '!align', resultText: '!align ${1:8}' },
		// 	// 			{ label: 'add', resultText: 'add' }
		// 	// 		]
		// 	// 	});
		// 	// 	await completionFor(' |', {
		// 	// 		items: [
		// 	// 			{ label: '!word', resultText: ' !word ${1:0x0000}' },
		// 	// 			{ label: 'add', resultText: ' add' }
		// 	// 		]
		// 	// 	});

		// 	await completionFor(' !|').includes([{ label: '!align' }, { label: '!byte' }, { label: '!fill' }, { label: '!for' }, { label: '!word' }]);

		// 	// 	await completionFor('label: |', {
		// 	// 		items: [
		// 	// 			{ label: '!fill', resultText: 'label: !fill ${1:8},${2:0x00}' },
		// 	// 			{ label: 'add', resultText: 'label: add' }
		// 	// 		]
		// 	// 	});

		// 	await completionFor('label: l|', { items: [{ label: 'ldi', resultText: 'label: ldi ${1:a},${2:0}' }] });

		// 	await completionFor('label: !f| ; comment', {
		// 		items: [
		// 			{ label: '!fill', resultText: 'label: !fill ${1:8},${2:0x00} ; comment' },
		// 			{ label: '!for', resultText: 'label: !for ${1:i} in range(${2:5}) {\n        ${3:add}\n} ; comment' }
		// 		]
		// 	});

		// });

	});

	describe('#onCompletionResolve()', () => {
		it('adds documentation', () => {
			const item = provider.onCompletionResolve({
				label: 'mov',
				data: true,
			});
			expect(item.documentation).toBeTruthy();
			expect(lsp.MarkupContent.is(item.documentation)).toBe(true);
			lsp.MarkupContent.is(item.documentation);
			expect((item.documentation! as lsp.MarkupContent).value).toContain('mov');
		});
	});
});
