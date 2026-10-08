import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// The locale policy (EAE-515/EAE-516) reads window.ENV, location.search and
// localStorage at call time, so stubbing those globals is enough to exercise
// it without a browser. The rule under test: fr reaches every environment,
// zh only protected (plus the test/dev previews), and neither a stored locale
// nor the browser's own preference may leak a locale into an environment that
// does not have it deployed.
const store = new Map<string, string>();

const globals = globalThis as unknown as Record<string, unknown>;

globals['window'] = { "ENV": ['public'] };
globals['location'] = { "search": '' };
globals['localStorage'] = {
	"getItem": (k: string) => store.get(k) ?? null,
	"setItem": (k: string, v: string) => { store.set(k, v); },
};
// Node 22 defines its own read-only navigator, so it has to be replaced.
Object.defineProperty(globalThis, 'navigator', {
	"value": { "language": 'en-US' },
	"configurable": true,
	"writable": true,
});

const { availableLocales, resolveLocale } = await import('../src/translate.js');

const win = (globalThis as unknown as { window: { ENV: string[] } }).window;
const loc = (globalThis as unknown as { location: { search: string } }).location;
const nav = (globalThis as unknown as { navigator: { language: string } }).navigator;

function setEnv(env: string[], search = '', language = 'en-US') {
	win.ENV = env;
	loc.search = search;
	nav.language = language;
	store.clear();
}

const sorted = (s: Set<string>) => [...s].sort();

describe('environment locale policy (EAE-515/EAE-516)', () => {
	it('offers French in every environment', () => {
		for (const env of [['public'], ['protected'], ['training']])
			assert.ok(availableLocales().has('fr'), `fr missing in ${env}`);
	});

	it('offers Chinese in protected only', () => {
		setEnv(['protected']);
		assert.ok(availableLocales().has('zh'));

		setEnv(['public']);
		assert.equal(availableLocales().has('zh'), false);

		setEnv(['training']);
		assert.equal(availableLocales().has('zh'), false);
	});

	it('offers Chinese on the test preview host (public + test)', () => {
		setEnv(['public', 'test']);
		assert.deepEqual(sorted(availableLocales()), ['en', 'fr', 'zh']);
	});

	it('honours ?lang= as an explicit override where the locale is not deployed', () => {
		setEnv(['public'], '?lang=zh');
		assert.ok(availableLocales().has('zh'));
		assert.equal(resolveLocale(), 'zh');
	});

	it('resolves the browser locale only within the environment policy', () => {
		setEnv(['public'], '', 'zh-CN');
		assert.equal(resolveLocale(), 'en');

		setEnv(['protected'], '', 'zh-CN');
		assert.equal(resolveLocale(), 'zh');

		setEnv(['public'], '', 'fr-FR');
		assert.equal(resolveLocale(), 'fr');
	});

	it('does not let a stored locale reach an environment without it', () => {
		setEnv(['public']);
		store.set('locale', 'zh');
		assert.equal(resolveLocale(), 'en');

		setEnv(['protected']);
		store.set('locale', 'zh');
		assert.equal(resolveLocale(), 'zh');
	});
});
