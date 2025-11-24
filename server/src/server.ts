import { createConnection, InitializeParams } from 'vscode-languageserver/node';
import * as lsp from 'vscode-languageserver';

import registerProviders from './providers';
import { createContext } from './context';

const connection = createConnection(lsp.ProposedFeatures.all);

connection.onInitialize((params: InitializeParams): lsp.InitializeResult => {
	const ctx = createContext(
		params.workspaceFolders ?? [],
		connection.console,
		connection,
		params.initializationOptions
	);

	const capabilities = registerProviders(connection, ctx, params.capabilities);

	return { capabilities };
});

// Listen on the connection
connection.listen();

// export default connection;
