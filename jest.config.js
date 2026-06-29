module.exports = {
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				// node16 resolution (needed for the exports-only LSP v10 packages) is a
				// "hybrid" module kind ts-jest only supports under isolatedModules. Transpile-
				// only is fine here: jest's runtime require() resolves the exports map, and
				// full type-checking is done separately by `tsc -b` (see CLAUDE.md).
				tsconfig: {
					esModuleInterop: true,
					isolatedModules: true
				}
			}
		]
	}
};
