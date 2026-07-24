import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should rename symbols', () => {
	const docUri = getDocUri('rename.rcasm');

	test('Prepares rename over the symbol range', async () => {
		// Fixture declares `!let foo = 123`; preparing a rename on the declaration
		// reports the `foo` identifier range.
		await activate(docUri);

		const result = (await vscode.commands.executeCommand(
			'vscode.prepareRename',
			docUri,
			new vscode.Position(0, 6)
		)) as vscode.Range | { range: vscode.Range; placeholder: string };

		const range = result instanceof vscode.Range ? result : result.range;
		assert.deepEqual(range, toRange(0, 5, 0, 8));
	});

	test('Renames the declaration and all usages', async () => {
		// `foo` is declared on line 0 and used on lines 1 and 2 (`ldi m,foo`, `ldi j,foo`).
		await activate(docUri);

		const edit = (await vscode.commands.executeCommand(
			'vscode.executeDocumentRenameProvider',
			docUri,
			new vscode.Position(0, 6),
			'example'
		)) as vscode.WorkspaceEdit;

		const edits = edit.get(docUri);
		assert.equal(edits.length, 3);
		edits.forEach(e => assert.equal(e.newText, 'example'));

		const key = (r: vscode.Range) =>
			`${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`;
		const actual = new Set(edits.map(e => key(e.range)));
		[toRange(0, 5, 0, 8), toRange(1, 6, 1, 9), toRange(2, 6, 2, 9)].forEach(r =>
			assert.ok(actual.has(key(r)), `expected an edit at ${key(r)}`)
		);
	});
});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	return new vscode.Range(new vscode.Position(sLine, sChar), new vscode.Position(eLine, eChar));
}
