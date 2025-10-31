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

		private constructor(
			private value: string,
			private offset: number
		) {}

		private async doCompletion(): Promise<lsp.CompletionItem[]> {
			const textDocument = await createDoc('example.s', this.value);
			return await provider.onCompletion({
				position: lsp.Position.create(0, this.offset),
				textDocument
			});
		}

		public async includes<E>(expected: readonly E[]) {
			expect(await this.doCompletion()).toIncludeAllPartialMembers(expected);
		}

		public async is<E>(expected: readonly E[]) {
			expect(await this.doCompletion()).toIncludeSamePartialMembers(expected);
		}

		public async doesNotInclude<E>(expected: readonly E[]) {
			expect(await this.doCompletion()).not.toIncludeAllPartialMembers(expected);
		}

		public async hasNothing() {
			expect(await this.doCompletion()).toHaveLength(0);
		}
	}

	describe('#register()', () => {
		it('regsiters', () => {
			const conn = {
				onCompletion: jest.fn(),
				onCompletionResolve: jest.fn()
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onCompletion).toHaveBeenCalled();
			expect(conn.onCompletionResolve).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('completionProvider');
		});
	});

	describe('#onCompletion()', () => {
		describe('mnemonics and directives', () => {
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
				await completionFor('!|').includes([{ label: '!align' }]);
				await completionFor(' |').includes([{ label: '!word' }, { label: 'add' }]);
				await completionFor(' !|').includes([
					{ label: '!align' },
					{ label: '!byte' },
					{ label: '!fill' },
					{ label: '!for' },
					{ label: '!word' }
				]);
				await completionFor('label: |').includes([{ label: '!fill' }, { label: 'add' }]);
				await completionFor('label: !|').includes([{ label: '!fill' }]);
				await completionFor('label: !f| ; comment').includes([
					{ label: '!fill' },
					{ label: '!for' }
				]);
			});

			test('completion includes label description', async () => {
				await completionFor('bc|').includes([
					{
						label: 'bcs',
						labelDetails: {
							description: 'Branch Conditionally: Carry Set'
						}
					}
				]);
				await completionFor('!a|').includes([
					{
						label: '!align',
						labelDetails: { description: 'Define Align' }
					}
				]);
			});

			test('completion includes kind', async () => {
				await completionFor('bc|').includes([
					{ label: 'bcs', kind: lsp.CompletionItemKind.Method }
				]);
				await completionFor('!a|').includes([
					{ label: '!align', kind: lsp.CompletionItemKind.Keyword }
				]);
			});

			test('completion includes snippets', async function () {
				await completionFor('l|').includes([{ insertText: 'ldi ${1:a},${2:0}' }]);
				await completionFor('label: ld|').includes([{ insertText: 'ldr ${1:b}' }]);
				await completionFor('label: b| ; comment').includes([{ insertText: 'beq ${1:label}' }]);
				await completionFor('!|').includes([{ insertText: '!align ${1:8}' }]);
				await completionFor('label: |').includes([{ insertText: '!fill ${1:8},${2:0x00}' }]);
				await completionFor('label: !f| ; comment').includes([
					{
						insertText: '!for ${1:i} in range(${2:5}) {\n        ${3:add}\n}'
					}
				]);
			});

			it('selecting a directive replaces the existing "!" (no duplication)', async () => {
				const textDocument = await createDoc('example.s', '!|');
				const completions = await provider.onCompletion({
					position: lsp.Position.create(0, 1),
					textDocument
				});
				const item = completions.find(c => c.label === '!align');
				expect(item).toBeTruthy();
				// Ensure the completion provides a TextEdit that replaces the existing '!'
				const te = item!.textEdit as lsp.TextEdit | undefined;
				expect(te).toBeDefined();
				expect(te!.newText).toBe(item!.insertText as string);
				expect(te!.range.start.character).toBe(0);
				expect(te!.range.end.character).toBe(1);
			});

			test('directive completions have sort order', async () =>
				await completionFor('|').includes([
					{ label: '!align', sortText: 'align' },
					{ label: '!byte', sortText: 'byte' }
				]));

			it('excludes unsupported mnemonics', async () =>
				await completionFor('  di|').doesNotInclude([{ label: 'div' }]));

			it('includes supported mnemonics', async () => {
				const textDocument = await createDoc('example.s', '  di');
				const ctx020: Context = {
					...ctx,
					config: {
						...ctx.config,
						processors: ['rcasm', 'rcasm+div']
					}
				};
				const provider020 = new CompletionProvider(ctx020);

				const completions = await provider020.onCompletion({
					position: lsp.Position.create(0, 4),
					textDocument
				});

				expect(completions).toContainEqual(expect.objectContaining({ label: 'div' }));
			});

			it('completions match case', async () => {
				await completionFor('MO|').includes([{ label: 'MOV' }]);
				await completionFor('!A|').includes([{ label: '!ALIGN' }]);
			});
		});

		describe('operands', () => {
			it('completes <dst:Dr> register operands', async () =>
				await completionFor('clr |').is([
					{ label: 'a', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'b', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'c', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'd', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'm1', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'm2', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'x', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'y', detail: '(register)', kind: lsp.CompletionItemKind.Keyword }
				]));

			it('completes <src:Dr> register operands', async () =>
				await completionFor('  mov a,|').is([
					{ label: 'a', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'b', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'c', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'd', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'm1', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'm2', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'x', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'y', detail: '(register)', kind: lsp.CompletionItemKind.Keyword }
				]));

			it('completes <dst:a-d> register operands', async () =>
				await completionFor('  ldr |').is([
					{ label: 'a', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'b', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'c', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'd', detail: '(register)', kind: lsp.CompletionItemKind.Keyword }
				]));

			it('completes <src:a-d> register operands', async () =>
				await completionFor('str |').is([
					{ label: 'a', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'b', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'c', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'd', detail: '(register)', kind: lsp.CompletionItemKind.Keyword }
				]));

			it('completes <dst:a|b> register operands', async () =>
				await completionFor('ldi |').is([
					{ label: 'a', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'b', detail: '(register)', kind: lsp.CompletionItemKind.Keyword }
				]));

			it('completes <dst:a|d> register operands', async () =>
				await completionFor('lds |').is([
					{ label: 'a', detail: '(register)', kind: lsp.CompletionItemKind.Keyword },
					{ label: 'd', detail: '(register)', kind: lsp.CompletionItemKind.Keyword }
				]));

			it('has no completions (currently) for <label>', async () =>
				await completionFor('blt |').is([]));

			it('has no completions for <message>', async () => await completionFor('!error |').is([]));

			it('completes an operand with first letter of registers', async () => {
				await completionFor('clr m|').includes([{ label: 'm1' }, { label: 'm2' }]);
			});

			it('matches case on registers', async () => {
				await completionFor('clr M|').includes([{ label: 'M1' }, { label: 'M2' }]);
				await completionFor('lds D|').includes([{ label: 'D' }]);
			});

			it('completes an optional register when approached', async () => {
				await completionFor('add |').includes([{ label: 'a' }, { label: 'd' }]);
			});

			// 	parsingSignature('!align <value:2|4|8|16|...>').hasOperands([
			// 		{ start: 7, end: 27, value: '<value:2|4|8|16|...>' }
			// 	]);
			// 	parsingSignature('mov <dst:xy|pc>,<src:m|xy|j|as>').hasOperands([
			// 		{ start: 4, end: 15, value: '<dst:xy|pc>' },
			// 		{ start: 16, end: 31, value: '<src:m|xy|j|as>' }
			// 	]);
			// 	parsingSignature('ldi <dst:a|b>,<value:-16..15>').hasOperands([
			// 		{ start: 4, end: 13, value: '<dst:a|b>' },
			// 		{ start: 14, end: 29, value: '<value:-16..15>' }
			// 	]);
			// 	parsingSignature('ldi <dst:m|j>,<value:0x0000..0xFFFF>').hasOperands([
			// 		{ start: 4, end: 13, value: '<dst:m|j>' },
			// 		{ start: 14, end: 36, value: '<value:0x0000..0xFFFF>' }
			// 	]);
			// 	parsingSignature('!fill <count:0..255>,<value:0x00..0xFF>').hasOperands([
			// 		{ start: 6, end: 20, value: '<count:0..255>' },
			// 		{ start: 21, end: 39, value: '<value:0x00..0xFF>' }
			// 	]);
			// 	parsingSignature('!byte <value:0x00..0xFF>[,...]').hasOperands([
			// 		{ start: 6, end: 24, value: '<value:0x00..0xFF>' },
			// 		{ start: 26, end: 29, value: '...' }
			// 	]);
			// 	parsingSignature('!word <value:0x0000..0xFFFF>[,...]').hasOperands([
			// 		{ start: 6, end: 28, value: '<value:0x0000..0xFFFF>' },
			// 		{ start: 30, end: 33, value: '...' }
			// 	]);
		});

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
	});

	describe('#onCompletionResolve()', () => {
		it('adds documentation', () => {
			const item = provider.onCompletionResolve({
				label: 'mov',
				data: true
			});
			expect(item.documentation).toBeTruthy();
			expect(lsp.MarkupContent.is(item.documentation)).toBe(true);
			lsp.MarkupContent.is(item.documentation);
			expect((item.documentation! as lsp.MarkupContent).value).toContain('mov');
		});
	});
});
