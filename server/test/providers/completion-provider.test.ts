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

	beforeAll(() => {
		ctx = createTestContext();
		processor = new DocumentProcessor(ctx);
		provider = new CompletionProvider(ctx);
	});

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
				await completionsFor('|').includes([{ label: 'ldi' }, { label: 'add' }]);
				await completionsFor(' |').includes([{ label: 'ldi' }, { label: 'add' }]);
				await completionsFor('ld|').includes([{ label: 'ldi' }]);
				await completionsFor(' l|').includes([{ label: 'ldi' }]);
				await completionsFor('label: |').includes([{ label: 'ldi' }, { label: 'add' }]);
				await completionsFor('label: l|').includes([{ label: 'ldi' }]);
				await completionsFor(' ld| a,5').includes([{ label: 'ldi' }]);
				await completionsFor('label: l| ; comment').includes([{ label: 'ldi' }]);
			});

			test('completes directives', async function () {
				await completionsFor('|').includes([{ label: '!align' }, { label: 'add' }]);
				await completionsFor('!|').includes([{ label: '!align' }]);
				await completionsFor(' |').includes([{ label: '!word' }, { label: 'add' }]);
				await completionsFor(' !|').includes([
					{ label: '!align' },
					{ label: '!byte' },
					{ label: '!fill' },
					{ label: '!for' },
					{ label: '!word' }
				]);
				await completionsFor('label: |').includes([{ label: '!fill' }, { label: 'add' }]);
				await completionsFor('label: !|').includes([{ label: '!fill' }]);
				await completionsFor('label: !f| ; comment').includes([
					{ label: '!fill' },
					{ label: '!for' }
				]);
			});

			test('completion includes label description', async () => {
				await completionsFor('bc|').includes([
					{
						label: 'bcs',
						labelDetails: {
							description: 'Branch Conditionally: Carry Set'
						}
					}
				]);
				await completionsFor('!a|').includes([
					{
						label: '!align',
						labelDetails: { description: 'Define Align' }
					}
				]);
			});

			test('completion includes kind', async () => {
				await completionsFor('bc|').includes([
					{ label: 'bcs', kind: lsp.CompletionItemKind.Method }
				]);
				await completionsFor('!a|').includes([
					{ label: '!align', kind: lsp.CompletionItemKind.Keyword }
				]);
			});

			test('completion includes snippets', async function () {
				await completionsFor('l|').includes([{ insertText: 'ldi ${1:a},${2:0}' }]);
				await completionsFor('label: ld|').includes([{ insertText: 'ldr ${1:b}' }]);
				await completionsFor('label: b| ; comment').includes([{ insertText: 'beq ${1:label}' }]);
				await completionsFor('!|').includes([{ insertText: '!align ${1:8}' }]);
				await completionsFor('label: |').includes([{ insertText: '!fill ${1:8},${2:0x00}' }]);
				await completionsFor('label: !f| ; comment').includes([
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
				await completionsFor('|').includes([
					{ label: '!align', sortText: 'align' },
					{ label: '!byte', sortText: 'byte' }
				]));

			it('completions match case', async () => {
				await completionsFor('MO|').includes([{ label: 'MOV' }]);
				await completionsFor('!A|').includes([{ label: '!ALIGN' }]);
			});
		});

		describe('operands', () => {
			it('completes <dst:Dr> register operands', async () =>
				await completionsFor('clr |').are([
					{ label: 'a' },
					{ label: 'b' },
					{ label: 'c' },
					{ label: 'd' },
					{ label: 'm1' },
					{ label: 'm2' },
					{ label: 'x' },
					{ label: 'y' }
				]));

			it('completes <src:Dr> register operands', async () =>
				await completionsFor('  mov a,|').are([
					{ label: 'a' },
					{ label: 'b' },
					{ label: 'c' },
					{ label: 'd' },
					{ label: 'm1' },
					{ label: 'm2' },
					{ label: 'x' },
					{ label: 'y' }
				]));

			it('completes <dst:a-d> register operands', async () =>
				await completionsFor('  ldr |').are([
					{ label: 'a' },
					{ label: 'b' },
					{ label: 'c' },
					{ label: 'd' }
				]));

			it('completes <src:a-d> register operands', async () =>
				await completionsFor('str |').are([
					{ label: 'a' },
					{ label: 'b' },
					{ label: 'c' },
					{ label: 'd' }
				]));

			it('completes <dst:a|b> register operands', async () =>
				await completionsFor('ldi |').are([{ label: 'a' }, { label: 'b' }]));

			it('completes <dst:a|d> register operands', async () =>
				await completionsFor('lds |').are([{ label: 'a' }, { label: 'd' }]));

			test('register completion includes label description', async () => {
				await completionsFor('lds |').includes([
					{ label: 'a', labelDetails: { description: 'A Register' } }
				]);
				await completionsFor(' mov a,|').includes([
					{ label: 'x', labelDetails: { description: 'X Register' } }
				]);
			});

			test('register completion includes kind', async () => {
				await completionsFor('ldr |').includes([
					{ label: 'b', kind: lsp.CompletionItemKind.Keyword }
				]);
				await completionsFor('clr |').includes([
					{ label: 'c', kind: lsp.CompletionItemKind.Keyword }
				]);
			});

			it('has no completions (currently) for <label>', async () =>
				await completionsFor('blt |').are([]));

			it('has no completions for <message>', async () => await completionsFor('!error |').are([]));

			it('completes an operand with first letter of registers', async () => {
				await completionsFor('clr m|').includes([{ label: 'm1' }, { label: 'm2' }]);
			});

			it('matches case on registers', async () => {
				await completionsFor('clr M|').includes([{ label: 'M1' }, { label: 'M2' }]);
				await completionsFor('lds D|').includes([{ label: 'D' }]);
			});

			it('completes an optional register when approached', async () => {
				await completionsFor('add |').includes([{ label: 'a' }, { label: 'd' }]);
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
		it('adds instruction documentation', () => {
			const item = provider.onCompletionResolve({ label: 'mov', data: true });
			expect(item.documentation).toEqual({
				kind: 'markdown',
				value: expect.stringMatching(/Register to Register Copy/)
			});
		});

		it('adds directive documentation', () => {
			const item = provider.onCompletionResolve({ label: '!byte', data: true });
			expect(item.documentation).toEqual({
				kind: 'markdown',
				value: expect.stringMatching(/Define Byte Data/)
			});
		});

		it('adds register documentation', () => {
			const item = provider.onCompletionResolve({ label: 'xy', data: true });
			expect(item.documentation).toEqual({
				kind: 'markdown',
				value: expect.stringMatching(/XY Register/)
			});
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
			// Filter: completions at position
			completionsAt: (r: number, c: number) => {
				// Action: provide completions
				const completionsProvider = async () => {
					const doc = await docProvider();
					return provider.onCompletion({ position: lsp.Position.create(r, c), textDocument: doc });
				};
				return {
					// Assert: completions
					are: async <E>(expected: readonly E[]) =>
						expect(await completionsProvider()).toIncludeSamePartialMembers(expected),
					includes: async <E>(expected: readonly E[]) =>
						expect(await completionsProvider()).toIncludeAllPartialMembers(expected),
					doesNotInclude: async <E>(expected: readonly E[]) =>
						expect(await completionsProvider()).not.toIncludeAllPartialMembers(expected)
				};
			}
		};
	};

	const completionsFor = (value: string) => {
		const offset = value.indexOf('|');
		assert.ok(offset !== -1, `| missing in '${value}'`);
		value = value.substring(0, offset) + value.substring(offset + 1);
		return given(value).completionsAt(0, offset);
	};

	// Create and process text doc
	const createDoc = async (filename: string, text: string) => {
		const uri = ctx.workspaceFolders[0].uri + '/' + filename;
		const textDocument = TextDocument.create(uri, 'vasmmot', 0, text);
		await processor.process(textDocument);
		return textDocument;
	};
});
