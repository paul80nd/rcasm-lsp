import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should highlight occurrences', () => {
	const docUri = getDocUri('highlights.rcasm');

	test('Highlights the usage (read) and declaration (write) of a variable', async () => {
		// Fixture is `!let foo = 123` / `ldi m,foo`; from the usage we get a Read on the
		// usage and a Write on the declaration.
		await testHighlights(docUri, new vscode.Position(1, 8), [
			{ range: toRange(1, 6, 1, 9), kind: vscode.DocumentHighlightKind.Read },
			{ range: toRange(0, 5, 0, 8), kind: vscode.DocumentHighlightKind.Write }
		]);
	});
});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	return new vscode.Range(new vscode.Position(sLine, sChar), new vscode.Position(eLine, eChar));
}

async function testHighlights(
	docUri: vscode.Uri,
	position: vscode.Position,
	expected: { range: vscode.Range; kind: vscode.DocumentHighlightKind }[]
) {
	await activate(docUri);

	const result = (await vscode.commands.executeCommand(
		'vscode.executeDocumentHighlights',
		docUri,
		position
	)) as vscode.DocumentHighlight[];

	assert.equal(result.length, expected.length);

	const key = (r: vscode.Range, k: vscode.DocumentHighlightKind | undefined) =>
		`${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}/${k}`;
	const actual = new Set(result.map(h => key(h.range, h.kind)));
	expected.forEach(e => assert.ok(actual.has(key(e.range, e.kind)), `expected a highlight at ${key(e.range, e.kind)}`));
}
