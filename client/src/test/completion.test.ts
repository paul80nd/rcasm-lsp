import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should do completion', () => {
	const docUri = getDocUri('completion.rcasm');

	test('Completes mnemonics on an empty line', async () => {
		// Fixture is empty, so completion at the start offers the instruction set.
		await testCompletion(docUri, new vscode.Position(0, 0), [
			{ label: 'add', kind: vscode.CompletionItemKind.Method },
			{ label: 'ldi', kind: vscode.CompletionItemKind.Method }
		]);
	});
});

async function testCompletion(
	docUri: vscode.Uri,
	position: vscode.Position,
	expectedItems: { label: string; kind: vscode.CompletionItemKind }[]
) {
	await activate(docUri);

	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualCompletionList = (await vscode.commands.executeCommand(
		'vscode.executeCompletionItemProvider',
		docUri,
		position
	)) as vscode.CompletionList;

	// VS Code returns `label` as either a string or a CompletionItemLabel object.
	const labelOf = (item: vscode.CompletionItem) =>
		typeof item.label === 'string' ? item.label : item.label.label;

	expectedItems.forEach(expectedItem => {
		const actualItem = actualCompletionList.items.find(i => labelOf(i) === expectedItem.label);
		assert.ok(actualItem, `expected a completion labelled '${expectedItem.label}'`);
		assert.equal(actualItem.kind, expectedItem.kind);
	});
}
