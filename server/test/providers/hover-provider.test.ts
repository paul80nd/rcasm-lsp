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

	beforeAll(() => {
		ctx = createTestContext();
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
				await hoverFor('label: m|ov a,b ; test').is(
					hover.between(7, 14).containingText(/8-bit Register to Register Copy/)
				));

			it('provides hover for instructions within scopes', async () =>
				await given('test: {', 'label: mov a,b ; test', '}')
					.hoverAt(1, 8)
					.is(hover.covering(1, 7, 1, 14).containingText(/8-bit Register to Register Copy/)));

			it('provides hover for positions within instruction', async () => {
				const expected = hover.between(0, 3).containingText(/Arithmetic Add/);
				await hoverFor('| add').isUndefined();
				await hoverFor('|add').is(expected);
				await hoverFor('a|dd').is(expected);
				await hoverFor('add|').is(expected);
				await given('add ', ' add')
					.hoverAt(1, 2)
					.is(hover.covering(1, 1, 1, 4).containingText(/Arithmetic Add/));
			});

			it('provides basic hover for org', async () =>
				await hoverFor('label: o|rg 0xfedc ; test').is(
					hover.between(7, 17).withPlainText('(instruction) org')
				));
		});

		describe('directive hovers', () => {
			it('provides hover for !data', async () => {
				await hoverFor('!by|te 0x01, 0x02').is(
					hover.between(0, 16).containingText(/Define Byte Data/)
				);
				await hoverFor('!wor|d 0x01, 0x02').is(
					hover.between(0, 16).containingText(/Define Word Data/)
				);
			});

			it('provides hover for !fill', async () =>
				await hoverFor('!fi|ll 8, 0x01').is(
					hover.between(0, 13).containingText(/Define Fill Space/)
				));

			it('provides hover for !align', async () =>
				await hoverFor('!a|lign 8').is(hover.between(0, 8).containingText(/Define Align/)));

			it('provides hover for !for', async () =>
				await hoverFor('!fo|r i in range(0,2) {\n add\n}').is(
					hover.covering(0, 0, 2, 1).containingText(/Define For Loop/)
				));

			it('provides hover for !for within block', async () =>
				await given('!for i in range(0,2) {', ' add', '}')
					.hoverAt(1, 0)
					.is(hover.covering(0, 0, 2, 1).containingText(/Define For Loop/)));

			it('mnemonic hover overrides outer !for block', async () =>
				await given('!for i in range(0,2) {', ' add', '}')
					.hoverAt(1, 2)
					.is(hover.covering(1, 1, 1, 4).containingText(/Arithmetic Add/)));

			it('provides hover for !if', async () =>
				await hoverFor('!i|f (0==1) {\n add\n} else {\n inc\n}').is(
					hover.covering(0, 0, 4, 1).containingText(/Define Conditional Block/)
				));

			it('provides hover for !if within if block', async () =>
				await given('!if (0==1) {', ' add', '} else {', ' inc', '}')
					.hoverAt(1, 0)
					.is(hover.covering(0, 0, 4, 1).containingText(/Define Conditional Block/)));

			it('mnemonic hover overrides outer !if block', async () =>
				await given('!if (0==1) {', ' add', '} else {', ' inc', '}')
					.hoverAt(1, 2)
					.is(hover.covering(1, 1, 1, 4).containingText(/Arithmetic Add/)));

			it('provides hover for !if within else block', async () =>
				await given('!if (0==1) {', ' add', '} else {', ' inc', '}')
					.hoverAt(3, 0)
					.is(hover.covering(0, 0, 4, 1).containingText(/Define Conditional Block/)));

			it('mnemonic hover overrides outer !if block', async () =>
				await given('!if (0==1) {', ' add', '} else {', ' inc', '}')
					.hoverAt(3, 2)
					.is(hover.covering(3, 1, 3, 4).containingText(/Arithmetic Increment/)));

			it('provides hover for !let', async () =>
				await hoverFor('!l|et a=5').is(hover.between(0, 8).containingText(/Define Variable/)));

			it('provides hover for !error', async () =>
				await hoverFor('!e|rror "broken"').is(
					hover.between(0, 15).containingText(/Throw Assembly Error/)
				));
		});

		describe('register hovers', () => {
			it('provides hover for register', async () =>
				await hoverFor('label: mov a|,b ; test').is(
					hover.between(11, 12).containingText(/A Register/)
				));

			it('provides hover for register within scopes', async () =>
				await given('test: {', 'label: mov a,b ; test', '}')
					.hoverAt(1, 13)
					.is(hover.covering(1, 13, 1, 14).containingText(/B Register/)));

			it('provides hover for positions within register', async () => {
				await hoverFor('mov |xy,m').is(hover.between(4, 6).containingText(/XY Register/));
				await hoverFor('mov x|y,m').is(hover.between(4, 6).containingText(/XY Register/));
				await hoverFor('mov xy|,m').is(hover.between(4, 6).containingText(/XY Register/));
				await hoverFor('mov xy,|m').is(hover.between(7, 8).containingText(/M Register/));
				await hoverFor('mov xy,m|').is(hover.between(7, 8).containingText(/M Register/));
			});
		});

		describe('literal hovers', () => {
			it('provides hover for literals on instruction params', async () => {
				await hoverFor('ldi m,|5').is(hover.between(6, 7).withText('5 | 0x5 | 101b'));
				await hoverFor('ldi m,0xf|e').is(hover.between(6, 10).withText('254 | 0xfe | 11111110b'));
				await hoverFor('ldi m,0110110|0b').is(
					hover.between(6, 15).withText('108 | 0x6c | 1101100b')
				);
			});

			it('provides hover for literals within expressions', async () => {
				await hoverFor('ldi m,(2|+4)/6').is(hover.between(7, 8).withText('2 | 0x2 | 10b'));
				await hoverFor('ldi m,(2+4|)/6').is(hover.between(9, 10).withText('4 | 0x4 | 100b'));
				await hoverFor('ldi m,(2+4)/|6').is(hover.between(12, 13).withText('6 | 0x6 | 110b'));
			});

			it('provdes hover for literals within data directives', async () => {
				const code = given('!byte 0x39, 123, "ABC"');
				await code.hoverAt(0, 7).is(hover.between(6, 10).withText('57 | 0x39 | 111001b'));
				await code.hoverAt(0, 14).is(hover.between(12, 15).withText('123 | 0x7b | 1111011b'));
				await code.hoverAt(0, 27).is(hover.between(17, 22).withText('ABC'));
			});

			it('provides hover for literals within fill directives', async () =>
				await hoverFor('!fill 9,0|xaa').is(
					hover.between(8, 12).withText('170 | 0xaa | 10101010b')
				));

			it('provides hover for literals within align directives', async () =>
				await hoverFor('!align 20|-4').is(hover.between(7, 9).withText('20 | 0x14 | 10100b')));
		});

		describe('label hovers', () => {
			it('provides a hover on label', async () =>
				await given('test: add')
					.hoverAt(0, 3)
					.is(hover.covering(0, 0, 0, 4).withText('(label) test')));

			it('provides a hover on scoped label', async () =>
				await given('scp: {', 'test: add', '}')
					.hoverAt(1, 3)
					.is(hover.covering(1, 0, 1, 4).withText('(label) scp::test')));
		});

		describe('label ref hovers', () => {
			it('provides a hover on label ref', async () =>
				await given('test: add', 'jmp test')
					.hoverAt(1, 6)
					.is(hover.covering(1, 4, 1, 8).withText('(label) test')));

			it('provides a hover on label ref even if label follows after', async () =>
				await given('jmp test', 'test: add')
					.hoverAt(0, 6)
					.is(hover.covering(0, 4, 0, 8).withText('(label) test')));

			it('provides a hover on scoped label ref', async () =>
				await given('jmp scp::test', 'scp: {', 'test: add', '}')
					.hoverAt(0, 6)
					.is(hover.covering(0, 4, 0, 13).withText('(label) scp::test')));

			it('provides hover for refs split on §', async () => {
				const g = given('fra: inc', 'ldi m,fra§parr', 'parr: add');
				await g.hoverAt(1, 8).is(hover.covering(1, 6, 1, 9).withText('(label) fra'));
				await g.hoverAt(1, 12).is(hover.covering(1, 10, 1, 14).withText('(label) parr'));
			});
		});

		describe('variable ref hovers', () => {
			it('provides a hover on variable ref', async () =>
				await given('!let   k  = 5', 'ldi b,k')
					.hoverAt(1, 6)
					.is(hover.covering(1, 6, 1, 7).withRcasm('!let k = 5')));
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
				hoverAt: (r: number, c: number) => {
					// Action: provide hover
					const hoverProvider = async () => {
						const doc = await docProvider();
						return provider.onHover({
							position: lsp.Position.create(r, c),
							textDocument: doc
						});
					};
					return {
						// Assert: hover
						is: async <E>(expected: E) => expect(await hoverProvider()).toEqual(expected),
						isUndefined: async () => expect(await hoverProvider()).toBeUndefined()
					};
				}
			};
		};

		const hover = {
			between: (s: number, e: number) => hover.covering(0, s, 0, e),
			covering: (sr: number, sc: number, er: number, ec: number) =>
				hover.overRange(range(sr, sc, er, ec)),
			overRange: (range: lsp.Range) => {
				const s1 = {
					withText: (str: string) => s1.withContent({ kind: 'markdown', value: str }),
					withPlainText: (str: string) => s1.withContent({ kind: 'plaintext', value: str }),
					containingText: (str: string | RegExp) =>
						s1.withContent({ kind: 'markdown', value: expect.stringMatching(str) }),
					withContent: (contents: lsp.MarkupContent) => ({
						range,
						contents
					}),
					withRcasm: (code: string) => s1.withText('```rcasm\n' + code + '\n```')
				};
				return s1;
			}
		};

		const hoverFor = (value: string) => {
			const offset = value.indexOf('|');
			assert.ok(offset !== -1, `| missing in '${value}'`);
			value = value.substring(0, offset) + value.substring(offset + 1);
			return given(value).hoverAt(0, offset);
		};
	});
});
