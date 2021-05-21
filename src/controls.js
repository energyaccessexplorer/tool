import DS from './ds.js';

import { select_tab } from './controls-search.js';

let slider_width;

const contents_el = qs('#controls-contents');

const tabs_el = qs('#controls-tabs');

export default class dscontrols extends HTMLElement {
	constructor(d) {
		if (!(d instanceof DS)) throw Error(`dscontrols: Expected a DS. Got ${d}.`);
		super();

		this.ds = d;

		this.show_advanced = false;

		this.render();

		return this;
	};

	async range_group_controls() {
		if (!this.ds.domain) {
			console.error(this.ds.id, "Dataset has no domain yet... skipping controls range.");
			return;
		}

		const cat = this.ds.category;

		let steps;
		if (cat.controls.range_steps) {
			steps = [];
			const s = (this.ds.domain.max - this.ds.domain.min) / (cat.controls.range_steps - 1);

			for (let i = 0; i < cat.controls.range_steps; i += 1)
				steps[i] = this.ds.domain.min + (s * i);
		}

		const lr = cat.controls.range_label || cat.unit || 'range';

		switch (this.ds.datatype) {
		case 'raster':
		case 'raster-mutant': {
			await until(_ => this.ds._domain);

			this.range_group = range.call(this.ds, {
				ramp: lr,
				steps: steps,
				sliders: cat.controls.range
			});
			break;
		}

		case 'points':
		case 'lines':
		case 'polygons': {
			if (!this.ds.raster) break;

			await until(_ => this.ds.domain);

			this.range_group = range.call(this.ds, {
				ramp: lr,
				steps: steps,
				sliders: cat.controls.range,
				domain: this.ds.domain
			});
			break;
		}

		case 'polygons-fixed':
		case 'polygons-timeline': {
			await until(_ => this.ds.domain);

			this.range_group = range.call(this.ds, {
				ramp: lr,
				steps: steps,
				sliders: cat.controls.range,
				domain: this.ds.domain
			});
			break;
		}

		default: {
			this.range_group = null;
			break;
		}
		}

		this.manual_setup();

		slot_populate.call(this, {
			"range-slider": maybe(this.range_group, 'el'),
		});
	};

	render() {
		this.checkbox = checkbox.call(this.ds);

		if (this.ds.category.controls.weight)
			this.weight_group = weight.call(this.ds);

		if (this.ds.items)
			this.collection_list = collection_list.call(this.ds);

		if (this.ds.mutant)
			mutant_options.call(this.ds);

		this.dropdown = new dropdown(options.call(this));

		attach.call(this, shadow_tmpl('#ds-controls-template'));

		this.main = qs('main', this);
		this.header = qs('header', this);
		this.content = qs('content', this);
		this.spinner = qs('.loading', this);

		this.header.onclick = this.checkbox.click;

		this.manual_min = qs('.manual-controls input[bind=min]', this);
		this.manual_max = qs('.manual-controls input[bind=max]', this);

		slot_populate.call(this, this.ds);

		slot_populate.call(this, {
			"dropdown": this.dropdown,
			"checkbox": this.checkbox.svg,
			"collection-list": this.collection_list,
			"weight-slider": maybe(this.weight_group, 'el'),
		});

		this.inject();

		return this;
	};

	loading(t) {
		this.spinner.style.display = t ? 'block' : 'none';
	};

	turn(t) {
		this.content.style.display = t ? 'block' : 'none';
		this.main.classList[this.ds.on ? 'add' : 'remove']('active');

		if (this.checkbox) this.checkbox.change(t);

		if (t && !this.range_group) this.range_group_controls();
	};

	inject() {
		if (!tabs_el) return;

		const ds = this.ds;
		const path = maybe(ds.category, 'controls', 'path');

		if (!path.length) return;

		function create_tab(name) {
			return ce('div', humanformat(name), { id: 'controls-tab-' + name, class: 'controls-branch-tab up-title' });
		};

		function create_branch(name) {
			return ce('div', null, { id: 'controls-branch-' + name, class: 'controls-branch' });
		};

		function create_subbranch(name) {
			let conel, title;
			const el = ce('div', null, { id: 'controls-subbranch-' + name, class: 'controls-subbranch' });

			el.append(
				title = ce('div', humanformat(name), { class: 'controls-subbranch-title up-title' }),
				conel = ce('div', null, { class: 'controls-container' })
			);

			title.prepend(ce('span', null, { class: 'collapse triangle' }));
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
		this.content.remove();
		this.dropdown.remove();

		if (this.checkbox) this.checkbox.svg.remove();
	};

	reset_defaults() {
		if (this.weight_group) {
			this.weight_group.change(0,2);
			O.dataset(this.ds, 'weight', 2);
		}

		if (this.range_group) {
			this.range_group.change(this.ds.domain);
			O.dataset(this.ds, 'domain', this.ds.domain);
		}
	};

	manual_setup() {
		if (!this.manual_min || !this.manual_max) return;

		this.manual_min.value = this.ds.domain.min;
		this.manual_max.value = this.ds.domain.max;

		const change = (e,i) => {
			let v = +e.target.value;

			if (i === 'max' && v > this.ds.domain.max) {
				e.target.value = this.ds.domain.max;
			}

			if (i === 'min' && v < this.ds.domain.min) {
				e.target.value = this.ds.domain.min;
			}

			const d = this.ds._domain;
			d[i] = +v;

			this.range_group.change(d);

			O.dataset(this.ds, 'domain', d);
		};

		this.manual_min.onchange = e => change(e, 'min');
		this.manual_max.onchange = e => change(e, 'max');

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
};

customElements.define('ds-controls', dscontrols);

function humanformat(s) {
	return s
		.replace('_', ' ')
		.replace('-', ' ')
		.replace(/^([a-z])/, x => x.toUpperCase())
		.replace(/ ([a-z])/g, x => x.toUpperCase());
};

function toggle_switch(init, callback) {
	const radius = 10,
		    svgwidth = 38,
		    svgheight = (radius * 2) + 2,
		    svgmin = radius + 1,
		    svgmax = svgwidth - radius - 1;

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
		svg: svg.node(),
		change: change
	};
};

function checkbox() {
	const c = toggle_switch(this.on);
	const svg = c.svg;

	c.click = e => {
		if (e.target.closest('svg') === svg)
			this.toggle(O);

		else if (e.target.closest('.more-dropdown') === this.controls.dropdown)
			return;

		else
			svg.dispatchEvent(new Event('click', { bubbles: true }));

		return this.on;
	};

	return c;
};

async function mutant_options() {
	await until(_ => maybe(this.hosts, 'length') === this.config.mutant_targets.length);

	const container = ce('div', null, { class: 'control-option' });
	const select = ce('select');

	this.hosts.forEach(d => select.append(ce('option', d.name, { value: d.id })));

	select.value = this.host.id;

	select.onchange = async e => {
		const host = DST.get(e.target.value);

		await this.mutate(host);

		O.dataset(this, 'mutate', host);
	};

	container.append(select);

	this.mutant_options = container;

	slot_populate.call(this.controls, {
		"mutant-options": this.mutant_options,
	});
};

function range(opts = {}) {
	if (!opts.sliders) return null;

	const domain = {};

	const update = (x, i, el) => {
		el.innerText = (+x).toFixed(maybe(this, 'raster', 'precision') || 0);

		const man = maybe(this.controls, 'manual_' + i);
		if (man) man.value = x;

		domain[i] = parseFloat(x);
	};

	const v1 = ce('div', null, { bind: "v1" });
	const v2 = ce('div', null, { bind: "v2" });

	const l = tmpl('#ramp');
	l.querySelector('.ramp').append(v1, ce('div', opts.ramp || 'range', { class: "unit-ramp" }), v2);

	if (!slider_width)
		slider_width = Math.max(coalesce(maybe(contents_el, 'clientWidth'), 0) - 64, 256);

	const r = ea_svg_interval({
		sliders: opts.sliders,
		width: slider_width,
		init: this._domain,
		domain: this.domain,
		steps: opts.steps,
		callback1: x => update(x, 'min', v1),
		callback2: x => update(x, 'max', v2),
		end_callback: _ => O.dataset(this, 'domain', domain),
	});

	const el = ce('div');
	el.append(r.svg, l);

	return {
		el: el,
		svg: r.svg,
		change: r.change,
		ramp: l
	};
};

function weight() {
	const weights = [1,2,3,4,5];

	const ramp = tmpl('#ramp');
	ramp.querySelector('.ramp').append(
		ce('div', weights[0] + ""),
		ce('div', "importance", { class: "unit-ramp" }),
		ce('div', weights[weights.length - 1] + "")
	);

	const w = ea_svg_interval({
		sliders: "single",
		init: [1, this.weight],
		domain: [1, 5],
		steps: weights,
		width: slider_width,
		end_callback: x => O.dataset(this, 'weight', x)
	});

	const el = ce('div');
	el.append(w.svg, ramp);

	return {
		el: el,
		svg: w.svg,
		change: w.change,
		ramp: ramp,
	};
};

function collection_list() {
	if (!this.items) return;

	const e = ce('ul', null, { class: 'collection' });

	for (let d of this.items)
		e.append(ce('li', d.name));

	return e;
};

function options() {
	const dropdownlist = [];

	if (!Object.keys(this.ds.metadata).every(k => !this.ds.metadata[k])) {
		dropdownlist.push({
			"content": "Dataset info",
			"action": _ => this.ds.info_modal()
		});
	}

	if (this.weight_group) {
		dropdownlist.push({
			"content": "Toggle advanced controls",
			"action": _ => {
				if (!this.ds.on) this.ds.toggle(O);

				qs('.advanced-controls', this).style.display = ((this.show_advanced = !this.show_advanced)) ? 'block' : 'none';
			}
		});
	}

	dropdownlist.push({
		"content": "Reset default values",
		"action": _ => this.reset_defaults()
	});

	dropdownlist.push({
		"content": "Set values manually",
		"action": _ => qs('.manual-controls', this).style.display = 'flex'
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
