import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should give hover', () => {
	const docUri = getDocUri('hover.rcasm');

	test('Describes a mnemonic under the cursor', async () => {
		// Fixture is `mov a,b`; hovering the `mov` mnemonic describes the instruction.
		await testHover(docUri, new vscode.Position(0, 1), /Register to Register Copy/);
	});

	test('Shows the signature of a called macro', async () =>
		await testHover(
			getDocUri('macros.rcasm'),
			new vscode.Position(10, 12),
			/!macro skip_if_zero\(val, n\)/
		));
});

async function testHover(docUri: vscode.Uri, position: vscode.Position, expected: RegExp) {
	await activate(docUri);

	const hovers = (await vscode.commands.executeCommand(
		'vscode.executeHoverProvider',
		docUri,
		position
	)) as vscode.Hover[];

	assert.ok(hovers.length > 0, 'expected at least one hover');

	// Hover contents are MarkdownString | MarkedString; flatten them to plain text.
	const text = hovers
		.flatMap(h =>
			h.contents.map(c => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
		)
		.join('\n');
	assert.ok(expected.test(text), `expected hover text to match ${expected}, got: ${text}`);
}
