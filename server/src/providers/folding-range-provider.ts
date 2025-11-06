import * as lsp from 'vscode-languageserver';
import { Provider } from '.';
import { Context } from '../context';
import { INode } from '../parser';

export default class FoldingRangeProvider implements Provider {
	constructor(protected readonly ctx: Context) {}

	async onFoldingRanges({ textDocument }: lsp.FoldingRangeParams): Promise<lsp.FoldingRange[]> {
		const processed = this.ctx.store.get(textDocument.uri);
		if (!processed) {
			return [];
		}

		const folds: lsp.FoldingRange[] = [];

		const getRange = (n: INode): lsp.Range => {
			return lsp.Range.create(
				processed.document.positionAt(n.offset),
				processed.document.positionAt(n.end)
			);
		};

		processed.tree.accept(n => {
			// No need to dig below following types
			if (n.type === 'Instruction') {
				return false;
			}

			if (n.type === 'Scope') {
				// Fold scope
				const range = getRange(n);
				folds.push({
					startLine: range.start.line,
					endLine: range.end.line,
					kind: 'region'
				});
			} else if (n.type == 'Directive' && (n.value == '!for' || n.value == '!if')) {
				// Fold for and if directives
				const range = getRange(n);
				folds.push({
					startLine: range.start.line,
					endLine: range.end.line,
					kind: 'region'
				});
			}
			// Continue digging
			return true;
		});

		//     const defs = Array.from(processed?.symbols.definitions.values());
		//     const labels = defs.filter((def) => def.type === DefinitionType.Label);

		//     let lastLabel: Definition | undefined;
		//     let lastLocal: Definition | undefined;

		//     for (const label of labels) {
		//       if (lastLocal) {
		//         const start = lastLocal.location.range.start.line;
		//         const end = label.location.range.start.line - 1;
		//         folds.push(lsp.FoldingRange.create(start, end));
		//         lastLocal = undefined;
		//       }

		//       if (lastLabel) {
		//         const start = lastLabel.location.range.start.line;
		//         const end = label.location.range.start.line - 1;
		//         addRegion(start, end);
		//       }
		//       lastLabel = label;

		//       if (label.locals) {
		//         for (const local of label.locals.values()) {
		//           if (lastLocal) {
		//             const start = lastLocal.location.range.start.line;
		//             const end = local.location.range.start.line - 1;
		//             addRegion(start, end);
		//           }
		//           lastLocal = local;
		//         }
		//       }
		//     }

		//     const end = processed.document.lineCount;
		//     if (lastLabel) {
		//       const start = lastLabel.location.range.start.line;
		//       addRegion(start, end);
		//     }
		//     if (lastLocal) {
		//       const start = lastLocal.location.range.start.line;
		//       addRegion(start, end);
		//     }

		const sortedFolds = folds.sort((r1, r2) => {
			let diff = r1.startLine - r2.startLine;
			if (diff === 0) {
				diff = r1.endLine - r2.endLine;
			}
			return diff;
		});

		const validFolds: lsp.FoldingRange[] = [];
		let prevEndLine = -1;
		sortedFolds.forEach(r => {
			if (!(r.startLine < prevEndLine && prevEndLine < r.endLine)) {
				validFolds.push(r);
				prevEndLine = r.endLine;
			}
		});

		return validFolds;
	}

	register(connection: lsp.Connection) {
		connection.onFoldingRanges(this.onFoldingRanges.bind(this));
		return {
			foldingRangeProvider: true
		};
	}
}
