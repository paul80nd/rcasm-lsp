import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Context } from '../../src/context';
import DocumentProcessor from '../../src/document-processor';
import HoverProvider from '../../src/providers/hover-provider';
import { createTestContext, range, between } from '../helpers';
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
					range: between(7, 15),
					contents: {
						kind: 'markdown',
						value: expect.stringMatching(/8-bit Register to Register Copy/)
					}
				}));

			it('provides hover for instructions within scopes', async () =>
				await given('test: {\nlabel: mov a,b ; test\n}')
					.hoverAt(1, 8)
					.is({
						range: range(1, 7, 1, 15),
						contents: {
							kind: 'markdown',
							value: expect.stringMatching(/8-bit Register to Register Copy/)
						}
					}));

			it('provides hover for positions within instruction', async () => {
				const contents = { kind: 'markdown', value: expect.stringMatching(/Arithmetic Add/) };
				await hoverFor('| add').isUndefined();
				await hoverFor('|add').is({ range: between(0, 3), contents });
				await hoverFor('a|dd').is({ range: between(0, 3), contents });
				await hoverFor('add|').is({ range: between(0, 3), contents });
				await given('add \n add')
					.hoverAt(1, 2)
					.is({ range: range(1, 1, 1, 4), contents });
			});

			it('provides basic hover for org', async () =>
				await hoverFor('label: o|rg 0xfedc ; test').is({
					range: between(7, 18),
					contents: { kind: 'plaintext', value: '(instruction) org' }
				}));
		});

		describe('directive hovers', () => {
			it('provides hover for !data', async () => {
				await hoverFor('!by|te 0x01, 0x02').is({
					range: between(0, 16),
					contents: { kind: 'markdown', value: expect.stringMatching(/Define Byte Data/) }
				});
				await hoverFor('!wor|d 0x01, 0x02').is({
					range: between(0, 16),
					contents: { kind: 'markdown', value: expect.stringMatching(/Define Word Data/) }
				});
			});

			it('provides hover for !fill', async () =>
				await hoverFor('!fi|ll 8, 0x01').is({
					range: between(0, 13),
					contents: { kind: 'markdown', value: expect.stringMatching(/Define Fill Space/) }
				}));

			it('provides hover for !align', async () =>
				await hoverFor('!a|lign 8').is({
					range: between(0, 8),
					contents: { kind: 'markdown', value: expect.stringMatching(/Define Align/) }
				}));

			it('provides hover for !for', async () =>
				await hoverFor('!fo|r i in range(0,2) {\n add\n}').is({
					range: range(0, 0, 2, 1),
					contents: { kind: 'markdown', value: expect.stringMatching(/Define For Loop/) }
				}));

			it('provides hover for !for within block', async () =>
				await given('!for i in range(0,2) {\n add\n}')
					.hoverAt(1, 0)
					.is({
						range: range(0, 0, 2, 1),
						contents: { kind: 'markdown', value: expect.stringMatching(/Define For Loop/) }
					}));

			it('mnemonic hover overrides outer !for block', async () =>
				await given('!for i in range(0,2) {\n add\n}')
					.hoverAt(1, 2)
					.is({
						range: range(1, 1, 1, 4),
						contents: { kind: 'markdown', value: expect.stringMatching(/Arithmetic Add/) }
					}));

			it('provides hover for !if', async () =>
				await hoverFor('!i|f (0==1) {\n add\n} else {\n inc\n}').is({
					range: range(0, 0, 4, 1),
					contents: { kind: 'markdown', value: expect.stringMatching(/Define Conditional Block/) }
				}));

			it('provides hover for !if within if block', async () =>
				await given('!if (0==1) {\n add\n} else {\n inc\n}')
					.hoverAt(1, 0)
					.is({
						range: range(0, 0, 4, 1),
						contents: { kind: 'markdown', value: expect.stringMatching(/Define Conditional Block/) }
					}));

			it('mnemonic hover overrides outer !if block', async () =>
				await given('!if (0==1) {\n add\n} else {\n inc\n}')
					.hoverAt(1, 2)
					.is({
						range: range(1, 1, 1, 4),
						contents: { kind: 'markdown', value: expect.stringMatching(/Arithmetic Add/) }
					}));

			it('provides hover for !if within else block', async () =>
				await given('!if (0==1) {\n add\n} else {\n inc\n}')
					.hoverAt(3, 0)
					.is({
						range: range(0, 0, 4, 1),
						contents: { kind: 'markdown', value: expect.stringMatching(/Define Conditional Block/) }
					}));

			it('mnemonic hover overrides outer !if block', async () =>
				await given('!if (0==1) {\n add\n} else {\n inc\n}')
					.hoverAt(3, 2)
					.is({
						range: range(3, 1, 3, 4),
						contents: { kind: 'markdown', value: expect.stringMatching(/Arithmetic Increment/) }
					}));

			it('provides hover for !let', async () =>
				await hoverFor('!l|et a=5').is({
					range: between(0, 8),
					contents: { kind: 'markdown', value: expect.stringMatching(/Define Variable/) }
				}));

			it('provides hover for !error', async () =>
				await hoverFor('!e|rror "broken"').is({
					range: between(0, 15),
					contents: { kind: 'markdown', value: expect.stringMatching(/Throw Assembly Error/) }
				}));
		});

		describe('register hovers', () => {
			it('provides hover for register', async () =>
				await hoverFor('label: mov a|,b ; test').is({
					range: between(11, 12),
					contents: { kind: 'markdown', value: expect.stringMatching(/A Register/) }
				}));

			it('provides hover for register within scopes', async () =>
				await given('test: {\nlabel: mov a,b ; test\n}')
					.hoverAt(1, 13)
					.is({
						range: range(1, 13, 1, 15),
						contents: { kind: 'markdown', value: expect.stringMatching(/B Register/) }
					}));

			it('provides hover for positions within register', async () => {
				const mContents = { kind: 'markdown', value: expect.stringMatching(/M Register/) };
				const xyContents = { kind: 'markdown', value: expect.stringMatching(/XY Register/) };
				await hoverFor('mov |xy,m').is({ range: between(4, 6), contents: xyContents });
				await hoverFor('mov x|y,m').is({ range: between(4, 6), contents: xyContents });
				await hoverFor('mov xy|,m').is({ range: between(4, 6), contents: xyContents });
				await hoverFor('mov xy,|m').is({ range: between(7, 8), contents: mContents });
				await hoverFor('mov xy,m|').is({ range: between(7, 8), contents: mContents });
			});
		});

		describe('literal hovers', () => {
			it('provides hover for literals on instruction params', async () => {
				await hoverFor('ldi m,|5').is({
					range: between(6, 7),
					contents: { kind: 'markdown', value: '5 | 0x5 | 101b' }
				});
				await hoverFor('ldi m,0xf|e').is({
					range: between(6, 10),
					contents: { kind: 'markdown', value: '254 | 0xfe | 11111110b' }
				});
				await hoverFor('ldi m,0110110|0b').is({
					range: between(6, 15),
					contents: { kind: 'markdown', value: '108 | 0x6c | 1101100b' }
				});
			});

			it('provides hover for literals within expressions', async () => {
				await hoverFor('ldi m,(2|+4)/6').is({
					range: between(7, 8),
					contents: { kind: 'markdown', value: '2 | 0x2 | 10b' }
				});
				await hoverFor('ldi m,(2+4|)/6').is({
					range: between(9, 10),
					contents: { kind: 'markdown', value: '4 | 0x4 | 100b' }
				});
				await hoverFor('ldi m,(2+4)/|6').is({
					range: between(12, 13),
					contents: { kind: 'markdown', value: '6 | 0x6 | 110b' }
				});
			});

			it('provdes hover for literals within data directives', async () => {
				const code = given('!byte 0x39, 123, "ABC"');
				await code.hoverAt(0, 7).is({
					range: between(6, 10),
					contents: { kind: 'markdown', value: '57 | 0x39 | 111001b' }
				});
				await code.hoverAt(0, 14).is({
					range: between(12, 15),
					contents: { kind: 'markdown', value: '123 | 0x7b | 1111011b' }
				});
				await code.hoverAt(0, 27).is({
					range: between(17, 22),
					contents: { kind: 'markdown', value: 'ABC' }
				});
			});

			it('provides hover for literals within fill directives', async () =>
				await hoverFor('!fill 9,0|xaa').is({
					range: between(8, 12),
					contents: { kind: 'markdown', value: '170 | 0xaa | 10101010b' }
				}));

			it('provides hover for literals within align directives', async () =>
				await hoverFor('!align 20|-4').is({
					range: between(7, 9),
					contents: { kind: 'markdown', value: '20 | 0x14 | 10100b' }
				}));
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
			// Filter: hover at position
			hoverAt: (r: number, c: number) => {
				// Action: provide hover
				const hoverProvider = async () => {
					const doc = await docProvider();
					return provider.onHover({ position: lsp.Position.create(r, c), textDocument: doc });
				};
				return {
					// Assert: hover
					is: async <E>(expected: E) => expect(await hoverProvider()).toEqual(expected),
					isUndefined: async () => expect(await hoverProvider()).toBeUndefined()
				};
			}
		};
	};

	const hoverFor = (value: string) => {
		const offset = value.indexOf('|');
		assert.ok(offset !== -1, `| missing in '${value}'`);
		value = value.substring(0, offset) + value.substring(offset + 1);
		return given(value).hoverAt(0, offset);
	};
});
