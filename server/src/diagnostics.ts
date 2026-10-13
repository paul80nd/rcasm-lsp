import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import * as rcasm from '@paul80nd/rcasm';

import { Context } from './context';
import { TextDocument } from 'vscode-languageserver-textdocument';

const MAX_RELATED_CALL_SITES = 3;

export default class DiagnosticProcessor {
	constructor(protected readonly ctx: Context) {}

	/**
	 * Diagnostic messages provided by rcasm assembling the current source file
	 */
	rcasmDiagnostics(textDocument: TextDocument): Diagnostic[] {
		const conf = this.ctx.config;

		const { errors, warnings } = rcasm.assemble(textDocument.getText());

		const toRange = (loc: rcasm.SourceLoc) => ({
			start: textDocument.positionAt(loc.start.offset),
			end: textDocument.positionAt(loc.end.offset)
		});
		const toLocation = (loc: rcasm.SourceLoc) => ({ uri: textDocument.uri, range: toRange(loc) });

		const toDiagnostics = (e: rcasm.Diagnostic, s: DiagnosticSeverity): Diagnostic[] => {
			const diagnostic = {
				severity: s,
				range: toRange(e.loc),
				message: e.msg,
				source: 'rcasm'
			} as Diagnostic;

			if (!e.expansions?.length) {
				return [diagnostic];
			}

			// Raised inside a macro expansion: e.loc is the body line and expansions are the
			// call sites, innermost first. Underline the outermost call (the one in the user's
			// code) and link back to the body line and any intermediate calls.
			// The body line keeps its own diagnostic too, linked to the call sites that expand it.
			const outer = e.expansions[e.expansions.length - 1];
			const callSite = (x: rcasm.MacroExpansion) => ({
				location: toLocation(x.loc),
				message: `In expansion of macro '${x.name}'`
			});
			// Recursive macros can nest 100 deep; cap intermediates as rcasm's formatted text does
			const intermediates = e.expansions
				.slice(0, -1)
				.slice(0, MAX_RELATED_CALL_SITES)
				.map(callSite);
			return [
				{
					...diagnostic,
					range: toRange(outer.loc),
					message: `In macro '${outer.name}': ${e.msg}`,
					relatedInformation: [{ location: toLocation(e.loc), message: e.msg }, ...intermediates]
				},
				{ ...diagnostic, relatedInformation: [callSite(outer)] }
			];
		};

		// Every expansion of a broken body reports the same body line, so merge duplicates
		// (combining their related call sites)
		const dedupe = (ds: Diagnostic[]): Diagnostic[] => {
			const byKey = new Map<string, Diagnostic>();
			for (const d of ds) {
				const key = JSON.stringify([d.range, d.message]);
				const existing = byKey.get(key);
				if (!existing) {
					byKey.set(key, d);
				} else if (d.relatedInformation) {
					const related = [...(existing.relatedInformation ?? [])];
					for (const r of d.relatedInformation) {
						if (!related.some(x => JSON.stringify(x) === JSON.stringify(r))) {
							related.push(r);
						}
					}
					existing.relatedInformation = related;
				}
			}
			return [...byKey.values()];
		};

		const entries: Diagnostic[] = [];
		let maxProblems = conf.maxNumberOfProblems;
		entries.push(
			...dedupe(
				errors
					.filter((_, idx) => idx <= maxProblems)
					.flatMap(e => toDiagnostics(e, DiagnosticSeverity.Error))
			)
		);
		maxProblems -= errors.length;
		if (maxProblems > 0) {
			entries.push(
				...dedupe(
					warnings
						.filter((_, idx) => idx <= maxProblems)
						.flatMap(e => toDiagnostics(e, DiagnosticSeverity.Warning))
				)
			);
		}

		return entries;
	}
}
