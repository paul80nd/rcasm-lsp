import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should go to definition', () => {
	const docUri = getDocUri('definition.rcasm');

	test('Resolves a label reference to its declaration', async () => {
		// Fixture is `test: add` / `jmp test`; the `test` ref on line 1 resolves to the
		// label declaration on line 0.
		await testDefinition(docUri, new vscode.Position(1, 6), toRange(0, 0, 0, 4));
	});
});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	return new vscode.Range(new vscode.Position(sLine, sChar), new vscode.Position(eLine, eChar));
}

async function testDefinition(
	docUri: vscode.Uri,
	position: vscode.Position,
	expectedRange: vscode.Range
) {
	await activate(docUri);

	const result = (await vscode.commands.executeCommand(
		'vscode.executeDefinitionProvider',
		docUri,
		position
	)) as (vscode.Location | vscode.LocationLink)[];

	assert.equal(result.length, 1);
	const loc = result[0];
	const uri = loc instanceof vscode.Location ? loc.uri : loc.targetUri;
	const range = loc instanceof vscode.Location ? loc.range : loc.targetRange;
	assert.equal(uri.toString(), docUri.toString());
	assert.deepEqual(range, expectedRange);
}
