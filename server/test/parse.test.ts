import { parseLine, componentAtIndex, ComponentType, parseSignature } from '../src/parse';

const parsing = (input: string) => {
	const line = parseLine(input);
	return {
		is: <E>(expected: E) => expect(line).toEqual<E>(expected),
		atIndex: (index: number) => {
			const info = componentAtIndex(line, index);
			return {
				hasInfo: <E>(expected: E) => expect(info).toEqual<E>(expected),
				isUndefined: () => expect(info).toBeUndefined()
			};
		}
	};
};

const parsingSignature = (input: string) => {
	const { operands } = parseSignature(input);
	return {
		hasOperands: <E>(expected: E) => expect(operands).toEqual<E>(expected)
	};
};

describe('parse', () => {
	describe('#parseLine()', () => {
		it('parses a complete instruction line', () =>
			parsing('label:    mov     #1,10(a0,d1,w)    ; comment here').is({
				label: { start: 0, end: 5, value: 'label' },
				mnemonic: { start: 10, end: 13, value: 'mov' },
				operands: [
					{ start: 18, end: 20, value: '#1' },
					{ start: 21, end: 32, value: '10(a0,d1,w)' }
				],
				comment: { start: 36, end: 50, value: '; comment here' }
			}));

		it('parses a complete directive line', () =>
			parsing('label:    !byte     10, 0xfe, 01010101b    ; comment here').is({
				label: { start: 0, end: 5, value: 'label' },
				mnemonic: { start: 10, end: 15, value: '!byte' },
				operands: [
					{ start: 20, end: 22, value: '10' },
					{ start: 24, end: 28, value: '0xfe' },
					{ start: 30, end: 39, value: '01010101b' }
				],
				comment: { start: 43, end: 57, value: '; comment here' }
			}));

		it('parses a condensed instruction line', () =>
			parsing('label: mov #1,10(a0,d1,w) ; comment here').is({
				label: { start: 0, end: 5, value: 'label' },
				mnemonic: { start: 7, end: 10, value: 'mov' },
				operands: [
					{ start: 11, end: 13, value: '#1' },
					{ start: 14, end: 25, value: '10(a0,d1,w)' }
				],
				comment: { start: 26, end: 40, value: '; comment here' }
			}));

		it('parses a condensed directive line', () =>
			parsing('label: !word 0xfedc  ; comment here').is({
				label: { start: 0, end: 5, value: 'label' },
				mnemonic: { start: 7, end: 12, value: '!word' },
				operands: [{ start: 13, end: 19, value: '0xfedc' }],
				comment: { start: 21, end: 35, value: '; comment here' }
			}));

		it('parses a line with only a label', () =>
			parsing('label:').is({
				label: { start: 0, end: 5, value: 'label' }
			}));

		it('parses a prefixed label', () =>
			parsing('_label:').is({
				label: { start: 0, end: 6, value: '_label' }
			}));

		it('parses a label with leading whitespace', () =>
			parsing('   label:').is({
				label: { start: 3, end: 8, value: 'label' }
			}));

		it('parses a label and mnemonic with no whitespace', () =>
			parsing('label:rts').is({
				label: { start: 0, end: 5, value: 'label' },
				mnemonic: { start: 6, end: 9, value: 'rts' }
			}));

		it('parses a label and directive with no whitespace', () =>
			parsing('label:!word').is({
				label: { start: 0, end: 5, value: 'label' },
				mnemonic: { start: 6, end: 11, value: '!word' }
			}));

		it('parses an instruction line with no label', () =>
			parsing('     mov #1,10(a0,d1,w) ; comment here').is({
				mnemonic: { start: 5, end: 8, value: 'mov' },
				operands: [
					{ start: 9, end: 11, value: '#1' },
					{ start: 12, end: 23, value: '10(a0,d1,w)' }
				],
				comment: { start: 24, end: 38, value: '; comment here' }
			}));

		it('parses an instruction line with no label and no leading whitespace', () =>
			parsing('mov a,b ; comment here').is({
				mnemonic: { start: 0, end: 3, value: 'mov' },
				operands: [
					{ start: 4, end: 5, value: 'a' },
					{ start: 6, end: 7, value: 'b' }
				],
				comment: { start: 8, end: 22, value: '; comment here' }
			}));

		it('parses a directive line with no label', () =>
			parsing('     !fill 10,0xfe ; comment here').is({
				mnemonic: { start: 5, end: 10, value: '!fill' },
				operands: [
					{ start: 11, end: 13, value: '10' },
					{ start: 14, end: 18, value: '0xfe' }
				],
				comment: { start: 19, end: 33, value: '; comment here' }
			}));

		it('parses a directive line with no label and no leading whitespace', () =>
			parsing('!fill 10,0xfe ; comment here').is({
				mnemonic: { start: 0, end: 5, value: '!fill' },
				operands: [
					{ start: 6, end: 8, value: '10' },
					{ start: 9, end: 13, value: '0xfe' }
				],
				comment: { start: 14, end: 28, value: '; comment here' }
			}));

		it('parses an instruction line with no operands', () =>
			parsing('     jmp ; comment here').is({
				mnemonic: { start: 5, end: 8, value: 'jmp' },
				comment: { start: 9, end: 23, value: '; comment here' }
			}));

		it('parses a directive line with no operands', () =>
			parsing('     !byte ; comment here').is({
				mnemonic: { start: 5, end: 10, value: '!byte' },
				comment: { start: 11, end: 25, value: '; comment here' }
			}));

		it('treats ! as the start of a directive', () =>
			parsing('!').is({ mnemonic: { start: 0, end: 1, value: '!' } }));

		it('treats ! following a label as the start of a directive', () =>
			parsing('test: !').is({
				label: { start: 0, end: 4, value: 'test' },
				mnemonic: { start: 6, end: 7, value: '!' }
			}));

		it('parses a comment by position', () =>
			parsing('label: mov #1,10(a0,d1.w) comment here').is({
				label: { start: 0, end: 5, value: 'label' },
				mnemonic: { start: 7, end: 10, value: 'mov' },
				operands: [
					{ start: 11, end: 13, value: '#1' },
					{ start: 14, end: 25, value: '10(a0,d1.w)' }
				],
				comment: { start: 26, end: 38, value: 'comment here' }
			}));

		it('parses a comment by position for instructions with no operands', () =>
			parsing(' rts comment here').is({
				mnemonic: { start: 1, end: 4, value: 'rts' },
				comment: { start: 5, end: 17, value: 'comment here' }
			}));

		it('directive expecting parameters takes first word of a comment by position', () =>
			parsing(' !word comment here').is({
				mnemonic: { start: 1, end: 6, value: '!word' },
				operands: [{ start: 7, end: 14, value: 'comment' }],
				comment: { start: 15, end: 19, value: 'here' }
			}));

		it('parses a comment by separator for directives expecting operands', () =>
			parsing(' !byte ; comment here').is({
				mnemonic: { start: 1, end: 6, value: '!byte' },
				comment: { start: 7, end: 21, value: '; comment here' }
			}));

		it('parses operands with space after comma', () =>
			parsing('label:    mov     #1, 10(a0,d1,w)    ; comment here').is({
				label: { start: 0, end: 5, value: 'label' },
				mnemonic: { start: 10, end: 13, value: 'mov' },
				operands: [
					{ start: 18, end: 20, value: '#1' },
					{ start: 22, end: 33, value: '10(a0,d1,w)' }
				],
				comment: { start: 37, end: 51, value: '; comment here' }
			}));

		it('parses an empty line', () => parsing('').is({}));

		it('parses a line with only whitespace', () => parsing('  ').is({}));

		it('parses an incomplete operand list', () =>
			parsing(' mov d0,').is({
				mnemonic: { start: 1, end: 4, value: 'mov' },
				operands: [
					{ start: 5, end: 7, value: 'd0' },
					{ start: 8, end: 8, value: '' }
				]
			}));

		it('parses an operand containing spaces in double quotes', () =>
			parsing(" !byte 'foo bar baz' ; comment").is({
				mnemonic: { start: 1, end: 6, value: '!byte' },
				operands: [{ start: 7, end: 20, value: "'foo bar baz'" }],
				comment: { end: 30, start: 21, value: '; comment' }
			}));

		it('parses an operand containing spaces with in single quotes', () =>
			parsing(" !word 'foo bar baz' ; comment").is({
				mnemonic: { start: 1, end: 6, value: '!word' },
				operands: [{ start: 7, end: 20, value: "'foo bar baz'" }],
				comment: { end: 30, start: 21, value: '; comment' }
			}));

		it('parses an operand containing spaces with unbalanced quotes', () =>
			parsing(" !byte 'foo bar baz").is({
				mnemonic: { start: 1, end: 6, value: '!byte' },
				operands: [{ start: 7, end: 19, value: "'foo bar baz" }]
			}));

		it('parses a label containing a numeric macro parameter (invalid rcasm)', () =>
			parsing('foo\\1bar: rts').is({
				label: { start: 0, end: 8, value: 'foo\\1bar' },
				mnemonic: { start: 10, end: 13, value: 'rts' }
			}));

		it('parses a label containing a special char macro parameter (invalid rcasm)', () =>
			parsing('foo\\@bar: rts').is({
				label: { start: 0, end: 8, value: 'foo\\@bar' },
				mnemonic: { start: 10, end: 13, value: 'rts' }
			}));

		it('parses a label containing a quoted macro parameter (invalid rcasm)', () =>
			parsing('foo\\<reptn>bar: rts').is({
				label: { start: 0, end: 14, value: 'foo\\<reptn>bar' },
				mnemonic: { start: 16, end: 19, value: 'rts' }
			}));

		it('parses a mnemonic containing a macro parameter (invalid rcasm)', () =>
			parsing(' b\\1 d0,d1').is({
				mnemonic: { start: 1, end: 4, value: 'b\\1' },
				operands: [
					{ start: 5, end: 7, value: 'd0' },
					{ start: 8, end: 10, value: 'd1' }
				]
			}));

		it('parses an operand containing a macro parameter (invalid rcasm)', () =>
			parsing(' mov \\1,d0').is({
				mnemonic: { start: 1, end: 4, value: 'mov' },
				operands: [
					{ start: 5, end: 7, value: '\\1' },
					{ start: 8, end: 10, value: 'd0' }
				]
			}));

		it('parses a quoted macro arguments (invalid rcasm)', () =>
			parsing("    FOO     <1,'foo'>,d2").is({
				mnemonic: { start: 4, end: 7, value: 'FOO' },
				operands: [
					{ start: 12, end: 21, value: "<1,'foo'>" },
					{ start: 22, end: 24, value: 'd2' }
				]
			}));

		it('parses a complex statement with parens', () =>
			parsing(' dc	ddfstop,(DIW_XSTRT-17+(DIW_W>>4-1)<<4)>>1&$fc-SCROLL*8').is({
				mnemonic: { end: 3, start: 1, value: 'dc' },
				operands: [
					{ end: 11, start: 4, value: 'ddfstop' },
					{
						start: 12,
						end: 58,
						value: '(DIW_XSTRT-17+(DIW_W>>4-1)<<4)>>1&$fc-SCROLL*8'
					}
				]
			}));
	});

	describe('#componentAtIndex()', () => {
		const line = parsing('label: mov   #1,10(a0,d1,w) ; comment here');

		it('identifies the label component', () =>
			line.atIndex(1).hasInfo({
				component: { start: 0, end: 5, value: 'label' },
				type: ComponentType.Label
			}));

		it('identifies the label component', () =>
			line.atIndex(8).hasInfo({
				component: { start: 7, end: 10, value: 'mov' },
				type: ComponentType.Mnemonic
			}));

		it('identifies the first operand component', () =>
			line.atIndex(14).hasInfo({
				component: { start: 13, end: 15, value: '#1' },
				type: ComponentType.Operand,
				index: 0
			}));

		it('identifies the first second component', () =>
			line.atIndex(17).hasInfo({
				component: { start: 16, end: 27, value: '10(a0,d1,w)' },
				type: ComponentType.Operand,
				index: 1
			}));

		it('identifies the comment component', () =>
			line.atIndex(28).hasInfo({
				component: { start: 28, end: 42, value: '; comment here' },
				type: ComponentType.Comment
			}));

		it('returns undefined for position outside components', () => line.atIndex(12).isUndefined());

		it('matches the first char of a component', () =>
			line.atIndex(7).hasInfo({
				component: { start: 7, end: 10, value: 'mov' },
				type: ComponentType.Mnemonic
			}));

		it('matches the last char of a component', () =>
			line.atIndex(10).hasInfo({
				component: { start: 7, end: 10, value: 'mov' },
				type: ComponentType.Mnemonic
			}));

		test('single ! identified as start of Mnemonic', () =>
			parsing('!')
				.atIndex(1)
				.hasInfo({
					component: { start: 0, end: 1, value: '!' },
					type: ComponentType.Mnemonic
				}));

		test('single ! after label identified as start of Mnemonic', () =>
			parsing('test: !')
				.atIndex(6)
				.hasInfo({
					component: { start: 6, end: 7, value: '!' },
					type: ComponentType.Mnemonic
				}));
	});

	describe('#parseSignature()', () => {
		it('parses a single operand', () =>
			parsingSignature('LSR[.(w)] <ea>').hasOperands([{ start: 10, end: 14, value: '<ea>' }]));

		it('parses multiple operands', () =>
			parsingSignature('MOVE[.(w)] <ea>,<ea>').hasOperands([
				{ start: 11, end: 15, value: '<ea>' },
				{ start: 16, end: 20, value: '<ea>' }
			]));

		it('parses optional operands', () =>
			parsingSignature('MOVE[.(w)] <ea>[,<ea>]').hasOperands([
				{ start: 11, end: 15, value: '<ea>' },
				{ start: 17, end: 21, value: '<ea>' }
			]));
	});
});
