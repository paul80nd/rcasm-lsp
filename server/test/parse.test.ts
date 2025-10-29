import {
	parseLine,
	componentAtIndex,
	ComponentType,
	parseSignature,
} from "../src/parse";

describe("parse", () => {
	describe("#parseLine()", () => {
		it("parses a complete instruction line", () => {
			const line = parseLine(
				"label:    mov     #1,10(a0,d1,w)    ; comment here"
			);
			expect(line).toEqual({
				label: { start: 0, end: 5, value: "label" },
				mnemonic: { start: 10, end: 13, value: "mov" },
				operands: [
					{ start: 18, end: 20, value: "#1" },
					{ start: 21, end: 32, value: "10(a0,d1,w)" },
				],
				comment: { start: 36, end: 50, value: "; comment here" },
			});
		});

		it("parses a complete directive line", () => {
			const line = parseLine(
				"label:    !byte     10, 0xfe, 01010101b    ; comment here"
			);
			expect(line).toEqual({
				label: { start: 0, end: 5, value: "label" },
				mnemonic: { start: 10, end: 15, value: "!byte" },
				operands: [
					{ start: 20, end: 22, value: "10" },
					{ start: 24, end: 28, value: "0xfe" },
					{ start: 30, end: 39, value: "01010101b" },
				],
				comment: { start: 43, end: 57, value: "; comment here" },
			});
		});

		it("parses a condensed instruction line", () => {
			const line = parseLine("label: mov #1,10(a0,d1,w) ; comment here");
			expect(line).toEqual({
				label: { start: 0, end: 5, value: "label" },
				mnemonic: { start: 7, end: 10, value: "mov" },
				operands: [
					{ start: 11, end: 13, value: "#1" },
					{ start: 14, end: 25, value: "10(a0,d1,w)" },
				],
				comment: { start: 26, end: 40, value: "; comment here" },
			});
		});

		it("parses a condensed directive line", () => {
			const line = parseLine("label: !word 0xfedc  ; comment here");
			expect(line).toEqual({
				label: { start: 0, end: 5, value: "label" },
				mnemonic: { start: 7, end: 12, value: "!word" },
				operands: [
					{ start: 13, end: 19, value: "0xfedc" }
				],
				comment: { start: 21, end: 35, value: "; comment here" },
			});
		});

		it("parses a line with only a label", () => {
			const line = parseLine("label:");
			expect(line).toEqual({
				label: { start: 0, end: 5, value: "label" },
			});
		});

		it("parses a prefixed label", () => {
			const line = parseLine("_label:");
			expect(line).toEqual({
				label: { start: 0, end: 6, value: "_label" },
			});
		});

		it("parses a label with leading whitespace", () => {
			const line = parseLine("   label:");
			expect(line).toEqual({
				label: { start: 3, end: 8, value: "label" },
			});
		});

		it("parses a label and mnemonic with no whitespace", () => {
			const line = parseLine("label:rts");
			expect(line).toEqual({
				label: { start: 0, end: 5, value: "label" },
				mnemonic: { start: 6, end: 9, value: "rts" },
			});
		});

		it("parses a label and directive with no whitespace", () => {
			const line = parseLine("label:!word");
			expect(line).toEqual({
				label: { start: 0, end: 5, value: "label" },
				mnemonic: { start: 6, end: 11, value: "!word" },
			});
		});

		it("parses an instruction line with no label", () => {
			const line = parseLine("     mov #1,10(a0,d1,w) ; comment here");
			expect(line).toEqual({
				mnemonic: { start: 5, end: 8, value: "mov" },
				operands: [
					{ start: 9, end: 11, value: "#1" },
					{ start: 12, end: 23, value: "10(a0,d1,w)" },
				],
				comment: { start: 24, end: 38, value: "; comment here" },
			});
		});

		it("parses an instruction line with no label and no leading whitespace", () => {
			const line = parseLine("mov a,b ; comment here");
			expect(line).toEqual({
				mnemonic: { start: 0, end: 3, value: "mov" },
				operands: [
					{ start: 4, end: 5, value: "a" },
					{ start: 6, end: 7, value: "b" },
				],
				comment: { start: 8, end: 22, value: "; comment here" },
			});
		});

		it("parses a directive line with no label", () => {
			const line = parseLine("     !fill 10,0xfe ; comment here");
			expect(line).toEqual({
				mnemonic: { start: 5, end: 10, value: "!fill" },
				operands: [
					{ start: 11, end: 13, value: "10" },
					{ start: 14, end: 18, value: "0xfe" },
				],
				comment: { start: 19, end: 33, value: "; comment here" },
			});
		});

		it("parses a directive line with no label and no leading whitespace", () => {
			const line = parseLine("!fill 10,0xfe ; comment here");
			expect(line).toEqual({
				mnemonic: { start: 0, end: 5, value: "!fill" },
				operands: [
					{ start: 6, end: 8, value: "10" },
					{ start: 9, end: 13, value: "0xfe" },
				],
				comment: { start: 14, end: 28, value: "; comment here" },
			});
		});

		it("parses an instruction line with no operands", () => {
			const line = parseLine("     jmp ; comment here");
			expect(line).toEqual({
				mnemonic: { start: 5, end: 8, value: "jmp" },
				comment: { start: 9, end: 23, value: "; comment here" },
			});
		});

		it("parses a directive line with no operands", () => {
			const line = parseLine("     !byte ; comment here");
			expect(line).toEqual({
				mnemonic: { start: 5, end: 10, value: "!byte" },
				comment: { start: 11, end: 25, value: "; comment here" },
			});
		});

		it("parses a comment by position", () => {
			const line = parseLine("label: mov #1,10(a0,d1.w) comment here");
			expect(line).toEqual({
				label: { start: 0, end: 5, value: "label" },
				mnemonic: { start: 7, end: 10, value: "mov" },
				operands: [
					{ start: 11, end: 13, value: "#1" },
					{ start: 14, end: 25, value: "10(a0,d1.w)" },
				],
				comment: { start: 26, end: 38, value: "comment here" },
			});
		});

		it("parses a comment by position for instructions with no operands", () => {
			const line = parseLine(" rts comment here");
			expect(line).toEqual({
				mnemonic: { start: 1, end: 4, value: "rts" },
				comment: { start: 5, end: 17, value: "comment here" },
			});
		});

		it("directive expecting parameters takes first word of a comment by position", () => {
			const line = parseLine(" !word comment here");
			expect(line).toEqual({
				mnemonic: { start: 1, end: 6, value: "!word" },
				operands: [
					{ start: 7, end: 14, value: "comment" }
				],
				comment: { start: 15, end: 19, value: "here" },
			});
		});

		it("parses a comment by separator for directives expecting operands", () => {
			const line = parseLine(" !byte ; comment here");
			expect(line).toEqual({
				mnemonic: { start: 1, end: 6, value: "!byte" },
				comment: { start: 7, end: 21, value: "; comment here" },
			});
		});

		it("parses operands with space after comma", () => {
			const line = parseLine(
				"label:    mov     #1, 10(a0,d1,w)    ; comment here"
			);
			expect(line).toEqual({
				label: { start: 0, end: 5, value: "label" },
				mnemonic: { start: 10, end: 13, value: "mov" },
				operands: [
					{ start: 18, end: 20, value: "#1" },
					{ start: 22, end: 33, value: "10(a0,d1,w)" },
				],
				comment: { start: 37, end: 51, value: "; comment here" },
			});
		});

		it("parses an empty line", () => {
			const line = parseLine("");
			expect(line).toEqual({});
		});

		it("parses a line with only whitespace", () => {
			const line = parseLine("  ");
			expect(line).toEqual({});
		});

		it("parses an incomplete operand list", () => {
			const line = parseLine(" mov d0,");
			expect(line).toEqual({
				mnemonic: { start: 1, end: 4, value: "mov" },
				operands: [
					{ start: 5, end: 7, value: "d0" },
					{ start: 8, end: 8, value: "" },
				],
			});
		});

		it("parses an operand containing spaces in double quotes", () => {
			const line = parseLine(' !byte "foo bar baz" ; comment');
			expect(line).toEqual({
				mnemonic: { start: 1, end: 6, value: "!byte" },
				operands: [{ start: 7, end: 20, value: '"foo bar baz"' }],
				comment: { end: 30, start: 21, value: "; comment", },
			});
		});

		it("parses an operand containing spaces with in single quotes", () => {
			const line = parseLine(" !word 'foo bar baz' ; comment");
			expect(line).toEqual({
				mnemonic: { start: 1, end: 6, value: "!word" },
				operands: [{ start: 7, end: 20, value: "'foo bar baz'" }],
				comment: { end: 30, start: 21, value: "; comment", },
			});
		});

		it("parses an operand containing spaces with unbalanced quotes", () => {
			const line = parseLine(" !byte 'foo bar baz");
			expect(line).toEqual({
				mnemonic: { start: 1, end: 6, value: "!byte" },
				operands: [{ start: 7, end: 19, value: "'foo bar baz" }],
			});
		});

		it("parses a label containing a numeric macro parameter (invalid rcasm)", () => {
			const line = parseLine("foo\\1bar: rts");
			expect(line).toEqual({
				label: { start: 0, end: 8, value: "foo\\1bar" },
				mnemonic: { start: 10, end: 13, value: "rts" },
			});
		});

		it("parses a label containing a special char macro parameter (invalid rcasm)", () => {
			const line = parseLine("foo\\@bar: rts");
			expect(line).toEqual({
				label: { start: 0, end: 8, value: "foo\\@bar" },
				mnemonic: { start: 10, end: 13, value: "rts" },
			});
		});

		it("parses a label containing a quoted macro parameter (invalid rcasm)", () => {
			const line = parseLine("foo\\<reptn>bar: rts");
			expect(line).toEqual({
				label: { start: 0, end: 14, value: "foo\\<reptn>bar" },
				mnemonic: { start: 16, end: 19, value: "rts" },
			});
		});

		it("parses a mnemonic containing a macro parameter (invalid rcasm)", () => {
			const line = parseLine(" b\\1 d0,d1");
			expect(line).toEqual({
				mnemonic: { start: 1, end: 4, value: "b\\1" },
				operands: [
					{ start: 5, end: 7, value: "d0" },
					{ start: 8, end: 10, value: "d1" },
				],
			});
		});

		it("parses an operand containing a macro parameter (invalid rcasm)", () => {
			const line = parseLine(" mov \\1,d0");
			expect(line).toEqual({
				mnemonic: { start: 1, end: 4, value: "mov" },
				operands: [
					{ start: 5, end: 7, value: "\\1" },
					{ start: 8, end: 10, value: "d0" },
				],
			});
		});

		it("parses a quoted macro arguments (invalid rcasm)", () => {
			const line = parseLine('    FOO     <1,"foo">,d2');
			expect(line).toEqual({
				mnemonic: { start: 4, end: 7, value: "FOO" },
				operands: [
					{ start: 12, end: 21, value: '<1,"foo">' },
					{ start: 22, end: 24, value: "d2" },
				],
			});
		});

		it("parses a complex statement with parens", () => {
			const line = parseLine(
				" dc	ddfstop,(DIW_XSTRT-17+(DIW_W>>4-1)<<4)>>1&$fc-SCROLL*8"
			);
			expect(line).toEqual({
				mnemonic: { end: 3, start: 1, value: "dc", },
				operands: [
					{ end: 11, start: 4, value: "ddfstop", },
					{
						start: 12, end: 58,
						value: "(DIW_XSTRT-17+(DIW_W>>4-1)<<4)>>1&$fc-SCROLL*8",
					},
				]
			});
		});
	});

	describe("#componentAtIndex()", () => {
		const line = parseLine("label: mov   #1,10(a0,d1,w) ; comment here");

		it("identifies the label component", () => {
			const info = componentAtIndex(line, 1);
			expect(info).toEqual({
				component: { start: 0, end: 5, value: "label" },
				type: ComponentType.Label,
			});
		});

		it("identifies the label component", () => {
			const info = componentAtIndex(line, 8);
			expect(info).toEqual({
				component: { start: 7, end: 10, value: "mov" },
				type: ComponentType.Mnemonic,
			});
		});

		it("identifies the first operand component", () => {
			const info = componentAtIndex(line, 14);
			expect(info).toEqual({
				component: { start: 13, end: 15, value: "#1" },
				type: ComponentType.Operand,
				index: 0,
			});
		});

		it("identifies the first second component", () => {
			const info = componentAtIndex(line, 17);
			expect(info).toEqual({
				component: { start: 16, end: 27, value: "10(a0,d1,w)" },
				type: ComponentType.Operand,
				index: 1,
			});
		});

		it("identifies the comment component", () => {
			const info = componentAtIndex(line, 28);
			expect(info).toEqual({
				component: { start: 28, end: 42, value: "; comment here" },
				type: ComponentType.Comment,
			});
		});

		it("returns undefined for position outside components", () => {
			const info = componentAtIndex(line, 12);
			expect(info).toBeUndefined();
		});

		it("matches the first char of a component", () => {
			const info = componentAtIndex(line, 7);
			expect(info).toEqual({
				component: { start: 7, end: 10, value: "mov" },
				type: ComponentType.Mnemonic,
			});
		});

		it("matches the last char of a component", () => {
			const info = componentAtIndex(line, 10);
			expect(info).toEqual({
				component: { start: 7, end: 10, value: "mov" },
				type: ComponentType.Mnemonic,
			});
		});
	});

	describe("#parseSignature()", () => {
		it("parses a single operand", () => {
			const { operands } = parseSignature("LSR[.(w)] <ea>");
			expect(operands).toEqual([{ start: 10, end: 14, value: "<ea>" }]);
		});

		it("parses multiple operands", () => {
			const { operands } = parseSignature("MOVE[.(w)] <ea>,<ea>");
			expect(operands).toEqual([
				{ start: 11, end: 15, value: "<ea>" },
				{ start: 16, end: 20, value: "<ea>" },
			]);
		});

		it("parses optional operands", () => {
			const { operands } = parseSignature("MOVE[.(w)] <ea>[,<ea>]");
			expect(operands).toEqual([
				{ start: 11, end: 15, value: "<ea>" },
				{ start: 17, end: 21, value: "<ea>" },
			]);
		});
	});
});