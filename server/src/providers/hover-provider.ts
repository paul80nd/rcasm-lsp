import * as lsp from 'vscode-languageserver';
// import { TextDocument } from "vscode-languageserver-textdocument";
import { Provider } from '.';
// import { nodeAsRange, positionToPoint } from "../geometry";
// import { resolveInclude } from "../files";
// import { DefinitionType, getDefinitions, processPath } from "../symbols";
import { mnemonicDocs /*, registerDocs, sizeDocs*/ } from '../docs/index';
// import { RegisterName, Size } from "../syntax";
import { Context } from '../context';
import * as nodes from '../parser/nodes';
import {
	//   formatDeclaration,
	formatMnemonicDoc
	//   formatNumeric,
} from '../formatting';
import { MarkupContent } from 'vscode-languageserver';

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
				//       case "symbol":
				//         return this.hoverSymbol(node, processed.document, position);
				//       case "path":
				//         return this.hoverPath(node, textDocument.uri);
				//       case "string_literal":
				//         if (node.parent?.type === "path") {
				//           return this.hoverPath(node.parent, textDocument.uri);
				//         }
				//         break;
				//       case "decimal_literal":
				//       case "hexadecimal_literal":
				//       case "octal_literal":
				//       case "binary_literal":
				//         return this.hoverNumber(node);
				//       case "named_register":
				//         return this.hoverRegister(node);
			}
		}
	}

	// if (node instanceof nodes.SetPC) {
	// 			const entry = this.rcasmDataManager.getMnemonic('org');
	// 			if (entry) {
	// 				const paramNames = [node.pcExpr.getText()];
	// 				const contents = languageFacts.getEntrySpecificDescription(entry, paramNames, this.doesSupportMarkdown());
	// 				if (contents) {
	// 					hover = { contents, range: getRange(node) };
	// 				} else {
	// 					hover = null;
	// 				}
	// 			}
	// 			break;
	// 		}

	// 		if (node instanceof nodes.ForDirective || node instanceof nodes.IfDirective || node instanceof nodes.LetDirective || node instanceof nodes.ErrorDirective) {
	// 			// Only respond if on first line of node (node includes the for directive and the body)
	// 			const range = getRange(node);
	// 			if (position.line !== range.start.line) {
	// 				continue;
	// 			}

	// 			const dtype = node.getText().slice(0, 4).toLowerCase().trim();
	// 			const entry = this.rcasmDataManager.getDirective(dtype);
	// 			if (entry) {
	// 				const contents = languageFacts.getEntryDescription(entry, this.doesSupportMarkdown());
	// 				if (contents) {
	// 					hover = { contents, range: getRange(node), };
	// 				} else {
	// 					hover = null;
	// 				}
	// 			}
	// 			break;
	// 		}

	// 		if (node instanceof nodes.DataDirective || node instanceof nodes.FillDirective) {
	// 			const dtype = node.getText().slice(0, 5).toLowerCase();
	// 			const entry = this.rcasmDataManager.getDirective(dtype);
	// 			if (entry) {
	// 				const contents = languageFacts.getEntryDescription(entry, this.doesSupportMarkdown());
	// 				if (contents) {
	// 					hover = { contents, range: getRange(node), };
	// 				} else {
	// 					hover = null;
	// 				}
	// 			}
	// 			break;
	// 		}

	// 		if (node instanceof nodes.AlignDirective) {
	// 			const dtype = node.getText().slice(0, 6).toLowerCase();
	// 			const entry = this.rcasmDataManager.getDirective(dtype);
	// 			if (entry) {
	// 				const contents = languageFacts.getEntryDescription(entry, this.doesSupportMarkdown());
	// 				if (contents) {
	// 					hover = { contents, range: getRange(node), };
	// 				} else {
	// 					hover = null;
	// 				}
	// 			}
	// 			break;
	// 		}
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

	//   private async hoverSymbol(
	//     node: SyntaxNode,
	//     document: TextDocument,
	//     position: lsp.Position
	//   ) {
	//     const [def] = await getDefinitions(document.uri, position, this.ctx);
	//     const contents: lsp.MarkedString[] = [];

	//     if (def) {
	//       if (def.comment) {
	//         contents.push(def.comment); // TODO
	//       }

	//       switch (def.type) {
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
	//         default:
	//           contents.push(`(${def.type}) ${def.name}`);
	//       }

	//       return {
	//         range: nodeAsRange(node),
	//         contents,
	//       };
	//     }
	//   }

	//   private async hoverPath(node: SyntaxNode, uri: string) {
	//     const path = processPath(node.text);
	//     const resolved = await resolveInclude(uri, path, this.ctx);

	//     return {
	//       range: nodeAsRange(node),
	//       contents: {
	//         kind: lsp.MarkupKind.Markdown,
	//         value: resolved || path,
	//       },
	//     };
	//   }

	//   private async hoverNumber(node: SyntaxNode) {
	//     return {
	//       range: nodeAsRange(node),
	//       contents: {
	//         kind: lsp.MarkupKind.Markdown,
	//         value: formatNumeric(node.text),
	//       },
	//     };
	//   }

	//   private async hoverRegister(node: SyntaxNode) {
	//     const doc = registerDocs[<RegisterName>node.text.toLowerCase()];
	//     if (doc) {
	//       return {
	//         range: nodeAsRange(node),
	//         contents: {
	//           kind: lsp.MarkupKind.Markdown,
	//           value: registerDocs[<RegisterName>node.text.toLowerCase()],
	//         },
	//       };
	//     }
	//   }
}

function lookupMnemonicDoc(mnemonic: string): MarkupContent | undefined {
	mnemonic = mnemonic.toLowerCase();
	if (mnemonicDocs[mnemonic]) {
		return formatMnemonicDoc(mnemonicDocs[mnemonic]);
	}
}
