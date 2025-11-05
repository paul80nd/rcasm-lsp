import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Provider } from '.';
// import { nodeAsRange, positionToPoint } from "../geometry";
// import { resolveInclude } from "../files";
import { /* DefinitionType,*/ DefinitionType, getDefinitions /*, processPath */ } from '../symbols';
import { mnemonicDocs, registerDocs } from '../docs/index';
// import { RegisterName, Size } from "../syntax";
import { Context } from '../context';
import * as nodes from '../parser/nodes';
import {
	formatDeclaration,
	formatMnemonicDoc,
	formatRegisterDoc,
	formatNumeric
} from '../formatting';
import { MarkupContent } from 'vscode-languageserver';
import { RegisterName } from '../syntax';

export default class HoverProvider implements Provider {
	constructor(protected readonly ctx: Context) {}

	async onHover({ textDocument, position }: lsp.HoverParams): Promise<lsp.Hover | undefined> {
		const processed = this.ctx.store.get(textDocument.uri);
		if (!processed) {
			return;
		}

		const offset = processed.document.offsetAt(position);
		const nodepath = nodes.getNodePath(processed.tree, offset);
		if (!nodepath || nodepath.length == 0) {
			return;
		}

		const getRange = (node: nodes.INode): lsp.Range =>
			lsp.Range.create(
				processed.document.positionAt(node.offset),
				processed.document.positionAt(node.end)
			);

		// Walk node path from bottom to top (most specific to general)
		for (let i = nodepath.length - 1; i >= 0; i--) {
			const node = nodepath[i];

			switch (node.type) {
				case 'Instruction':
					return node.value ? this.hoverInstructionMnemonic(node.value.toString(), getRange(node)) : undefined;
				case 'Directive':
					return node.value ? this.hoverDirectiveMnemonic(node.value.toString(), getRange(node)) : undefined;
				case 'SetPC':
					return this.hoverSetPC(getRange(node));
				case 'SQRef':
					return this.hoverSymbol(processed.document, position, getRange(node));
				case 'Literal':
					return node.value ? this.hoverNumber(node.value, getRange(node)) : undefined;
				case 'Register':
					return node.value ? this.hoverRegister(node.value.toString(), getRange(node)) : undefined;
			}
		}
		return;
	}

	register(connection: lsp.Connection) {
		connection.onHover(this.onHover.bind(this));
		return {
			hoverProvider: true
		};
	}

	private hoverInstructionMnemonic(mnemonic: string, range: lsp.Range) {
		const docs = lookupMnemonicDoc(mnemonic);
		return {
			range,
			contents: docs || {
				kind: lsp.MarkupKind.PlainText,
				value: '(instruction) ' + mnemonic
			}
		};
	}

	private hoverDirectiveMnemonic(mnemonic: string, range: lsp.Range) {
		const docs = lookupMnemonicDoc(mnemonic);
		return {
			range,
			contents: docs || {
				kind: lsp.MarkupKind.PlainText,
				value: '(directive) ' + mnemonic
			}
		};
	}

	private hoverSetPC(range: lsp.Range) {
		const docs = lookupMnemonicDoc('org');
		return {
			range,
			contents: docs || {
				kind: lsp.MarkupKind.PlainText,
				value: '(set program counter)'
			}
		};
	}

	private async hoverSymbol(document: TextDocument, position: lsp.Position, range: lsp.Range) {
		const [def] = await getDefinitions(document.uri, position, this.ctx);
		let content = '';

		if (def) {
			switch (def.type) {
				case DefinitionType.Variable: {
					// Find Declaration and add code block
					const startLine = def.location.range.start.line;
					const defDoc = this.ctx.store.get(def.location.uri)?.document;
					if (defDoc) {
						const definitionLine = defDoc.getText(
							lsp.Range.create(
								lsp.Position.create(startLine, 0),
								lsp.Position.create(startLine, Number.MAX_VALUE)
							)
						);
						content = '```rcasm\n' + formatDeclaration(definitionLine) + '\n```';
					}
					break;
				}
				default:
					content = `(${def.type}) ${def.name}`;
			}
		}

		return {
			range,
			contents: {
				kind: lsp.MarkupKind.Markdown,
				value: content
			}
		};
	}

	private async hoverNumber(value: string | number, range: lsp.Range) {
		return {
			range,
			contents: {
				kind: lsp.MarkupKind.Markdown,
				value: typeof value === 'number' ? formatNumeric(value) : value
			}
		};
	}

	private async hoverRegister(value: string, range: lsp.Range) {
		const docs = lookupRegisterDoc(value);
		return {
			range,
			contents: docs || {
				kind: lsp.MarkupKind.PlainText,
				value: '(register) ' + value
			}
		};
	}
}

function lookupMnemonicDoc(mnemonic: string): MarkupContent | undefined {
	mnemonic = mnemonic.toLowerCase();
	if (mnemonicDocs[mnemonic]) {
		return formatMnemonicDoc(mnemonicDocs[mnemonic]);
	}
	return;
}

function lookupRegisterDoc(reg: string): MarkupContent | undefined {
	const register = reg.toLowerCase() as RegisterName;
	if (registerDocs[register]) {
		return formatRegisterDoc(registerDocs[register]);
	}
	return;
}
