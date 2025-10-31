import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Context } from '../../src/context';
import DocumentProcessor from '../../src/document-processor';
import HoverProvider from '../../src/providers/hover-provider';
import { createTestContext, range } from '../helpers';
import assert from 'assert';

describe('HoverProvider', () => {
	let provider: HoverProvider;
	let ctx: Context;
	let processor: DocumentProcessor;

	beforeAll(async () => {
		ctx = await createTestContext();
		processor = new DocumentProcessor(ctx);
		provider = new HoverProvider(ctx);
	});

	// Create and process text doc
	const createDoc = async (filename: string, text: string) => {
		const uri = ctx.workspaceFolders[0].uri + '/' + filename;
		const textDocument = TextDocument.create(uri, 'vasmmot', 0, text);
		await processor.process(textDocument);
		return textDocument;
	};

	const hoverFor = (v: string) => HoverTest.for(v);
	const hoverForAt = (v: string, r: number, c: number) => HoverTest.forAt(v, r, c);

	class HoverTest {
		public static for(value: string): HoverTest {
			const offset = value.indexOf('|');
			assert.ok(offset !== -1, `| missing in '${value}'`);
			value = value.substring(0, offset) + value.substring(offset + 1);
			return new HoverTest(value, lsp.Position.create(0, offset));
		}

		public static forAt(value: string, row: number, col: number): HoverTest {
			return new HoverTest(value, lsp.Position.create(row, col));
		}

		private constructor(
			private value: string,
			private position: lsp.Position
		) {}

		private async doHover(): Promise<lsp.Hover | undefined> {
			const textDocument = await createDoc('example.s', this.value);
			return await provider.onHover({
				position: this.position,
				textDocument
			});
		}

		public async is<E>(expected: E) {
			expect(await this.doHover()).toEqual(expected);
		}
	}

	describe('#register()', () => {
		it('regsiters', () => {
			const conn = {
				onHover: jest.fn()
			};
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onHover).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('hoverProvider');
		});
	});

	describe('#onHover()', () => {
		//     it("provide hover info for symbol reference", async () => {
		//       const textDocument = await createDoc(
		//         "example.s",
		//         `foo = 1
		// 	move #foo,d1`
		//       );

		//       const hover = await provider.onHover({
		//         textDocument,
		//         position: lsp.Position.create(1, 9),
		//       });

		//       expect(hover).toEqual({
		//         range: range(1, 7, 1, 10),
		//         contents: [{ language: "vasmmot", value: "foo = 1" }],
		//       });
		//     });

		it('provides hover info for instructions', async () =>
			await hoverFor('label: m|ov a,b ; test').is({
				range: range(0, 7, 0, 15),
				contents: {
					kind: 'markdown',
					value: expect.stringMatching(/8-bit Register to Register Copy/)
				}
			}));

		it('provides hover info for instructions within scopes', async () =>
			await hoverForAt('test: {\nlabel: mov a,b ; test\n}', 1, 8).is({
				range: range(1, 7, 1, 15),
				contents: {
					kind: 'markdown',
					value: expect.stringMatching(/8-bit Register to Register Copy/)
				}
			}));

		//     it("provide hover info for directives", async () => {
		//       const textDocument = await createDoc("example.s", ` section foo,bss`);

		//       const hover = await provider.onHover({
		//         textDocument,
		//         position: lsp.Position.create(0, 3),
		//       });

		//       expect(hover).toEqual({
		//         range: range(0, 1, 0, 8),
		//         contents: {
		//           kind: "markdown",
		//           value: expect.stringMatching(/Starts a new section/),
		//         },
		//       });
		//     });

		//     it("provide hover info for size qualifier", async () => {
		//       const textDocument = await createDoc("example.s", ` move.w d0,d1`);

		//       const hover = await provider.onHover({
		//         textDocument,
		//         position: lsp.Position.create(0, 6),
		//       });

		//       expect(hover).toEqual({
		//         range: range(0, 6, 0, 7),
		//         contents: {
		//           kind: "plaintext",
		//           value: expect.stringMatching(/Word/),
		//         },
		//       });
		//     });

		//     it("provide hover info for a path", async () => {
		//       const textDocument = await createDoc("example.s", ` include "example.i"`);

		//       const hover = await provider.onHover({
		//         textDocument,
		//         position: lsp.Position.create(0, 13),
		//       });

		//       expect(hover).toEqual({
		//         range: range(0, 9, 0, 20),
		//         contents: {
		//           kind: "markdown",
		//           value: expect.stringMatching(/example\.i/),
		//         },
		//       });
		//     });

		//     it("provide hover for literals", async () => {
		//       const textDocument = await createDoc("example.s", ` move #40,d0`);

		//       const hover = await provider.onHover({
		//         textDocument,
		//         position: lsp.Position.create(0, 7),
		//       });

		//       expect(hover).toEqual({
		//         range: range(0, 7, 0, 9),
		//         contents: {
		//           kind: "markdown",
		//           value: '40 | $28 | %101000 | @50 | "("',
		//         },
		//       });
		//     });
	});
});
