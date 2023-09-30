function maybe(o, ...path) {
	return (o === null || o === undefined || !path.length) ? o :
		maybe(o[path[0]], ...path.slice(1));
};

function and(head, ...tail) {
	if (!head) return false;
	if (!tail.length) return head;

	return and(!!tail[0], ...tail.slice(1));
};

function or(head, ...tail) {
	if (head) return true;
	if (!tail.length) return head;

	return or(!!tail[0], ...tail.slice(1));
};

function tmpl(s) {
	const el = document.querySelector(s);
	if (el === null)
		throw new Error(`tmpl: element/node with selector '${s}' is null.`);

	return el.content.cloneNode(true);
};

function qsa(str, root, array = false) {
	if (!root) root = document;
	else if (!(root instanceof Node))
		throw Error(`qs: Expected a Node. got ${root}.`);

	const all = root.querySelectorAll(str);

	const r = (!all.length && root.shadowRoot) ?
		root.shadowRoot.querySelectorAll(str) :
		all;

	if (array) {
		const a = [];
		for (let i = r.length; i--; a.unshift(r[i]));
		return a;
	}

	return r;
};

export default function bind(el, data, opts = { "final": true }) {
	if (el.constructor.name === 'ShadowRoot')
		null;
	else if (el.constructor.name === 'DocumentFragment') {
		for (const e of Array.from(el.children)) bind(e, data, opts);
		return el;
	}
	else {
		template(el, data, opts);
		descend(el, data, opts);
		each(el, data, opts);
		similar(el, data, opts);
		differs(el, data, opts);
		cond(el, data, opts);
		unless(el, data, opts);
		attr(el, data, opts);
		element(el, data, opts);
		lambda(el, data, opts);
		listen(el, data, opts);
	}

	for (let e of qsa('[bind-tmpl]', el))
		template(e, data, opts);

	for (let e of qsa(':scope > [bind-descend]', el))
		descend(e, data, opts);

	for (let e of qsa('[bind-each]', el))
		each(e, data, opts);

	for (let e of qsa('[bind-similar]', el))
		similar(e, data, opts);

	for (let e of qsa('[bind-differs]', el))
		differs(e, data, opts);

	for (let e of qsa('[bind-cond],[bind-if]', el))
		cond(e, data, opts);

	for (let e of qsa('[bind-ifnot],[bind-unless]', el))
		unless(e, data, opts);

	for (let e of qsa('[bind-attr]', el))
		attr(e, data, opts);

	for (let e of qsa('[bind]', el))
		element(e, data, opts);

	for (let e of qsa('[bind-lambda]', el))
		lambda(e, data, opts);

	for (let e of qsa('[bind-listen]', el))
		listen(e, data, opts);

	return el;
};

function template(el, data, opts) {
	const a = el.getAttribute('bind-tmpl');

	if (a === null) return;

	el.append(tmpl(a));

	if (opts['final']) el.removeAttribute('bind-tmpl');
};

function descend(el, data, opts) {
	const a = el.getAttribute('bind-descend');

	if (a === null) return;

	if (data === undefined) return;
	if (or(data[a] === undefined, data[a] === null)) return;

	bind(el, data[a], opts);

	if (opts['final']) el.removeAttribute('bind-descend');
};

function element(el, data, opts) {
	const a = el.getAttribute('bind');

	if (a === null) return;

	if (a === "_") {
		el.innerText = format(el, data, opts);
		if (opts['final']) el.removeAttribute('bind');
		return;
	}

	const v = a.match('.*\\..*') ? maybe(data, ...a.split('.')) : data[a];

	if (or(v === undefined, v === null)) return;

	if (v instanceof Node)
		el.append(v);
	else if (el.tagName === 'INPUT')
		el.value = format(el, v, opts);
	else
		el.innerHTML = format(el, v, opts);

	if (opts['final']) el.removeAttribute('bind');
};

function each(el, data, opts) {
	const a = el.getAttribute('bind-each');

	if (a === null) return;

	let payload = data[a];

	if (a === "_") payload = data;

	if (payload) {
		if (!Array.isArray(payload)) {
			console.error(JSON.stringify(data, null, 2), payload, el);
			throw new Error(`NO NO NO ${payload} array`);
		}

		if (!payload.length) {
			el.remove();
			return;
		}

		for (let e of payload) {
			const c = el.cloneNode(true);
			c.removeAttribute('bind-each');

			bind(c, e, opts);

			el.parentNode.append(c);
		}

		el.remove();
	}
};

function attr(el, data, opts) {
	const t = el.getAttribute('bind-attr');
	const a = el.getAttribute('bind-arg');

	if (t === null) return;

	if (a === null) return;

	if (a === "_") {
		el.setAttribute(t, data);
		return;
	}

	const v = a.match('.*\\..*') ? maybe(data, ...a.split('.')) : data[a];

	if (or(v === undefined, v === null)) return;

	let n;
	let f = format(el, v, opts);

	if (!v && (n = el.getAttribute('bind-not')))
		f = n;

	if (t === 'value' && el.tagName === 'INPUT')
		el.value = f;
	else
		el.setAttribute(t, f);

	if (opts['final']) {
		el.removeAttribute('bind-attr');
		el.removeAttribute('bind-arg');
	}
};

function lambda(el, data, opts) {
	const l = el.getAttribute('bind-lambda');
	const v = el.getAttribute('bind-arg');

	if (l === null) return;

	if (and(l, v, maybe(data, v))) {
		let n;
		let t = format(el, eval(`${l}(data['${v}'])`), opts); // yes, I did it!

		if (!data[v] && (n = el.getAttribute('bind-not')))
			t = n;

		if (t instanceof Node)
			el.append(t);
		else
			el.innerHTML = t;
	}

	if (opts['final']) {
		el.removeAttribute('bind-lambda');
		el.removeAttribute('bind-arg');
	}
};

function listen(el, data, opts) {
	const l = el.getAttribute('bind-listen');
	const a = el.getAttribute('bind-func');

	if (a === null) return;

	const v = a.match('.*\\..*') ? maybe(data, ...a.split('.')) : data[a];

	if (!and(l, v)) return;

	if (and(l, v, typeof v === 'function'))
		el.addEventListener(l, v.bind(el, data));

	if (opts['final']) {
		el.removeAttribute('bind-func');
		el.removeAttribute('bind-listen');
	}
};

function cond(el, data, _) {
	const a = el.getAttribute('bind-cond') || el.getAttribute('bind-if');

	if (a === null) return;

	const v = a.match('.*\\..*') ? maybe(data, ...a.split('.')) : data[a];

	if (!v) {
		el.remove();
		return;
	}

	el.removeAttribute('bind-cond');
	el.removeAttribute('bind-if');
};

function unless(el, data, _) {
	const a = el.getAttribute('bind-unless') || el.getAttribute('bind-ifnot');

	if (a === null) return;

	const v = a.match('.*\\..*') ? maybe(data, ...a.split('.')) : data[a];

	if (v) {
		el.remove();
		return;
	}

	el.removeAttribute('bind-unless');
	el.removeAttribute('bind-ifnot');
};

function similar(el, data, opts) {
	const a = el.getAttribute('bind-similar');
	const v = el.getAttribute('bind-arg');

	if (a === null) return;

	const t = a.match('.*\\..*') ? maybe(data, ...a.split('.')) : data[a];

	if (t != v) el.remove();

	if (opts['final']) {
		el.removeAttribute('bind-similar');
		el.removeAttribute('bind-arg');
	}
};

function differs(el, data, opts) {
	const a = el.getAttribute('bind-differs');
	const v = el.getAttribute('bind-arg');

	if (a === null) return;

	const t = a.match('.*\\..*') ? maybe(data, ...a.split('.')) : data[a];

	if (t == v) el.remove();

	if (opts['final']) {
		el.removeAttribute('bind-similar');
		el.removeAttribute('bind-arg');
	}
};

function format(el, data = null, opts) {
	let t = data;

	let f = el.getAttribute('bind-format');

	if (f === null) return t;

	if (f === 'json')
		t = JSON.stringify(data);
	else if (f === 'pretty-json')
		t = JSON.stringify(data, null, "  ");
	else
		t = f.replace('{0}', data);

	if (opts['final']) {
		el.removeAttribute('bind-format');
		el.removeAttribute('bind-attr');
		el.removeAttribute('bind-arg');
	}

	return t;
};
