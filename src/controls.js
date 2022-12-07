import DS from './ds.js';

import dropdown from '../lib/dropdown.js';
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
	manual_min;
	manual_max;

	constructor(d) {
		if (!(d instanceof DS)) throw new Error(`dscontrols: Expected a DS but got ${d}`);
		super();

		this.ds = d;

		this.show_advanced = false;

		this.render();

		return this;
	};

	render() {
		this.checkbox = toggle_switch.call(this.ds, this.on);

		if (this.ds.category.controls.weight)
			this.weight_group = weight.call(this.ds);

		if (this.ds.mutant)
			mutant_options.call(this.ds);

		this.dropdown = new dropdown(options.call(this));

		attach.call(this, tmpl('#ds-controls-template'));

		this.main = qs('main', this);
		this.header = qs('header', this);
		this.content = qs('content', this);
		this.spinner = qs('.loading', this);

		this.header.onclick = header_click.call(this);

		slot_populate.call(this, Object.assign({}, this.ds, {
			"dropdown":        this.dropdown,
			"checkbox":        this.checkbox.svg,
			"collection-list": this.collection_list,
			"weight-slider":   maybe(this.weight_group, 'el'),
		}));

		this.inject();

		return this;
	};

	refresh() {
		range_group_controls.call(this);
		manual_setup.call(this);
	};

	loading(t) {
		this.spinner.style.display = t ? 'block' : 'none';
	};

	turn(t) {
		this.main.classList[this.ds.on ? 'add' : 'remove']('active');
		this.classList[this.ds.on ? 'add' : 'remove']('active');

		if (this.checkbox) this.checkbox.change(t);

		if (t && !this.range_group) range_group_controls.call(this);

		if (t) manual_setup.call(this);
	};

	inject() {
		if (!tabs_el) return;

		const ds = this.ds;
		const path = maybe(ds.category, 'controls', 'path');

		if (!path.length) return;

		function create_tab(name) {
			const t = ce('div', humanformat(name), { "id": 'controls-tab-' + name, "class": 'controls-branch-tab up-title' });
			if (ea_indexes[name]) t.setAttribute('bind', name);
			return t;
		};

		function create_branch(name) {
			const t = ce('div', null, { "id": 'controls-branch-' + name, "class": 'controls-branch' });
			if (ea_indexes[name]) t.setAttribute('bind', name);
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
		this.dropdown.remove();

		if (this.checkbox) this.checkbox.svg.remove();
	};

	reset_defaults() {
		if (this.weight_group) {
			const w = maybe(this.ds.category, 'analysis', 'weight');

			this.weight_group.change({ "min": 0, "max": w });
			O.ds(this.ds, { 'weight': w });
		}

		if (this.range_group) {
			this.range_group.change(this.ds.domain);
			O.ds(this.ds, { 'domain': this.ds.domain });
		}
	};

	toggle_advanced() {
		if (!this.ds.on) toggle_ds.call(this.ds);

		qs('.advanced-controls', this).style.display = ((this.show_advanced = !this.show_advanced)) ? 'block' : 'none';
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

		else if (e.target.closest('.more-dropdown') === this.ds.controls.dropdown)
			return;

		else
			svg.dispatchEvent(new Event('click', { "bubbles": true }));
	};
};

async function mutant_options() {
	await until(_ => maybe(this.hosts, 'length') === this.config.mutant_targets.length);

	const container = ce('div', null, { "class": 'control-option' });
	const select = ce('select');

	this.hosts.forEach(d => select.append(ce('option', d.name, { "value": d.id })));

	select.value = this.host.id;

	select.onchange = async e => {
		const host = DST.get(e.target.value);

		await this.mutate(host);

		O.ds(this, { 'mutate': host });
	};

	container.append(select);

	this.mutant_options = container;

	slot_populate.call(this.controls, {
		"mutant-options": this.mutant_options,
	});
};

function ramp(...els) {
	const r = tmpl('#ramp');

	for (const e of els)
		qs('.ramp', r).append(e);

	const div = qs(':scope > div', r);

	if (!div) return r;
	div.style['width'] = `${slider_width + 2}px`;
	div.style['margin'] = 'auto';

	return r;
};

function range(opts = {}) {
	if (!opts.sliders) return null;

	const domain = {};

	let {min,max} = this.domain;

	const diff = Math.abs(max - min);
	let d = 3 - Math.ceil(Math.log10(diff || 1));
	if (d < 0) d = 0;

	if (and(this.category.unit === "%",
	        or(and(min === 0, max === 100),
	           and(min === 100, max === 0)))) d = 0;

	const update = (x, i, el) => {
		el.value = (+x).toFixed(d);

		const man = maybe(this.controls, 'manual_' + i);
		if (man) man.value = x;

		domain[i] = parseFloat(x);
	};

	let step = 0.1 * Math.pow(10, Math.floor(Math.log10(Math.abs(this.domain.max - this.domain.min))));

	this.controls.manual_min = ce('input', null, {
		"bind": "min",
		"type": "number",
		"min":  this.domain.min,
		"max":  this.domain.max,
		"step": step,
	});

	this.controls.manual_max = ce('input', null, {
		"bind": "max",
		"type": "number",
		"min":  this.domain.min,
		"max":  this.domain.max,
		"step": step,
	});

	const r = ramp(
		this.controls.manual_min,
		ce('div', opts.ramp || 'range', { "class": "unit-ramp" }),
		this.controls.manual_max,
	);

	const s = svg_interval({
		"sliders":      opts.sliders,
		"width":        slider_width,
		"init":         this._domain,
		"domain":       this.domain,
		"steps":        opts.steps,
		"callback1":    x => update(x, 'min', this.controls.manual_min),
		"callback2":    x => update(x, 'max', this.controls.manual_max),
		"end_callback": _ => O.ds(this, { 'domain': domain }),
	});

	const el = ce('div', [s.svg, r], { "style": "text-align: center;" });

	return {
		el,
		"svg":    s.svg,
		"change": s.change,
		"ramp":   r,
	};
};

function weight() {
	const weights = [1,2,3,4,5];

	const r = ramp(
		ce('div', weights[0]),
		ce('div', "importance", { "class": "unit-ramp" }),
		ce('div', weights[weights.length - 1]),
	);

	const w = svg_interval({
		"sliders":      "single",
		"init":         { "min": 1, "max": this.weight },
		"domain":       { "min": 1, "max": 5 },
		"steps":        weights,
		"width":        slider_width,
		"end_callback": x => O.ds(this, { 'weight': x }),
	});

	const el = ce('div', [w.svg, r], { "style": "text-align: center;" });

	return {
		el,
		"svg":    w.svg,
		"change": w.change,
		"ramp":   r,
	};
};

function options() {
	const dropdownlist = [];

	if (!Object.keys(this.ds.metadata).every(k => !this.ds.metadata[k])) {
		dropdownlist.push({
			"content": "Dataset info",
			"action":  this.ds.info_modal.bind(this.ds),
		});
	}

	if (this.weight_group) {
		dropdownlist.push({
			"content": "Toggle advanced controls",
			"action":  this.toggle_advanced.bind(this),
		});
	}

	dropdownlist.push({
		"content": "Reset default values",
		"action":  this.reset_defaults.bind(this),
	});

	// Enable this later when we are ready to let the users download the
	// original file.
	//
	// if (this.ds.download) {
	//   dropdownlist.push({
	//     "content": "Download dataset file",
	//     "action": _ => fake_download(this.ds.download, null)
	//   });
	// }
	//
	return dropdownlist;
};

function manual_setup() {
	if (!this.manual_min || !this.manual_max) return;

	this.manual_min.value = this.ds._domain.min;
	this.manual_max.value = this.ds._domain.max;

	const change = (e,i) => {
		let v = +e.target.value;

		const d = this.ds._domain;
		d[i] = +v;

		this.range_group.change(d);

		O.ds(this.ds, { 'domain': d });
	};

	this.manual_min.onchange = debounce(e => change(e, 'min'));
	this.manual_max.onchange = debounce(e => change(e, 'max'));

	switch (maybe(this.ds, 'category', 'controls', 'range')) {
	case 'single':
		this.manual_min.setAttribute('disabled', true);
		break;

	case 'double':
		break;

	case null:
	default:
		break;
	}
};

function range_group_controls() {
	const cat = this.ds.category;

	let steps;
	if (cat.controls.range_steps) {
		steps = [];
		const s = (this.ds.domain.max - this.ds.domain.min) / (cat.controls.range_steps - 1);

		for (let i = 0; i < cat.controls.range_steps; i += 1)
			steps[i] = this.ds.domain.min + (s * i);
	}

	const lr = coalesce(cat.controls.range_label, cat.unit, 'range');

	switch (this.ds.datatype) {
	case 'points':
	case 'lines':
	case 'polygons': {
		if (!this.ds.raster) break;

		this.range_group = range.call(this.ds, {
			"ramp":    lr,
			"steps":   steps,
			"sliders": cat.controls.range,
			"domain":  this.ds.domain,
		});
		break;
	}

	case 'polygons-valued':
	case 'polygons-timeline': {
		this.range_group = range.call(this.ds, {
			"ramp":    lr,
			"steps":   steps,
			"sliders": cat.controls.range,
			"domain":  this.ds.domain,
		});
		break;
	}

	case 'table':
	case 'polygons-boundaries': {
		for (let e of qsa('content', this)) e.remove();
		return;
	}

	case 'raster-timeline':
	case 'raster-mutant':
	case 'raster': {
		this.range_group = range.call(this.ds, {
			"ramp":    lr,
			"steps":   steps,
			"sliders": cat.controls.range,
		});
		break;
	}

	default: {
		this.range_group = null;
		break;
	}
	}

	if (qs('[slot=range-slider]', this))
		qs('[slot=range-slider]', this).remove();

	slot_populate.call(this, {
		"range-slider": maybe(this.range_group, 'el'),
	});
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
