import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// utils.js imports toast.js/sentry.js, which reference these browser
// globals at module-eval time (custom element class + registry); d3 is a
// script-tag global in the browser build. Stub the bare minimum used here
// so importing the module and calling even_label_indices work outside one.
(globalThis as { HTMLElement?: unknown }).HTMLElement ??= class {};
(globalThis as { customElements?: unknown }).customElements ??= { "define": () => undefined };
(globalThis as { d3?: unknown }).d3 ??= { "range": (n: number) => Array.from({ length: n }, (_, i) => i) };

const { even_label_indices: evenLabelIndices } = await import('../src/utils.js');

describe('even_label_indices', () => {
	it('returns every index when n is within maxLabels', () => {
		assert.deepEqual(evenLabelIndices(0), []);
		assert.deepEqual(evenLabelIndices(1), [0]);
		assert.deepEqual(evenLabelIndices(6), [0, 1, 2, 3, 4, 5]);
	});

	it('always includes the first and last index', () => {
		for (const n of [7, 9, 10, 12, 13, 25]) {
			const idx = evenLabelIndices(n);
			assert.equal(idx[0], 0);
			assert.equal(idx[idx.length - 1], n - 1);
		}
	});

	it('picks the perfectly even split when one exists (13 points -> 5 labels)', () => {
		assert.deepEqual(evenLabelIndices(13), [0, 3, 6, 9, 12]);
	});

	it('picks the perfectly even split when one exists (9 points -> 5 labels)', () => {
		assert.deepEqual(evenLabelIndices(9), [0, 2, 4, 6, 8]);
	});

	it('prefers 6 over 5 on a tied spread', () => {
		assert.deepEqual(evenLabelIndices(12), [0, 2, 4, 7, 9, 11]);
	});

	it('never exceeds maxLabels', () => {
		for (const n of [7, 8, 9, 10, 11, 12, 13, 14, 20, 37]) {
			assert.ok(evenLabelIndices(n).length <= 6);
		}
	});

	it('respects a custom maxLabels/minLabels window', () => {
		assert.deepEqual(evenLabelIndices(13, 3), [0, 6, 12]);
		assert.deepEqual(evenLabelIndices(13, 4, 3), [0, 4, 8, 12]);
	});

	it('produces strictly increasing indices within bounds', () => {
		for (const n of [7, 11, 13, 17, 23, 30]) {
			const idx = evenLabelIndices(n);
			for (let i = 1; i < idx.length; i++)
				assert.ok((idx[i] ?? -1) > (idx[i - 1] ?? -1));

			for (const v of idx) {
				assert.ok(v >= 0);
				assert.ok(v <= n - 1);
			}
		}
	});
});
