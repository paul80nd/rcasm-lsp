import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import * as rcasm from '@paul80nd/rcasm';

import { Context } from './context';
import { TextDocument } from 'vscode-languageserver-textdocument';

export default class DiagnosticProcessor {
	constructor(protected readonly ctx: Context) {}

	/**
	 * Diagnostic messages provided by rcasm assembling the current source file
	 */
	rcasmDiagnostics(textDocument: TextDocument): Diagnostic[] {
		const conf = this.ctx.config;

		const { errors, warnings } = rcasm.assemble(textDocument.getText());

		const toDiagnostic = (
			e: rcasm.Diagnostic,
			s: DiagnosticSeverity
		): Diagnostic => {
			return {
				severity: s,
				range: {
					start: textDocument.positionAt(e.loc.start.offset),
					end: textDocument.positionAt(e.loc.end.offset)
				},
				message: e.msg,
				source: 'rcasm'
			} as Diagnostic;
		};

		const entries: Diagnostic[] = [];
		let maxProblems = conf.maxNumberOfProblems;
		entries.push(
			...errors
				.filter((_, idx) => idx <= maxProblems)
				.map(e => toDiagnostic(e, DiagnosticSeverity.Error))
		);
		maxProblems -= errors.length;
		if (maxProblems > 0) {
			entries.push(
				...warnings
					.filter((_, idx) => idx <= maxProblems)
					.map(e => toDiagnostic(e, DiagnosticSeverity.Warning))
			);
		}

		return entries;
	}
}
