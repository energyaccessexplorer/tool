import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import stream from '../src/meiosis-stream.ts';

describe('stream', () => {
	it('reads the initial value and supports writes', () => {
		const s = stream(1);
		assert.equal(s(), 1);

		s(2);
		assert.equal(s(), 2);
	});

	it('notifies subscribers on writes and supports unsubscribing', () => {
		const s = stream(0);
		const seen: number[] = [];

		const off = s.subscribe(v => seen.push(v));

		s(1);
		s(2);
		off();
		s(3);

		assert.deepEqual(seen, [1, 2]);
	});

	it('does not replay the current value to late subscribers', () => {
		const s = stream('a');
		const seen: string[] = [];

		s.subscribe(v => seen.push(v));

		assert.deepEqual(seen, []);
	});
});

describe('scan', () => {
	it('reduces source values into an accumulator stream', () => {
		type Patch = (n: number) => number;

		const update = stream<Patch>();
		const states = stream.scan((state, patch) => patch(state), 0, update);

		const seen: number[] = [];
		states.subscribe(v => seen.push(v));

		update(n => n + 1);
		update(n => n * 10);

		assert.equal(states(), 10);
		assert.deepEqual(seen, [1, 10]);
	});
});

describe('dropRepeats', () => {
	it('only emits when the derived slice changes', () => {
		const source = stream({ "a": 1, "b": 1 });
		const slice = stream.dropRepeats(source, s => s.a);

		const seen: number[] = [];
		slice.subscribe(v => seen.push(v));

		source({ "a": 1, "b": 2 }); // same slice: suppressed
		source({ "a": 2, "b": 2 }); // slice changed

		assert.deepEqual(seen, [2]);
	});

	it('honours a custom equality function', () => {
		const source = stream([1]);
		const slice = stream.dropRepeats(
			source,
			s => s,
			(a, b) => a.length === b.length,
		);

		const seen: number[][] = [];
		slice.subscribe(v => seen.push(v));

		source([2]); // same length (1) as [1]: suppressed
		source([1, 2, 3]); // length changed: emitted

		assert.deepEqual(seen, [[1, 2, 3]]);
	});
});
