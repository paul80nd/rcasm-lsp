import { Processor } from './docs';

export interface Config {
	processors: Processor[];
	maxNumberOfProblems: number;
}

export const defaultConfig: Config = {
	processors: ['rcasm'],
	maxNumberOfProblems: 1000
};

export function mergeConfig(
	config: Partial<Config>,
	defaultConfig: Config
): Config {
	return {
		...defaultConfig,
		...config
	};
}
