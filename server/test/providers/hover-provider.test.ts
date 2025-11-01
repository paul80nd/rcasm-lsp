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
		) { }

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
			const conn = { onHover: jest.fn() };
			const capabilities = provider.register(conn as unknown as lsp.Connection);
			expect(conn.onHover).toHaveBeenCalled();
			expect(capabilities).toHaveProperty('hoverProvider');
		});
	});

	describe('#onHover()', () => {
		describe('mnemonic hovers', () => {
			it('provides hover for instructions', async () =>
				await hoverFor('label: m|ov a,b ; test').is({
					range: range(0, 7, 0, 15),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/8-bit Register to Register Copy/)
					}
				}));

			it('provides hover for instructions within scopes', async () =>
				await hoverForAt('test: {\nlabel: mov a,b ; test\n}', 1, 8).is({
					range: range(1, 7, 1, 15),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/8-bit Register to Register Copy/)
					}
				}));

			it('provides hover for positions within instruction', async () => {
				const contents = { kind: 'markdown', value: expect.stringMatching(/Arithmetic Add/) };
				await hoverFor('| add').isUndefined();
				await hoverFor('|add').is({ range: range(0, 0, 0, 3), contents });
				await hoverFor('a|dd').is({ range: range(0, 0, 0, 3), contents });
				await hoverFor('add|').is({ range: range(0, 0, 0, 3), contents });
				await hoverForAt('add \n add', 1, 2).is({ range: range(1, 1, 1, 4), contents });
			});

			it('provides basic hover for org', async () =>
				await hoverFor('label: o|rg 0xfedc ; test').is({
					range: range(0, 7, 0, 18),
					contents: {
						kind: 'plaintext',
						value: '(instruction) org'
					}
				}));
		});

		describe('directive hovers', () => {
			it('provides hover for !data', async () => {
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

			it('provides hover for !fill', async () =>
				await hoverFor('!fi|ll 8, 0x01').is({
					range: range(0, 0, 0, 13),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Fill Space/)
					}
				}));

			it('provides hover for !align', async () =>
				await hoverFor('!a|lign 8').is({
					range: range(0, 0, 0, 8),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Align/)
					}
				}));

			it('provides hover for !for', async () =>
				await hoverFor('!fo|r i in range(0,2) {\n add\n}').is({
					range: range(0, 0, 2, 1),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define For Loop/)
					}
				}));

			it('provides hover for !for within block', async () =>
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

			it('provides hover for !if', async () =>
				await hoverFor('!i|f (0==1) {\n add\n} else {\n inc\n}').is({
					range: range(0, 0, 4, 1),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Conditional Block/)
					}
				}));

			it('provides hover for !if within if block', async () =>
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

			it('provides hover for !if within else block', async () =>
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

			it('provides hover for !let', async () =>
				await hoverFor('!l|et a=5').is({
					range: range(0, 0, 0, 8),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Define Variable/)
					}
				}));

			it('provides hover for !error', async () =>
				await hoverFor('!e|rror "broken"').is({
					range: range(0, 0, 0, 15),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/Throw Assembly Error/)
					}
				}));
		});

		describe('register hovers', () => {
			it('provides hover for register', async () =>
				await hoverFor('label: mov a|,b ; test').is({
					range: range(0, 11, 0, 12),
					contents: { kind: 'markdown', value: expect.stringMatching(/A Register/) }
				}));

			it('provides hover for register within scopes', async () =>
				await hoverForAt('test: {\nlabel: mov a,b ; test\n}', 1, 13).is({
					range: range(1, 13, 1, 15),
					contents: { kind: 'markdown', value: expect.stringMatching(/B Register/) }
				}));

			it('provides hover for positions within register', async () => {
				const mContents = { kind: 'markdown', value: expect.stringMatching(/M Register/) };
				const xyContents = { kind: 'markdown', value: expect.stringMatching(/XY Register/) };
				await hoverFor('mov |xy,m').is({ range: range(0, 4, 0, 6), contents: xyContents });
				await hoverFor('mov x|y,m').is({ range: range(0, 4, 0, 6), contents: xyContents });
				await hoverFor('mov xy|,m').is({ range: range(0, 4, 0, 6), contents: xyContents });
				await hoverFor('mov xy,|m').is({ range: range(0, 7, 0, 8), contents: mContents });
				await hoverFor('mov xy,m|').is({ range: range(0, 7, 0, 8), contents: mContents });
			});
		});

		describe('literal hovers', () => {
			it('provides hover for literals on instruction params', async () => {
				await hoverFor('ldi m,|5').is({
					range: range(0, 6, 0, 7),
					contents: { kind: 'markdown', value: '5 | 0x5 | 101b' }
				});
				await hoverFor('ldi m,0xf|e').is({
					range: range(0, 6, 0, 10),
					contents: { kind: 'markdown', value: '254 | 0xfe | 11111110b' }
				});
				await hoverFor('ldi m,0110110|0b').is({
					range: range(0, 6, 0, 15),
					contents: { kind: 'markdown', value: '108 | 0x6c | 1101100b' }
				});
			});

			it('provides hover for literals within expressions', async () => {
				await hoverFor('ldi m,(2|+4)/6').is({
					range: range(0, 7, 0, 8),
					contents: { kind: 'markdown', value: '2 | 0x2 | 10b' }
				});
				await hoverFor('ldi m,(2+4|)/6').is({
					range: range(0, 9, 0, 10),
					contents: { kind: 'markdown', value: '4 | 0x4 | 100b' }
				});
				await hoverFor('ldi m,(2+4)/|6').is({
					range: range(0, 12, 0, 13),
					contents: { kind: 'markdown', value: '6 | 0x6 | 110b' }
				});
			});

			it('provdes hover for literals within data directives', async () => {
				const line = `!byte 0x39, 123, "ABC"`;
				await hoverForAt(line, 0, 7).is({
					range: range(0, 6, 0, 10),
					contents: { kind: 'markdown', value: '57 | 0x39 | 111001b' }
				});
				await hoverForAt(line, 0, 14).is({
					range: range(0, 12, 0, 15),
					contents: { kind: 'markdown', value: '123 | 0x7b | 1111011b' }
				});
				await hoverForAt(line, 0, 27).is({
					range: range(0, 17, 0, 22),
					contents: { kind: 'markdown', value: 'ABC' }
				});
			});
		});
		//     it("provide hover  for symbol reference", async () => {
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

		//     it("provide hover for a path", async () => {
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
	});
});
