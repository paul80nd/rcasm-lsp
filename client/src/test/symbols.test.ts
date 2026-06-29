import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should list document symbols', () => {
	const docUri = getDocUri('symbols.rcasm');

	test('Reports variables and labels', async () => {
		// Fixture is `!let foo = 1` / `bar: add`: a variable `foo` and a label `bar`.
		await testSymbols(docUri, [
			{ name: 'foo', kind: vscode.SymbolKind.Variable },
			{ name: 'bar', kind: vscode.SymbolKind.Field }
		]);
	});
});

async function testSymbols(
	docUri: vscode.Uri,
	expected: { name: string; kind: vscode.SymbolKind }[]
) {
	await activate(docUri);

	// Returns DocumentSymbol[] (hierarchical) for our provider.
	const result = (await vscode.commands.executeCommand(
		'vscode.executeDocumentSymbolProvider',
		docUri
	)) as vscode.DocumentSymbol[];

	expected.forEach(e => {
		const actual = result.find(s => s.name === e.name);
		assert.ok(actual, `expected a symbol named '${e.name}'`);
		assert.equal(actual.kind, e.kind, `expected '${e.name}' to be kind ${e.kind}`);
	});
}
