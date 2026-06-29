import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should find references', () => {
	const docUri = getDocUri('references.rcasm');

	test('Lists the declaration and all usages of a variable', async () => {
		// Fixture declares `!let foo = 123` then uses `foo` on lines 1 and 2.
		// Querying from the declaration returns the declaration plus both usages.
		await testReferences(docUri, new vscode.Position(0, 6), [
			toRange(0, 5, 0, 8),
			toRange(1, 7, 1, 10),
			toRange(2, 7, 2, 10)
		]);
	});
});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	return new vscode.Range(new vscode.Position(sLine, sChar), new vscode.Position(eLine, eChar));
}

async function testReferences(docUri: vscode.Uri, position: vscode.Position, expectedRanges: vscode.Range[]) {
	await activate(docUri);

	const result = (await vscode.commands.executeCommand(
		'vscode.executeReferenceProvider',
		docUri,
		position
	)) as vscode.Location[];

	assert.equal(result.length, expectedRanges.length);

	// VS Code does not guarantee ordering, so compare as sets.
	const key = (r: vscode.Range) => `${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`;
	const actual = new Set(result.map(l => key(l.range)));
	expectedRanges.forEach(r => assert.ok(actual.has(key(r)), `expected a reference at ${key(r)}`));
	result.forEach(l => assert.equal(l.uri.toString(), docUri.toString()));
}
