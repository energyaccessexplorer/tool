import {
	elem_collapse,
} from './utils.js';

import DS from './ds.js';

import { translateDatasetName, translateDatasetAttribute, translateCategoryName, translateSubbranchName, registerUIUpdater } from './translate.js';

import {
	select_tab,
} from './controls-search.js';

import {
	enough_datasets_for_index,
} from './analysis.js';

import bind from '../lib/bind.js';

import {
	maybe,
	qs,
	qsa,
	tmpl,
} from '../lib/helpers.js';

const contents_el = qs('#controls-contents');

function branch_recount() {
	const tabs = qsa('.controls-branch[bind]', document.body, true);

	for (const b of tabs) {
		const attr = b.getAttribute('bind');
		const t = qs(`.controls-branch-tab[bind=${attr}]`);

		if (enough_datasets_for_index(attr))
			t.classList.remove('missing');
		else
			t.classList.add('missing');
	}
};

export function subbranch_recount(s) {
	const t = qsa('ds-controls', s, true)
		.filter(c => c.ds.on)
		.length;

	const count = qs('.count', s);

	count.innerText = t;
	count.style.visibility = t ? 'visible' : 'hidden';
};

export function recount() {
	for (const subbranch of qsa('.controls-subbranch')) {
		subbranch_recount(subbranch);
	}

	branch_recount();
};

const tabs_el = qs('#controls-tabs');

function create_or_update_tab(name, translations, locale = window.LOCALE) {
	const id = 'controls-tab-' + name;
	let t = qs(`#${id}.controls-branch-tab`);

	if (!t) {
		t = tmpl('#branch-tab-template').querySelector('.controls-branch-tab');
		t.id = id;
		if (EAE['indexes'][name]) t.setAttribute('bind', name);
		tabs_el.append(t);
	}

	bind(t, {
		"label":  translateCategoryName(locale, name, translations),
		"select": (_) => select_tab(t, name),
	}, { "final": false });

	return t;
}

function create_or_update_branch(name) {
	const id = 'controls-branch-' + name;
	let b = qs(`#${id}.controls-branch`, contents_el);

	if (!b) {
		b = tmpl('#branch-container-template').querySelector('.controls-branch');
		b.id = id;
		if (EAE['indexes'][name]) b.setAttribute('bind', name);
		contents_el.append(b);
	}

	return b;
}

function create_or_update_subbranch(name, parent, translations, locale = window.LOCALE) {
	const id = 'controls-subbranch-' + name;
	let sb = qs(`#${id}.controls-subbranch`, parent);

	if (!sb) {
		sb = tmpl('#subbranch-template').querySelector('.controls-subbranch');
		sb.id = id;
		parent.append(sb);
		const container = qs('.controls-container', sb);
		const titleEl = qs('.controls-subbranch-title', sb);
		elem_collapse(container, sb);
		titleEl.addEventListener('mouseup', (_) => elem_collapse(container, sb));
	}

	const titleEl = qs('.controls-subbranch-title', sb);

	bind(titleEl, {
		"label": translateSubbranchName(locale, name, translations),
	}, { "final": false });

	return sb;
}

registerUIUpdater(() => refreshControlsUI(window.LOCALE));

export function refreshControlsUI(locale) {
	if (typeof DST === 'undefined' || !DST.size) return;

	const seenTabs = new Set();
	const seenSubbranches = new Set();

	for (const ds of DST.values()) {
		const path = maybe(ds.category, 'controls', 'path');
		if (!maybe(path, 'length')) continue;

		const ptr = maybe(ds.category, 'controls', 'path_translations') || [];

		if (!seenTabs.has(path[0])) {
			create_or_update_tab(path[0], ptr[0], locale);
			seenTabs.add(path[0]);
		}

		if (path.length >= 2) {
			const branchId = `${path[0]}-${path[1]}`;
			if (!seenSubbranches.has(branchId)) {
				const b = create_or_update_branch(path[0]);
				create_or_update_subbranch(path[1], b, ptr[1], locale);
				seenSubbranches.add(branchId);
			}
		}
	}
}

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

		this.append(tmpl('#controls-template'));

		this.main = qs('main', this);
		this.header = qs('header', this);
		this.spinner = qs('.loading', this);

		this.header.onclick = header_click.call(this);

		this.bind();
		this.inject();

		return this;
	}

	bind() {
		const desc = this.ds.description || this.ds.category.description;

		bind(this, Object.assign({}, this.ds, {
			"name":        translateDatasetName(window.LOCALE, this.ds),
			"checkbox":    this.checkbox.svg,
			"description": translateDatasetAttribute(window.LOCALE, this.ds, desc, 'description'),
			"card":        (_, e) => { e.stopPropagation(); this.ds.card.discover(); },
			"info":        (_, e) => { e.stopPropagation(); this.ds.info_modal(); },
		}), { "final": false });
	}

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

		if (!maybe(path, 'length')) return;

		const ptr = maybe(ds.category, 'controls', 'path_translations') || [];

		create_or_update_tab(path[0], ptr[0]);
		const b = create_or_update_branch(path[0]);
		const sb = create_or_update_subbranch(path[1], b, ptr[1]);

		const container = qs('.controls-container', sb);
		if (container) container.append(this);
	};

	disable() {
		this.main.classList.add('disabled');

		this.loading(true);

		this.spinner.remove();

		if (this.checkbox) this.checkbox.svg.remove();
	};
};

customElements.define('ds-controls', dscontrols);

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
			this.ds.turn();
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
