import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should provide folding ranges', () => {
	const docUri = getDocUri('folding.rcasm');

	test('Folds a scope block', async () => {
		// Fixture is `foo: {` / `add` / `}`: the scope folds from line 0 to line 2.
		await testFolding(docUri, [{ start: 0, end: 2 }]);
	});
});

async function testFolding(docUri: vscode.Uri, expected: { start: number; end: number }[]) {
	await activate(docUri);

	const result = (await vscode.commands.executeCommand(
		'vscode.executeFoldingRangeProvider',
		docUri
	)) as vscode.FoldingRange[];

	assert.equal(result.length, expected.length);
	const key = (start: number, end: number) => `${start}-${end}`;
	const actual = new Set(result.map(f => key(f.start, f.end)));
	expected.forEach(e => assert.ok(actual.has(key(e.start, e.end)), `expected a fold over ${key(e.start, e.end)}`));
}
