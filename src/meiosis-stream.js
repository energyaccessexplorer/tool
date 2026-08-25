// Minimal Meiosis stream primitive (function-patches flavor).
// https://meiosis.js.org/docs/04-meiosis-with-function-patches.html

export default function stream(initial) {
	let value = initial;
	const subscribers = [];

	function s(v) {
		if (arguments.length === 0) return value;

		value = v;

		for (const fn of subscribers.slice()) fn(value);

		return value;
	};

	s.subscribe = function(fn) {
		subscribers.push(fn);

		return () => {
			const i = subscribers.indexOf(fn);
			if (i > -1) subscribers.splice(i, 1);
		};
	};

	return s;
};

stream.scan = function(fn, initial, source) {
	const out = stream(initial);
	let acc = initial;

	source.subscribe(v => out(acc = fn(acc, v)));

	return out;
};

stream.dropRepeats = function(source, deriveFn, equalsFn = (a, b) => a === b) {
	let last = deriveFn(source());

	const out = stream(last);

	source.subscribe(v => {
		const slice = deriveFn(v);

		if (equalsFn(last, slice)) return;

		last = slice;
		out(slice);
	});

	return out;
};
