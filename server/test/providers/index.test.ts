import { providers as nodeProviders } from '../../src/providers';
import { providers as browserProviders } from '../../src/providers/index.browser';
import ConfigurationProvider from '../../src/providers/configuration-provider';

// The browser registry must match the Node one apart from providers that need Node-only APIs
// (see CLAUDE.md "Two server entrypoints"). Add to this list deliberately, not to make the test pass.
const nodeOnlyProviders = [ConfigurationProvider];

describe('provider registries', () => {
	it('registers the same providers for the browser as for Node, minus Node-only ones', () =>
		expect(new Set(browserProviders)).toEqual(
			new Set(nodeProviders.filter(p => !nodeOnlyProviders.includes(p)))
		));

	it('lists each provider once', () => {
		expect(new Set(nodeProviders).size).toBe(nodeProviders.length);
		expect(new Set(browserProviders).size).toBe(browserProviders.length);
	});
});
