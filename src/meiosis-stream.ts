// Vendored Meiosis stream primitive (function-patches flavor).
// https://meiosis.js.org/docs/04-meiosis-with-function-patches.html
//
// s() reads, s(v) writes and notifies subscribers; no replay to late
// subscribers.
//
// Erasable-syntax only: node --experimental-strip-types runs this file
// directly in tests; tsc rewrites .ts specifiers to .js for the browser.

export interface Stream<T> {
	/** Read the current value (no arguments) or write a new one. */
	(value?: T): T;
	subscribe(fn: (value: T) => void): () => void;
}

export interface StreamFactory {
	<T>(initial?: T): Stream<T>;
	scan<S, P>(fn: (acc: S, patch: P) => S, initial: S, source: Stream<P>): Stream<S>;
	dropRepeats<S, T>(
		source: Stream<S>,
		deriveFn: (value: S) => T,
		equalsFn?: (a: T, b: T) => boolean,
	): Stream<T>;
}

function scan<S, P>(fn: (acc: S, patch: P) => S, initial: S, source: Stream<P>): Stream<S> {
	const out = stream(initial);
	let acc = initial;

	source.subscribe(v => out(acc = fn(acc, v)));

	return out;
}

function dropRepeats<S, T>(
	source: Stream<S>,
	deriveFn: (value: S) => T,
	equalsFn: (a: T, b: T) => boolean = (a, b) => a === b,
): Stream<T> {
	let last = deriveFn(source());

	const out = stream(last);

	source.subscribe(v => {
		const slice = deriveFn(v);

		if (equalsFn(last, slice)) return;

		last = slice;
		out(slice);
	});

	return out;
}

const stream = (function stream<T>(initial?: T): Stream<T> {
	let value: T | undefined = initial;
	const subscribers: Array<(value: T) => void> = [];

	// Double cast: the callable is built first, then given its subscribe
	// method below (avoids a namespace/enum transform for node strip-types).
	const s = function (arg?: T): T {
		// `arguments` (not `arg`) keeps the JS semantics: s() reads, while
		// s(undefined) writes undefined.
		if (arguments.length === 0) return value as T;

		value = arg;

		for (const fn of subscribers.slice()) fn(value as T);

		return value as T;
	} as unknown as Stream<T>;

	s.subscribe = function (fn: (value: T) => void): () => void {
		subscribers.push(fn);

		return () => {
			const i = subscribers.indexOf(fn);
			if (i > -1) subscribers.splice(i, 1);
		};
	};

	return s;
}) as StreamFactory;

stream.scan = scan;
stream.dropRepeats = dropRepeats;

export default stream;
