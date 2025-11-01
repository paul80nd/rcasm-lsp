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
		public async isUndefined() {
			expect(await this.doHover()).toBeUndefined();
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
		describe('mnemonic hovers', () => {
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

			it('provides hover info for positions within instruction', async () => {
				const contents = {
					kind: 'markdown',
					value: expect.stringMatching(/Arithmetic Add/)
				};
				await hoverFor('| add').isUndefined();
				await hoverFor('|add').is({ range: range(0, 0, 0, 3), contents });
				await hoverFor('a|dd').is({ range: range(0, 0, 0, 3), contents });
				await hoverFor('add|').is({ range: range(0, 0, 0, 3), contents });
				await hoverForAt('add \n add', 1, 2).is({ range: range(1, 1, 1, 4), contents });
			});
		});

		describe('directive hovers', () => {
			it('provides hover info for !data', async () => {
				await hoverFor('!by|te 0x01, 0x02').is({
					range: range(0, 0, 0, 16),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Byte Data/)
					}
				});
				await hoverFor('!wor|d 0x01, 0x02').is({
					range: range(0, 0, 0, 16),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Word Data/)
					}
				});
			});

			it('provides hover info for !fill', async () =>
				await hoverFor('!fi|ll 8, 0x01').is({
					range: range(0, 0, 0, 13),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Fill Space/)
					}
				}));

			it('provides hover info for !align', async () =>
				await hoverFor('!a|lign 8').is({
					range: range(0, 0, 0, 8),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Align/)
					}
				}));

			it('provides hover info for !for', async () =>
				await hoverFor('!fo|r i in range(0,2) {\n add\n}').is({
					range: range(0, 0, 2, 1),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define For Loop/)
					}
				}));

			it('provides hover info for !for within block', async () =>
				await hoverForAt('!for i in range(0,2) {\n add\n}', 1, 0).is({
					range: range(0, 0, 2, 1),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define For Loop/)
					}
				}));

			it('mnemonic hover overrides outer !for block', async () =>
				await hoverForAt('!for i in range(0,2) {\n add\n}', 1, 2).is({
					range: range(1, 1, 1, 4),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Arithmetic Add/)
					}
				}));

			it('provides hover info for !if', async () =>
				await hoverFor('!i|f (0==1) {\n add\n} else {\n inc\n}').is({
					range: range(0, 0, 4, 1),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Conditional Block/)
					}
				}));

			it('provides hover info for !if within if block', async () =>
				await hoverForAt('!if (0==1) {\n add\n} else {\n inc\n}', 1, 0).is({
					range: range(0, 0, 4, 1),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Conditional Block/)
					}
				}));

			it('mnemonic hover overrides outer !if block', async () =>
				await hoverForAt('!if (0==1) {\n add\n} else {\n inc\n}', 1, 2).is({
					range: range(1, 1, 1, 4),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Arithmetic Add/)
					}
				}));

			it('provides hover info for !if within else block', async () =>
				await hoverForAt('!if (0==1) {\n add\n} else {\n inc\n}', 3, 0).is({
					range: range(0, 0, 4, 1),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Conditional Block/)
					}
				}));

			it('mnemonic hover overrides outer !if block', async () =>
				await hoverForAt('!if (0==1) {\n add\n} else {\n inc\n}', 3, 2).is({
					range: range(3, 1, 3, 4),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Arithmetic Increment/)
					}
				}));

			it('provides hover info for !let', async () =>
				await hoverFor('!l|et a=5').is({
					range: range(0, 0, 0, 8),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Variable/)
					}
				}));

			it('provides hover info for !error', async () =>
				await hoverFor('!e|rror "broken"').is({
					range: range(0, 0, 0, 15),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Throw Assembly Error/)
					}
				}));
		});

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
