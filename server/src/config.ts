export interface Config {
	maxNumberOfProblems: number;
}

export const defaultConfig: Config = {
	maxNumberOfProblems: 1000
};

export function mergeConfig(config: Partial<Config>, defaultConfig: Config): Config {
	return {
		...defaultConfig,
		...config
	};
}
