import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should get diagnostics', () => {
	const docUri = getDocUri('diagnostics.rcasm');

	test('Reports an out-of-range literal', async () => {
		// Fixture is `ldi a,300` — 300 exceeds the 4-bit immediate range.
		await testDiagnostics(docUri, [
			{
				message: 'Literal out of range (must be between -16 and 15)',
				range: toRange(0, 6, 0, 9),
				severity: vscode.DiagnosticSeverity.Error,
				source: 'rcasm'
			}
		]);
	});

	test('Underlines the call site of an error inside a macro expansion', async () => {
		// Fixture defines `m` with a bad mnemonic in its body, then calls it on line 3.
		const uri = getDocUri('macro-diagnostics.rcasm');
		await activate(uri);
		const diagnostics = vscode.languages.getDiagnostics(uri);
		assert.equal(diagnostics.length, 2);

		const call = diagnostics.find(d => d.range.start.line === 3);
		assert.ok(call, 'expected a diagnostic at the call site');
		assert.equal(call.message, "In macro 'm': Unknown mnemonic 'bogus'");
		assert.deepEqual(call.range, toRange(3, 8, 3, 13));
		assert.deepEqual(call.relatedInformation?.[0].location.range, toRange(1, 8, 1, 13));

		const body = diagnostics.find(d => d.range.start.line === 1);
		assert.ok(body, 'expected a diagnostic at the body line');
		assert.equal(body.message, "Unknown mnemonic 'bogus'");
		assert.deepEqual(body.relatedInformation?.[0].location.range, toRange(3, 8, 3, 13));
	});
});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	const start = new vscode.Position(sLine, sChar);
	const end = new vscode.Position(eLine, eChar);
	return new vscode.Range(start, end);
}

async function testDiagnostics(docUri: vscode.Uri, expectedDiagnostics: vscode.Diagnostic[]) {
	await activate(docUri);

	const actualDiagnostics = vscode.languages.getDiagnostics(docUri);

	assert.equal(actualDiagnostics.length, expectedDiagnostics.length);

	expectedDiagnostics.forEach((expectedDiagnostic, i) => {
		const actualDiagnostic = actualDiagnostics[i];
		assert.equal(actualDiagnostic.message, expectedDiagnostic.message);
		assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
		assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity);
		assert.equal(actualDiagnostic.source, expectedDiagnostic.source);
	});
}
