import { pathToFileURL } from 'url';
import * as lsp from 'vscode-languageserver';
import path from 'path';
import * as matchers from 'jest-extended';
expect.extend(matchers);

import { createContext } from '../src/context';
import { Config } from '../src/config';

export class NullLogger implements lsp.Logger {
	info() {
		return null;
	}
	warn() {
		return null;
	}
	error() {
		return null;
	}
	log() {
		return null;
	}
}

export function createTestContext(config: Partial<Config> = {}) {
	const workspaceDir = path.join(__dirname, 'fixtures');
	const workspaceUri = pathToFileURL(workspaceDir).toString();
	const logger = new NullLogger();

	const connection = {
		sendDiagnostics: jest.fn()
	} as unknown as lsp.Connection;

	return createContext([{ uri: workspaceUri, name: 'fixtures' }], logger, connection, config);
}

export const range = (
	startLine: number,
	startChar: number,
	endLine: number,
	endChar: number
): lsp.Range => ({
	start: { line: startLine, character: startChar },
	end: { line: endLine, character: endChar }
});

export const between = (startChar: number, endChar: number): lsp.Range => ({
	start: { line: 0, character: startChar },
	end: { line: 0, character: endChar }
});
