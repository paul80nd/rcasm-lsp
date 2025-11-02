import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Provider } from '.';
// import { nodeAsRange, positionToPoint } from "../geometry";
// import { resolveInclude } from "../files";
import { /* DefinitionType,*/ getDefinitions /*, processPath */ } from '../symbols';
import { mnemonicDocs, registerDocs } from '../docs/index';
// import { RegisterName, Size } from "../syntax";
import { Context } from '../context';
import * as nodes from '../parser/nodes';
import {
	//   formatDeclaration,
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

		const getRange = (node: nodes.Node): lsp.Range =>
			lsp.Range.create(
				processed.document.positionAt(node.offset),
				processed.document.positionAt(node.end)
			);

		// Walk node path from bottom to top (most specific to general)
		for (let i = nodepath.length - 1; i >= 0; i--) {
			const node = nodepath[i];

			switch (node.type) {
				case nodes.NodeType.Instruction:
					return this.hoverInstructionMnemonic(node as nodes.Instruction, getRange(node));
				case nodes.NodeType.Directive:
					return this.hoverDirectiveMnemonic(node as nodes.Directive, getRange(node));
				case nodes.NodeType.SetPC:
					return this.hoverSetPC(node as nodes.SetPC, getRange(node));
				case nodes.NodeType.LabelRef:
					return this.hoverSymbol(processed.document, position, getRange(node));
				case nodes.NodeType.Literal:
					return this.hoverNumber(node as nodes.Literal, getRange(node));
				case nodes.NodeType.Register:
					return this.hoverRegister(node as nodes.Register, getRange(node));
			}
		}
	}

	register(connection: lsp.Connection) {
		connection.onHover(this.onHover.bind(this));
		return {
			hoverProvider: true
		};
	}

	private hoverInstructionMnemonic(node: nodes.Instruction, range: lsp.Range) {
		const docs = lookupMnemonicDoc(node.mnemonic);
		return {
			range,
			contents: docs || {
				kind: lsp.MarkupKind.PlainText,
				value: '(instruction) ' + node.mnemonic
			}
		};
	}

	private hoverDirectiveMnemonic(node: nodes.Directive, range: lsp.Range) {
		const docs = lookupMnemonicDoc(node.mnemonic);
		return {
			range,
			contents: docs || {
				kind: lsp.MarkupKind.PlainText,
				value: '(directive) ' + node.mnemonic
			}
		};
	}

	private hoverSetPC(node: nodes.SetPC, range: lsp.Range) {
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
			//       if (def.comment) {
			//         contents.push(def.comment); // TODO
			//       }

			switch (def.type) {
				//         case DefinitionType.Register:
				//         case DefinitionType.RegisterList:
				//         case DefinitionType.Constant:
				//         case DefinitionType.Variable: {
				//           // Find Declaration and add code block
				//           const startLine = def.location.range.start.line;
				//           const defDoc = this.ctx.store.get(def.location.uri)?.document;
				//           if (defDoc) {
				//             const lines = defDoc.getText().split(/\r?\n/g);
				//             const definitionLine = lines[startLine];
				//             contents.push({
				//               language: document.languageId,
				//               value: formatDeclaration(definitionLine),
				//             });
				//           }
				//           break;
				//         }
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

	private async hoverNumber(node: nodes.Literal, range: lsp.Range) {
		return {
			range,
			contents: {
				kind: lsp.MarkupKind.Markdown,
				value: typeof node.value === 'number' ? formatNumeric(node.value) : node.value
			}
		};
	}

	private async hoverRegister(node: nodes.Register, range: lsp.Range) {
		const docs = lookupRegisterDoc(node.value);
		return {
			range,
			contents: docs || {
				kind: lsp.MarkupKind.PlainText,
				value: '(register) ' + node.value
			}
		};
	}
}

function lookupMnemonicDoc(mnemonic: string): MarkupContent | undefined {
	mnemonic = mnemonic.toLowerCase();
	if (mnemonicDocs[mnemonic]) {
		return formatMnemonicDoc(mnemonicDocs[mnemonic]);
	}
}

function lookupRegisterDoc(reg: string): MarkupContent | undefined {
	const register = reg.toLowerCase() as RegisterName;
	if (registerDocs[register]) {
		return formatRegisterDoc(registerDocs[register]);
	}
}
