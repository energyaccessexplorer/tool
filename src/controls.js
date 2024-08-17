import {
	elem_collapse,
} from './utils.js';

import DS from './ds.js';

import {
	select_tab,
} from './controls-search.js';

import {
	enough_datasets,
} from './analysis.js';

const contents_el = qs('#controls-contents');

function branch_recount() {
	const tabs = qsa('.controls-branch[bind]', document.body, true);

	for (const b of tabs) {
		const attr = b.getAttribute('bind');
		const t = qs(`.controls-branch-tab[bind=${attr}]`);

		if (enough_datasets(attr))
			t.classList.remove('missing');
		else
			t.classList.add('missing');
	}
};

function subbranch_recount() {
	const subbranch = this.closest('.controls-subbranch');

	const t = qsa('ds-controls', subbranch, true)
		.filter(c => c.ds.on)
		.length;

	const count = qs('.count', subbranch);

	count.innerText = t;
	count.style.visibility = t ? 'visible' : 'hidden';
};

const tabs_el = qs('#controls-tabs');

export default class dscontrols extends HTMLElement {
	constructor(d) {
		if (!(d instanceof DS)) throw new Error(`dscontrols: Expected a DS but got ${d}`);
		super();

		this.ds = d;

		this.render();

		return this;
	};

	render() {
		this.checkbox = toggle_switch.call(this.ds, this.on);

		attach.call(this, tmpl('#ds-controls-template'));

		this.main = qs('main', this);
		this.header = qs('header', this);
		this.spinner = qs('.loading', this);

		this.header.onclick = header_click.call(this);

		slot_populate.call(this, Object.assign({}, this.ds, {
			"checkbox":    this.checkbox.svg,
			"description": this.ds.description || this.ds.category.description,
			"card":        this.card(),
			"info":        this.info(),
		}));

		this.inject();

		return this;
	};

	loading(t) {
		this.spinner.style.display = t ? 'block' : 'none';
	};

	turn(t) {
		this.main.classList[this.ds.on ? 'add' : 'remove']('active');
		this.classList[this.ds.on ? 'add' : 'remove']('active');

		if (this.checkbox) this.checkbox.change(t);
	};

	inject() {
		if (!tabs_el) return;

		const ds = this.ds;
		const path = maybe(ds.category, 'controls', 'path');

		if (!path.length) return;

		function create_tab(name) {
			const t = ce('div', humanformat(name), { "id": 'controls-tab-' + name, "class": 'controls-branch-tab up-title' });
			if (EAE['indexes'][name]) t.setAttribute('bind', name);
			return t;
		};

		function create_branch(name) {
			const t = ce('div', null, { "id": 'controls-branch-' + name, "class": 'controls-branch' });
			if (EAE['indexes'][name]) t.setAttribute('bind', name);
			return t;
		};

		function create_subbranch(name) {
			let conel, title;
			const el = ce('div', null, { "id": 'controls-subbranch-' + name, "class": 'controls-subbranch' });

			el.append(
				title = ce('div', ce('span', humanformat(name), { "class": "text" }), { "class": 'controls-subbranch-title up-title' }),
				conel = ce('div', null, { "class": 'controls-container' }),
			);

			title.prepend(ce('span', null, { "class": 'collapse triangle' }));
			title.append(ce('span', "0", { "class": 'count' }));
			title.addEventListener('mouseup', _ => elem_collapse(conel, el));

			elem_collapse(conel, el);

			return el;
		};

		let t = qs(`#controls-tab-${path[0]}.controls-branch-tab`);
		if (!t) {
			t = create_tab(path[0]);
			t.onclick = _ => select_tab(t, path[0]);
			tabs_el.append(t);
		}

		let b = qs(`#controls-branch-${path[0]}.controls-branch`, contents_el);
		if (!b) b = create_branch(path[0]);
		contents_el.append(b);

		let sb = qs(`#controls-subbranch-${path[1]}.controls-subbranch`, b);
		if (!sb) sb = create_subbranch(path[1]);
		b.append(sb);

		const container = qs('.controls-container', sb);
		if (container) container.append(this);
	};

	disable() {
		this.main.classList.add('disabled');

		this.loading(true);

		this.spinner.remove();

		if (this.checkbox) this.checkbox.svg.remove();
	};

	info() {
		const e = font_icon('info-circle');
		e.onclick = v => {
			v.stopPropagation();
			this.ds.info_modal();
		};

		return e;
	};

	card() {
		const e = font_icon('list-task');
		e.onclick = v => {
			v.stopPropagation();
			this.ds.card.discover();
		};

		return e;
	}
};

customElements.define('ds-controls', dscontrols);

function humanformat(s) {
	return s
		.replace('_', ' ')
		.replace('-', ' ')
		.replace(/^([a-z])/, x => x.toUpperCase())
		.replace(/ ([a-z])/g, x => x.toUpperCase());
};

export function toggle_ds() {
	O.ds(this, { 'active': (this.on = !this.on) })
		.then(_ => {
			subbranch_recount.call(this.controls);
			branch_recount();
		});
};

function toggle_switch(init, callback) {
	const radius = 10;
	const svgwidth = 38;
	const svgheight = (radius * 2) + 2;
	const svgmin = radius + 1;
	const svgmax = svgwidth - radius - 1;

	const svg = d3.create("svg")
		.attr('class', 'svg-checkbox');

	const g = svg.append('g');

	const gutter = g.append('rect');

	const c1 = g.append('circle');

	let status = init || false;

	const active = getComputedStyle(document.body).getPropertyValue('--the-yellow');

	svg
		.attr('width', svgwidth)
		.attr('height', svgheight)
		.style('cursor', 'pointer');

	gutter
		.attr('stroke', 'none')
		.attr('stroke-width', 0.4)
		.attr('fill', 'white')
		.attr('fill-opacity', 0.6)
		.attr('rx', (6/8) * radius)
		.attr('x', 1)
		.attr('y', (3/16) * svgheight)
		.attr('width', svgwidth - 2)
		.attr('height', (5/8) * svgheight);

	c1
		.attr('r', radius)
		.attr('cy', svgheight/2)
		.attr('stroke', 'black')
		.attr('stroke-width', 0.2)
		.attr('fill', 'white')
		.style('cursor', 'grab')
		.raise();

	function change(s,x) {
		c1
			.attr('fill', (s ? active : 'white'))
			.attr('cx', (s ? svgmax : svgmin));

		gutter
			.attr('stroke', 'black')
			.style('fill', (s ? active : '#f9f9f9'));

		if ((typeof callback === 'function') && x) callback(s);
	};

	svg.on('click', _ => change(status = !status, true));

	change(status, false);

	return {
		"svg": svg.node(),
		change,
	};
};

function header_click() {
	return e => {
		const svg = this.checkbox.svg;

		if (e.target.closest('svg') === svg)
			toggle_ds.call(this.ds);

		else
			svg.dispatchEvent(new Event('click', { "bubbles": true }));
	};
};

export function dig(ds) {
	const sb = ds.controls.closest('.controls-subbranch');
	const t = sb.closest('.controls-branch').id.replace('controls-branch-', '');

	select_tab(qs('#controls-tab-' + t), t);

	elem_collapse(qs('.controls-container', sb), sb, true);
};

export function list() {
	return Array.from(qsa('ds-controls', contents_el)).map(c => c.ds.id);
};
