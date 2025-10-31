module.exports = {
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				tsconfig: {
					resolveJsonModule: true,
					esModuleInterop: true
				}
			}
		]
	}
};
