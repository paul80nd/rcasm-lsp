import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { Context } from "../../src/context";
import DocumentProcessor from "../../src/document-processor";
import CompletionProvider from "../../src/providers/completion-provider";
import { createTestContext } from "../helpers";
import assert from 'assert';

interface ItemDescription {
	label: string;
	detail?: string;
	documentation?: string | lsp.MarkupContent | null;
	/**
	 * Only test that the documentation includes the substring
	 */
	documentationIncludes?: string;
	kind?: lsp.CompletionItemKind;
	insertTextFormat?: lsp.InsertTextFormat;
	resultText?: string;
	notAvailable?: boolean;
	command?: lsp.Command;
	sortText?: string;
}

interface ExpectedCompletions {
	count?: number;
	items?: ItemDescription[];
}

describe("CompletionProvider", () => {
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
		const uri = ctx.workspaceFolders[0].uri + "/" + filename;
		const textDocument = TextDocument.create(uri, "vasmmot", 0, text);
		await processor.process(textDocument);
		return textDocument;
	};

	const assertCompletion = (completions: lsp.CompletionItem[], expected: ItemDescription, document: TextDocument) => {
		const matches = completions.filter(completion => {
			return completion.label === expected.label;
		});
		if (expected.notAvailable) {
			assert.equal(matches.length, 0, expected.label + " should not be present");
		} else {
			assert.equal(matches.length, 1, expected.label + " should only existing once: Actual: " + completions.map(c => c.label).join(', '));
		}

		const match = matches[0];
		if (expected.detail) {
			assert.equal(match.detail, expected.detail);
		}
		if (expected.documentation) {
			assert.deepEqual(match.documentation, expected.documentation);
		}
		if (expected.documentationIncludes) {
			assert.ok(match.documentation !== undefined);
			if (typeof match.documentation === 'string') {
				assert.ok(match.documentation.indexOf(expected.documentationIncludes) !== -1);
			} else {
				assert.ok(match.documentation!.value.indexOf(expected.documentationIncludes) !== -1);
			}
		}
		if (expected.kind) {
			assert.equal(match.kind, expected.kind);
		}
		if (expected.resultText && match.textEdit) {
			const edit = lsp.TextEdit.is(match.textEdit) ? match.textEdit : lsp.TextEdit.replace(match.textEdit.replace, match.textEdit.newText);
			assert.equal(TextDocument.applyEdits(document, [edit]), expected.resultText);
		}
		if (expected.insertTextFormat) {
			assert.equal(match.insertTextFormat, expected.insertTextFormat);
		}
		if (expected.command) {
			assert.deepEqual(match.command, expected.command);
		}
		if (expected.sortText) {
			assert.equal(match.sortText, expected.sortText);
		}
	};

	const testCompletionFor = async (value: string, expected: ExpectedCompletions) => {
		const offset = value.indexOf('|');
		assert.ok(offset !== -1, '| missing in "' + value + '"');
		value = value.substring(0, offset) + value.substring(offset + 1);

		const textDocument = await createDoc("example.rcasm", value);

		const completions = await provider.onCompletion({
			position: textDocument.positionAt(offset),
			textDocument,
		});

		// no duplicate labels
		const labels = completions.map(i => i.label).sort();
		let previous = null;
		for (const label of labels) {
			assert.ok(previous !== label, `Duplicate label ${label} in ${labels.join(',')}`);
			previous = label;
		}

		if (typeof expected.count === 'number') {
			assert.equal(completions.length, expected.count);
		}
		if (expected.items) {
			for (const item of expected.items) {
				assertCompletion(completions, item, textDocument);
			}
		}
	};

	describe("#register()", () => {
		it("regsiters", () => {
			const conn = {
				onCompletion: jest.fn(),
				onCompletionResolve: jest.fn(),
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onCompletion).toHaveBeenCalled();
			expect(conn.onCompletionResolve).toHaveBeenCalled();
			expect(capabilities).toHaveProperty("completionProvider");
		});
	});

	describe("#onCompletion()", () => {
		test('completes mnemonics', async function () {
			// await testCompletionFor('|', {
			// 	items: [
			// 		{ label: 'ldi', resultText: 'ldi ${1:a},${2:0}' },
			// 		{ label: 'add', resultText: 'add' }
			// 	]
			// });
			// await testCompletionFor(' |', {
			// 	items: [
			// 		{ label: 'ldi', resultText: ' ldi ${1:a},${2:0}' },
			// 		{ label: 'add', resultText: ' add' }
			// 	]
			// });
			await testCompletionFor(' l|', {
				items: [{ label: 'ldi', resultText: ' ldi ${1:a},${2:0}' }]
			});

			// await testCompletionFor('label: |', {
			// 	items: [
			// 		{ label: 'ldi', resultText: 'label: ldi ${1:a},${2:0}' },
			// 		{ label: 'add', resultText: 'label: add' }
			// 	]
			// });

			await testCompletionFor('label: l|', {
				items: [{ label: 'ldi', resultText: 'label: ldi ${1:a},${2:0}' }]
			});

			await testCompletionFor(' ld| a,5', {
				items: [{ label: 'ldi', resultText: ' ldi ${1:a},${2:0} a,5' }]
			});

			await testCompletionFor('label: l| ; comment', {
				items: [{ label: 'ldi', resultText: 'label: ldi ${1:a},${2:0} ; comment' }]
			});
		});

		// test('completes directives', async function () {
		// 	await testCompletionFor('|', {
		// 		items: [
		// 			{ label: '!align', resultText: '!align ${1:8}' },
		// 			{ label: 'add', resultText: 'add' }
		// 		]
		// 	});
		// 	await testCompletionFor(' |', {
		// 		items: [
		// 			{ label: '!word', resultText: ' !word ${1:0x0000}' },
		// 			{ label: 'add', resultText: ' add' }
		// 		]
		// 	});

		// 	await testCompletionFor(' !|', {
		// 		items: [{ label: '!align' }, { label: '!byte' }, { label: '!fill' }, { label: '!for' }, { label: '!word' }]
		// 	});

		// 	await testCompletionFor('label: |', {
		// 		items: [
		// 			{ label: '!fill', resultText: 'label: !fill ${1:8},${2:0x00}' },
		// 			{ label: 'add', resultText: 'label: add' }
		// 		]
		// 	});

		// 	await testCompletionFor('label: l|', { items: [{ label: 'ldi', resultText: 'label: ldi ${1:a},${2:0}' }] });

		// 	await testCompletionFor('label: !f| ; comment', {
		// 		items: [
		// 			{ label: '!fill', resultText: 'label: !fill ${1:8},${2:0x00} ; comment' },
		// 			{ label: '!for', resultText: 'label: !for ${1:i} in range(${2:5}) {\n        ${3:add}\n} ; comment' }
		// 		]
		// 	});

		// });

		// test('mnemonic completion includes detail', async function () {
		// 	await testCompletionFor('bc|', { items: [{ label: 'bcs', detail: 'Branch if Carry Set' }] });
		// });

		// test('Mnemonic Completion includes documentation', async function () {
		// 	await testCompletionFor('ad|', {
		// 		items: [{
		// 			label: 'add',
		// 			documentation: {
		// 				kind: 'markdown',
		// 				value: '__Arithmetic Add__  \nAdds the contents of register b and c placing the result in dst (a or d). If dst is not specified then register a is assumed. Affects Z (zero), S (sign) and C (carry) flags.  \nSyntax: `add [<dest>{a|d}]`'
		// 			}
		// 		}
		// 		]
		// 	});
		// });

		// test('Directive Completion includes documentation', async function () {
		// 		await testCompletionFor('!al|', {
		// 			items: [{
		// 				label: '!align',
		// 				documentation: {
		// 					kind: 'markdown',
		// 					value: '__Define Align__  \nWrites 8-bit zeros into the output until the current location is a multiple of the given value.  \nSyntax: `<value>{2,4,8,16...}`'
		// 				}
		// 			}
		// 			]
		// 		});
		// 	});

		// 	test('Completions in order', async () => {
		// 	await testCompletionFor('|', {
		// 		items: [
		// 			{ label: 'add', sortText: undefined },
		// 			{ label: '!align', sortText: 'align' },
		// 			{ label: 'bcs', sortText: undefined },
		// 			{ label: '!byte', sortText: 'byte' }
		// 		]
		// 	});
		// });

		it("excludes unsupported mnemonics", async () => {
			const textDocument = await createDoc("example.s", "  mov");

			const completions = await provider.onCompletion({
				position: lsp.Position.create(0, 4),
				textDocument,
			});

			expect(completions).not.toContainEqual(
				expect.objectContaining({ label: "movec" })
			);
		});

		it("includes supported mnemonics", async () => {
			const textDocument = await createDoc("example.s", "  mo");
			const ctx020: Context = {
				...ctx,
				config: {
					...ctx.config,
					processors: ["rcasm", "rcasm+div"],
				},
			};
			const provider020 = new CompletionProvider(ctx020);

			const completions = await provider020.onCompletion({
				position: lsp.Position.create(0, 4),
				textDocument,
			});

			expect(completions).toContainEqual(
				expect.objectContaining({ label: "move" })
			);
		});

		it("matches case on mnemonics", async () => {
			const textDocument = await createDoc("example.s", "  MOV");

			const completions = await provider.onCompletion({
				position: lsp.Position.create(0, 4),
				textDocument,
			});

			expect(completions).toContainEqual(
				expect.objectContaining({ label: "MOVE" })
			);
		});

		it("completes an operand with registers", async () => {
			const textDocument = await createDoc("example.s", "  move d");

			const completions = await provider.onCompletion({
				position: lsp.Position.create(0, 8),
				textDocument,
			});

			expect(completions).toContainEqual(
				expect.objectContaining({ label: "d0" })
			);
		});

		it("matches case on registers", async () => {
			const textDocument = await createDoc("example.s", "  move D");

			const completions = await provider.onCompletion({
				position: lsp.Position.create(0, 8),
				textDocument,
			});

			expect(completions).toContainEqual(
				expect.objectContaining({ label: "D0" })
			);
		});

		it("completes an operand on first character", async () => {
			const textDocument = await createDoc("example.s", "  move ");

			const completions = await provider.onCompletion({
				position: lsp.Position.create(0, 7),
				textDocument,
			});

			expect(completions).toContainEqual(
				expect.objectContaining({ label: "d0" })
			);
		});

		// it("completes an operand with a symbol", async () => {
		// 	const textDocument = await createDoc(
		// 		"example.s",
		// 		`foo = 1
		//   move f
		//       `
		// 	);

		// 	const completions = await provider.onCompletion({
		// 		position: lsp.Position.create(1, 8),
		// 		textDocument,
		// 	});

		// 	expect(completions).toContainEqual(
		// 		expect.objectContaining({ label: "foo" })
		// 	);
		// });

		// 		it("completes local symbols", async () => {
		// 			const textDocument = await createDoc(
		// 				"example.s",
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
		// 				expect.objectContaining({ label: ".local2" })
		// 			);
		// 			expect(completions).not.toContainEqual(
		// 				expect.objectContaining({ label: ".local1" })
		// 			);
		// 			expect(completions).not.toContainEqual(
		// 				expect.objectContaining({ label: ".local3" })
		// 			);
		// 		});

		it("doesn't complete on first character of line", async () => {
			const textDocument = await createDoc("example.s", ``);

			const completions = await provider.onCompletion({
				position: lsp.Position.create(0, 0),
				textDocument,
			});

			expect(completions).toHaveLength(0);
		});

		// 		it("includes comment documentation before declaration", async () => {
		// 			const textDocument = await createDoc(
		// 				"example.s",
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
		// 					documentation: { kind: "markdown", value: "test 123  \nexample" },
		// 				})
		// 			);
		// 		});

		// 		it("includes comment documentation on same line as declaration", async () => {
		// 			const textDocument = await createDoc(
		// 				"example.s",
		// 				`foo = 123 ; example
		//  move fo`
		// 			);

		// 			const completions = await provider.onCompletion({
		// 				position: lsp.Position.create(1, 8),
		// 				textDocument,
		// 			});

		// 			expect(completions).toContainEqual(
		// 				expect.objectContaining({
		// 					documentation: { kind: "markdown", value: "example" },
		// 				})
		// 			);
		// 		});

		// TODO: signature specific operand competions
	});

	describe("#onCompletionResolve()", () => {
		it("adds documentation", () => {
			const item = provider.onCompletionResolve({
				label: "move",
				data: true,
			});
			expect(item.documentation).toBeTruthy();
			expect(lsp.MarkupContent.is(item.documentation)).toBe(true);
			lsp.MarkupContent.is(item.documentation);
			expect((item.documentation! as lsp.MarkupContent).value).toContain("MOVE");
		});
	});
});