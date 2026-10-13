import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import DiagnosticProcessor from '../src/diagnostics';
import { createTestContext, range } from './helpers';

describe('DiagnosticProcessor', () => {
	const uri = 'file:///example.rcasm';
	const diagnosticsFor = (...code: string[]) =>
		new DiagnosticProcessor(createTestContext()).rcasmDiagnostics(
			TextDocument.create(uri, 'rcasm', 0, code.join('\n'))
		);
	const at = (r: lsp.Range) => ({ uri, range: r });

	it('reports an error at its location', () =>
		expect(diagnosticsFor('ldi a,300')).toEqual([
			{
				severity: lsp.DiagnosticSeverity.Error,
				range: range(0, 6, 0, 9),
				message: 'Literal out of range (must be between -16 and 15)',
				source: 'rcasm'
			}
		]));

	it('reports nothing for valid macro definitions and calls', () =>
		expect(
			diagnosticsFor(
				'!macro skip_if_zero(val, n) {',
				'        ldi b,val',
				'        bne _skip',
				'        !byte n, n+1',
				'_skip:  ldi m,_skip',
				'}',
				'!macro twice(v) {',
				'        +skip_if_zero(v, v*2)',
				'        +skip_if_zero(v+1, 0x10)',
				'}',
				'        +skip_if_zero(3, 7)',
				'        +twice(5)',
				'first:  +skip_if_zero(-2, 0)',
				'        ldi m,first::_skip',
				'',
				'!macro copy(dst, src) {',
				'        mov dst,src',
				'}',
				'        +copy(xy, m)            ; register arguments, 16-bit form'
			)
		).toEqual([]));

	it('reports an unused macro as a warning on its name', () =>
		expect(diagnosticsFor('!macro unused() { add }')).toEqual([
			expect.objectContaining({
				severity: lsp.DiagnosticSeverity.Warning,
				range: range(0, 7, 0, 13),
				message: "Macro 'unused' is never used"
			})
		]));

	it('underlines the outermost call site for an error inside an expansion', () =>
		expect(
			diagnosticsFor(
				'!macro inner(v) {',
				'        bogus',
				'}',
				'!macro outer(v) {',
				'        +inner(v)',
				'}',
				'        +outer(1)',
				'        +outer(2)',
				'        +inner(3)'
			)
		).toEqual([
			{
				severity: lsp.DiagnosticSeverity.Error,
				range: range(6, 8, 6, 17),
				message: "In macro 'outer': Unknown mnemonic 'bogus'",
				source: 'rcasm',
				relatedInformation: [
					{ location: at(range(1, 8, 1, 13)), message: "Unknown mnemonic 'bogus'" },
					{ location: at(range(4, 8, 4, 17)), message: "In expansion of macro 'inner'" }
				]
			},
			// The body line is reported once, linked to every call site that expands it
			{
				severity: lsp.DiagnosticSeverity.Error,
				range: range(1, 8, 1, 13),
				message: "Unknown mnemonic 'bogus'",
				source: 'rcasm',
				relatedInformation: [
					{ location: at(range(6, 8, 6, 17)), message: "In expansion of macro 'outer'" },
					{ location: at(range(7, 8, 7, 17)), message: "In expansion of macro 'outer'" },
					{ location: at(range(8, 8, 8, 17)), message: "In expansion of macro 'inner'" }
				]
			},
			{
				severity: lsp.DiagnosticSeverity.Error,
				range: range(7, 8, 7, 17),
				message: "In macro 'outer': Unknown mnemonic 'bogus'",
				source: 'rcasm',
				relatedInformation: [
					{ location: at(range(1, 8, 1, 13)), message: "Unknown mnemonic 'bogus'" },
					{ location: at(range(4, 8, 4, 17)), message: "In expansion of macro 'inner'" }
				]
			},
			{
				severity: lsp.DiagnosticSeverity.Error,
				range: range(8, 8, 8, 17),
				message: "In macro 'inner': Unknown mnemonic 'bogus'",
				source: 'rcasm',
				relatedInformation: [
					{ location: at(range(1, 8, 1, 13)), message: "Unknown mnemonic 'bogus'" }
				]
			}
		]));

	it('reports a macro called before its definition at the call name', () =>
		expect(diagnosticsFor('        +m()', '!macro m() { add }')).toEqual([
			expect.objectContaining({
				range: range(0, 9, 0, 10),
				message: "Undefined macro 'm' (macros must be defined before use)"
			})
		]));
});
