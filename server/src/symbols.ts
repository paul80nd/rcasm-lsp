import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as parser from './parser/nodes';
import { Context } from './context';
import { SymbolScope, SymEntry } from './parser/scopes';
import { parseLine } from './parse';
import { containsPosition } from './geometry';

export interface NamedSymbol {
	location: lsp.Location;
	name: string;
	referenceType?: parser.ReferenceType;
}

export interface Definition extends NamedSymbol {
	type: DefinitionType;
	selectionRange: lsp.Range;
	comment?: string;
}

export function isDefinition(symbol: NamedSymbol): symbol is Definition {
	return (symbol as Definition).selectionRange !== undefined;
}

export enum DefinitionType {
	Label = 'label',
	Variable = 'variable'
}

export interface Symbols {
	definitions: Map<string, Definition>;
	references: Map<string, NamedSymbol[]>;
}

/**
 * Process symbols in document
 */
export function processSymbols(
	document: TextDocument,
	tree: parser.INode,
	scps: SymbolScope
): Symbols {
	const symbols: Symbols = {
		definitions: new Map<string, Definition>(),
		references: new Map<string, NamedSymbol[]>()
	};

	const addDefinition = (se: SymEntry, path: string) => {
		const name = `${path}${se.name}`;
		if (symbols.definitions.has(name)) {
			return;
		}

		const type = definitionTypeMappings[se.type];
		const range = getRange(se.node, document);

		const def: Definition = {
			name,
			type,
			location: { uri: document.uri, range },
			selectionRange: range
		};

		// Comments:
		const commentLines: string[] = [];

		// Same line comment
		const lineRange = lsp.Range.create(
			lsp.Position.create(range.start.line, 0),
			lsp.Position.create(range.start.line, lsp.uinteger.MAX_VALUE)
		);
		const line = parseLine(document.getText(lineRange) ?? '');
		if (line && line.comment) {
			const c = line.comment.value.trim();
			if (c.startsWith(';')) {
				commentLines.unshift(line.comment.value);
			}
		} else if (lineRange.start.line > 0) {
			// Preceding line comments
			for (let i = lineRange.start.line - 1; i >= 0; i--) {
				const lr = lsp.Range.create(
					lsp.Position.create(i, 0),
					lsp.Position.create(i, lsp.uinteger.MAX_VALUE)
				);
				const l = parseLine(document.getText(lr) ?? '');
				if (l && l.comment) {
					const c = l.comment.value.trim();
					if (c.startsWith(';')) {
						commentLines.unshift(l.comment.value);
					}
				} else {
					break;
				}
			}
		}

		// Convert to markdown:
		const horizontalRule = '***';
		const processedLines = commentLines.map(l =>
			l
				// Remove comment char and leading whitespace from each line
				.replace(/^[;*]\s?/, '')
				// Convert repeated punctuation lines to MD horizontal rules
				// This looks better and avoids creating headings with --- or === underline style
				// Use a tmp placeholder string until special chars are escaped
				.replace(/^\s*[*-=]{3,}\s*$/, '~~~')
				// Escape special chars
				.replace(/([*_{}[\]()#+-.!`])/g, '\\$1')
				// Replace placholder with actual rule
				.replace(/^~~~$/, horizontalRule)
		);
		// Ensure no horizontal rules at start or end of block
		while (processedLines[0] === horizontalRule) {
			processedLines.shift();
		}
		while (processedLines[processedLines.length - 1] === horizontalRule) {
			processedLines.pop();
		}

		if (commentLines.length) {
			def.comment = processedLines.join('  \n');
		}

		//     if (type === DefinitionType.Label) {
		//       if (isLocalLabel(name)) {
		//         if (lastGlobalLabel) {
		//           lastGlobalLabel.locals?.set(name, def);
		//           return;
		//         }
		//       } else {
		//         lastGlobalLabel = def;
		//         def.locals = new Map();
		//       }
		//     }

		symbols.definitions.set(name, def);
	};

	const walkScope = (ss: SymbolScope, path = '') => {
		ss.syms.forEach(sss => addDefinition(sss, path));
		ss.children.forEach(ssc => walkScope(ssc, `${path}${ssc.name}::`));
	};
	walkScope(scps);

	tree.accept(n => {
		if (n.type === 'SQRef' && n.ref) {
			const path = n.ref.path.map(p => p.replace(/__\d+$/, '__n'));
			const name = n.ref.absolute
				? path.join('::')
				: (n.ref.scope.name === '' ? '' : n.ref.scope.name + '::') + path.join('::');
			let refs = symbols.references.get(name);
			if (!refs) {
				refs = [];
				symbols.references.set(name, refs);
			}
			refs.push({
				name,
				location: { uri: document.uri, range: getRange(n, document) }
			});
		}
		return true;
	});

	return symbols;
}

// /**
//  * Process path string - removes quotes and handles escaped chars
//  */
// export function processPath(path: string): string {
//   if (path.startsWith('"') && path.endsWith('"')) {
//     return path
//       .substring(1, path.length - 1)
//       .replace(/""/g, '"')
//       .replace('\\"', '"');
//   }
//   if (path.startsWith("'") && path.endsWith("'")) {
//     return path
//       .substring(1, path.length - 1)
//       .replace(/''/g, "'")
//       .replace("\\'", "'");
//   }
//   return path;
// }

/**
 * Get symbol at position
 */
export function symbolAtPosition(
	symbols: Symbols,
	position: lsp.Position
): NamedSymbol | undefined {
	return definitionAtPosition(symbols, position) || referenceAtPosition(symbols, position);
}

/**
 * Get reference symbol at position
 */
export function referenceAtPosition(
	symbols: Symbols,
	position: lsp.Position
): NamedSymbol | undefined {
	for (const [, refs] of symbols.references) {
		const foundRef = refs.find(ref => containsPosition(ref.location.range, position));
		if (foundRef) {
			return foundRef;
		}
	}
	return undefined;
}

/**
 * Get definition symbol at position
 */
export function definitionAtPosition(
	docSymbols: Symbols,
	position: lsp.Position
): Definition | undefined {
	for (const def of docSymbols.definitions.values()) {
		if (containsPosition(def.selectionRange, position)) {
			return def;
		}
	}
	return undefined;
}

/**
 * Get references to symbol at position
 */
export async function getReferences(
	uri: string,
	position: lsp.Position,
	ctx: Context,
	includeDeclaration = false
): Promise<NamedSymbol[]> {
	const currentDoc = ctx.store.get(uri);
	if (!currentDoc) {
		return [];
	}

	const results: NamedSymbol[] = [];

	const symbol = symbolAtPosition(currentDoc.symbols, position);
	if (!symbol) {
		return [];
	}

	const refs = currentDoc.symbols.references.get(symbol.name);
	if (refs) {
		results.push(...refs);
	}
	if (includeDeclaration) {
		const def = currentDoc.symbols.definitions.get(symbol.name);
		if (def) {
			results.push(def);
		}
	}

	return results;
}

// interface LocalContext {
//   range: lsp.Range;
//   startLabel?: Definition;
//   endLabel?: Definition;
// }

/**
 * Get definitions of word at position
 */
export async function getDefinitions(
	uri: string,
	position: lsp.Position,
	ctx: Context
): Promise<Definition[]> {
	const processed = ctx.store.get(uri);
	if (!processed) {
		return [];
	}

	const symbol = symbolAtPosition(processed.symbols, position);
	if (!symbol) {
		return [];
	}

	const def = processed.symbols.definitions.get(symbol.name);
	return def ? [def] : [];
}

/**
 * Get definition of first global label before position
 */
export function labelBeforePosition(): Definition | undefined {
	//   docSymbols: Symbols,
	//   position: lsp.Position
	let label: Definition | undefined;
	//   for (const def of docSymbols.definitions.values()) {
	//     if (def.type === DefinitionType.Label && !isLocalLabel(def.name)) {
	//       if (def.selectionRange.start.line > position.line) {
	//         break;
	//       }
	//       label = def;
	//     }
	//   }
	return label;
}

// /**
//  * Get range between global labels containing symbol
//  */
// function localContext(
//   symbol: NamedSymbol,
//   docSymbols: Symbols,
//   document: TextDocument
// ): LocalContext {
//   const range: lsp.Range = {
//     start: { character: 0, line: 0 },
//     end: { character: 0, line: document.lineCount }, // todo
//   };

//   let startLabel: Definition | undefined;
//   let endLabel: Definition | undefined;

//   for (const def of docSymbols.definitions.values()) {
//     if (def.type === DefinitionType.Label && !isLocalLabel(def.name)) {
//       if (def.location.range.start.line > symbol.location.range.start.line) {
//         range.end = {
//           ...def.location.range.start,
//           character: 0,
//         };
//         endLabel = def;
//         break;
//       }
//       range.start = def.location.range.start;
//       startLabel = def;
//     }
//   }
//   return { range, startLabel, endLabel };
// }

const definitionTypeMappings: Record<string, DefinitionType> = {
	label: DefinitionType.Label,
	var: DefinitionType.Variable
};

export const symbolKindMappings: Record<DefinitionType, lsp.SymbolKind> = {
	[DefinitionType.Label]: lsp.SymbolKind.Field,
	[DefinitionType.Variable]: lsp.SymbolKind.Variable
};

function getRange(node: parser.INode, document: TextDocument): lsp.Range {
	return lsp.Range.create(document.positionAt(node.offset), document.positionAt(node.end));
}
