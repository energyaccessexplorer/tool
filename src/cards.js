import DS from './ds.js';

import {
	points_symbol,
	lines_symbol,
	polygons_symbol,
	lines_legends_svg,
	points_legends_svg,
	polygons_legends_svg,
} from './symbols.js';

import {
	toggle_left_panel,
} from './a.js';

const cards_list = qs('#cards-list');

const slider_width = 472;

async function mutant_options() {
	const d = this.ds;

	await until(_ => maybe(d.hosts, 'length') === d.config.mutant_targets.length);

	const container = ce('div', null, { "class": 'control-option' });
	const select = ce('select');

	d.hosts.forEach(d => select.append(ce('option', d.name, { "value": d.id })));

	select.value = d.host.id;

	select.onchange = async e => {
		const host = DST.get(e.target.value);

		await d.mutate(host);

		O.ds(d, { 'mutate': host });
	};

	container.append(select);

	this.mutant_options = container;

	slot_populate.call(this, {
		"mutant-options": container,
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

function value_multiselect() {
	const ds = this.ds;

	const inputs = ds.csv.data.map(x => {
		const k = x['KEY'];

		const i = ce('input', null, { "type": 'checkbox', "name": "", "value": k });
		i.checked = true;
		i.id = ds.id + "_" + k;

		i.onchange = _ => {
			ds._domain_select = [...new Set(inputs.filter(e => e.checked).map(e => +e.value))];
			O.ds(ds, { 'domain': ds.domain });
		};

		return i;
	});

	ds._domain_select = ds.csv.data.map(r => +r['KEY']);

	const elements = inputs.map((e,i) => {
		const c = ds.colorscale.fn(+e.value);
		const s = ce('span', null, { "style": `width: 20px; height: 14px; display: inline-block; background-color: rgba(${c}); margin: auto 1em;` });

		const l = ce('label', s, { "for": e.id });
		l.append(ds.csv.data[i]['VALUE']);

		return ce('div', [e,l]);
	});

	return {
		elements,
	};
};

function range(interval) {
	const ds = this.ds;
	const cat = this.ds.category;

	const domain = {};

	let {min,max} = ds.domain;

	const diff = Math.abs(max - min);
	let d = 3 - Math.ceil(Math.log10(diff || 1));
	if (d < 0) d = 0;

	if (and(cat.unit === "%",
	        or(and(min === 0, max === 100),
	           and(min === 100, max === 0)))) d = 0;

	const update = (x, i, el, cx) => {
		el.value = (+x).toFixed(d);

		const man = maybe(this, 'manual_' + i);
		if (man) {
			man.value = x;
		}

		const ctrl = maybe(this, 'cr_' + i);
		if (ctrl?.style) {
			ctrl.style.left = cx + "px";
		}
		domain[i] = parseFloat(x);
	};

	let step = 0.1 * Math.pow(10, Math.floor(Math.log10(Math.abs(ds.domain.max - ds.domain.min))));

	this.cr_max = tmpl('#controls-input').firstElementChild;
	this.cr_min = tmpl('#controls-input').firstElementChild;

	this.manual_min = ce('input', null, {
		"bind":  "min",
		"type":  "number",
		"min":   ds.domain.min,
		"max":   ds.domain.max,
		"step":  step,
		"value": ds._domain.min,
	});

	this.manual_max = ce('input', null, {
		"bind":  "max",
		"type":  "number",
		"min":   ds.domain.min,
		"max":   ds.domain.max,
		"step":  step,
		"value": ds._domain.max,
	});

	const change = (e,i) => {
		let v = +e.target.value;

		const d = this.ds._domain;
		d[i] = +v;

		this.range_el.change(d);

		O.ds(this.ds, { 'domain': d });
	};

	this.manual_min.onchange = debounce(e => change(e, 'min'));
	this.manual_max.onchange = debounce(e => change(e, 'max'));

	this.cr_min.append(this.manual_min);
	this.cr_max.append(this.manual_max);

	switch (maybe(cat, 'controls', 'range')) {
	case 'single':
		this.manual_min.setAttribute('disabled', true);
		break;

	case 'double':
		break;

	case null:
	default:
		break;
	}

	let steps;
	if (maybe(cat, 'controls', 'range_steps')) {
		steps = [];
		const s = (ds.domain.max - ds.domain.min) / (cat.controls.range_steps - 1);

		for (let i = 0; i < cat.controls.range_steps; i += 1)
			steps[i] = ds.domain.min + (s * i);
	}

	const s = interval({
		"background":   ds.colorscale?.svg.querySelector('g').cloneNode(true),
		"sliders":      ds.category.controls.range,
		"width":        slider_width,
		"init":         ds._domain,
		"domain":       ds.domain,
		"steps":        steps,
		"callback1":    (x, cx) => update(x, 'min', this.manual_min, cx),
		"callback2":    (x, cx) => update(x, 'max', this.manual_max, cx),
		"end_callback": _ => O.ds(ds, { 'domain': domain }),
	});

	return {
		"elements": [s.svg, this.cr_min, this.cr_max],
		"svg":      s.svg,
		"change":   s.change,
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

function range_el() {
	const ds = this.ds;
	const cat = this.ds.category;

	let d = ce('div');
	let e = "";
	let r = "";
	let t = "";
	let o = "";
	let g = undefined;

	function ramp_domain() {
		let {min,max} = ds.domain;

		const diff = Math.abs(max - min);
		let i = 3 - Math.ceil(Math.log10(diff || 1));
		if (i < 0) i = 0;

		if (and(cat.unit === "%",
		        or(and(min === 0, max === 100),
		           and(min === 100, max === 0)))) i = 0;

		const u = coalesce(cat.controls.range_label, cat.unit, 'range');

		return [
			ce('div', min.toFixed(i)),
			ce('div', u, { "class": "unit-ramp" }),
			ce('div', max.toFixed(i)),
		];
	};

	switch (ds.datatype) {
	case 'points-timeline': {
		e = points_symbol({
			"size":        24,
			"fill":        ds.vectors.fill,
			"stroke":      ds.vectors.stroke,
			"strokewidth": 2,
		});
		break;
	}

	case 'points': {
		if (ds.raster)
			g = range.call(this, svg_interval);

		e = points_symbol({
			"size":        24,
			"fill":        ds.vectors.fill,
			"stroke":      ds.vectors.stroke,
			"strokewidth": 2,
		});
		break;
	}

	case 'lines-timeline': {
		e = points_symbol({
			"size":        24,
			"fill":        ds.vectors.fill,
			"stroke":      ds.vectors.stroke,
			"strokewidth": 2,
		});
		break;
	}

	case 'lines': {
		if (ds.raster)
			g = range.call(this, svg_interval);

		e = lines_symbol({
			"size":      28,
			"dasharray": ds.vectors.dasharray,
			"stroke":    ds.vectors.stroke,
			"width":     ds.vectors.width * 2,
			"fill":      'none',
		});
		break;
	}

	case 'polygons-boundaries': {
		e = polygons_symbol({
			"size":        28,
			"fill":        ds.vectors.fill,
			"opacity":     ds.vectors.opacity,
			"stroke":      ds.vectors.stroke,
			"strokewidth": (ds.vectors.width - 1) || 1,
		});
		break;
	}

	case 'polygons': {
		if (ds.raster)
			g = range.call(this, svg_interval);

		e = polygons_symbol({
			"size":        28,
			"fill":        ds.vectors.fill,
			"opacity":     ds.vectors.opacity,
			"stroke":      ds.vectors.stroke,
			"strokewidth": (ds.vectors.width - 1) || 1,
		});
		break;
	}

	case 'polygons-valued':
	case 'polygons-timeline': {
		g = range.call(this, svg_interval_transparent);

		o = ce(
			'span',
			[
				ce('div', null, {
					"style": `
	display: inline-block;
	width: 64px;
	height: 5px;
	background-color: rgba(155,155,155,1);
	margin: 15px 15px 0 0;
	`,
				}),
				ce('div', "Not Available", { "style": "display: inline-block; font-size: x-small;" }),
			]);

		break;
	}

	case 'raster-valued-mutant':
	case 'raster-valued':	{
		if (this.ds._domain_select)
			g = value_multiselect.call(this);

		break;
	}

	case 'raster-mutant':
	case 'raster-timeline':
	case 'raster': {
		g = range.call(this, svg_interval_transparent);

		break;
	}

	case 'table': {
		qs('content', this).remove();
		break;
	}

	default: {
		console.warn("dscard.range_el could not decide datatype.", ds.id);
		break;
	}
	}

	if (ds.domain && !ds._domain_select) {
		r = tmpl('#ramp');
		qs('.ramp', r).append(...ramp_domain.call(this));
	}

	d.append(
		...coalesce(maybe((this.range_el = g), 'elements'), []),
		coalesce(t, ""),
		coalesce(r, ""),
		coalesce(o, ""),
		coalesce(e, ""),
	);

	return d;
};

export function init() {
	sortable(cards_list, {
		'items':                'ds-card',
		'forcePlaceholderSize': true,
		'placeholder':          '<div style="margin: 1px; background-color: rgba(0,0,0,0.3);"></div>',
	})[0]
		.addEventListener(
			'sortupdate',
			_ => O.sort(),
		);

	const ca = ce('span', 'Clear all datasets', { "class": 'cards-clear' });
	ca.onclick = _ => {
		DS.all("on").forEach(x => x.active(false));
		O.view = U.view;
		update();
	};

	const cp = ce('span', 'Clear filters', { "class": 'cards-clear' });
	cp.onclick = _ => {
		DS.all("on").forEach(d => {
			O.ds(d, { "domain": d.domain });
			d.card.refresh();
		});

		O.view = U.view;
	};

	qs('#cards #cards-clear-buttons').append(ca,cp);
};

export function update() {
	const list = DS.all("on")
		.map(d => d.card)
		.filter(c => c); // some datasets (eg boundaries)

	const cards = dscard.all;

	if (cards.length) sortable(cards_list, 'disable');

	for (let i of list) {
		if (!cards_list.contains(i)) cards_list.prepend(i);
		i.refresh();
	}

	if (cards.length) sortable(cards_list, 'enable');
};

export default class dscard extends HTMLElement {
	manual_min;
	manual_max;

	constructor(d) {
		if (!(d instanceof DS)) throw new Error(`dscard: Expected a ds but got ${d}`);
		super();

		if (d.disabled) return undefined;

		this.ds = d;

		this.opacity_value = 1;

		this.show_advanced = false;

		this.render();

		return this;
	};

	render() {
		this.setAttribute('bind', this.ds.id);

		this.content = qs('content', this);

		if (this.ds.category.controls.weight)
			this.weight_group = weight.call(this.ds);

		if (this.ds.mutant) mutant_options.call(this);

		attach.call(this, tmpl('#ds-card-template'));

		slot_populate.call(this, Object.assign({}, this.ds, {
			'range':   range_el.call(this),
			'info':    this.info(),
			'opacity': this.opacity(),
			'close':   this.close(),
			'weight':  maybe(this.weight_group, 'el'),
			'ctrls':   maybe(this.weight_group, 'el') && this.ctrls(),
			'list':    this.list_elements(),
		}));

		this.legends();

		return this;
	};

	disable() {
		this.remove();
	};

	refresh() {
		qs('[slot=range]', this)
			.replaceChildren(this.range_el = range_el.call(this));

		this.opacity_value = 1;
		qs('[slot=opacity]', this)
			.replaceChildren(this.opacity());
	};

	legends() {
		if (!this.ds.criteria || this.ds.criteria.length < 2) return;

		const ul = ce('div', null, { "style": "font-size: smaller;" });

		let f;
		switch (this.ds.datatype) {
		case "lines":
			f = lines_legends_svg;
			break;

		case "points":
			f = points_legends_svg;
			break;

		case "polygons":
			f = polygons_legends_svg;
			break;

		default:
			break;
		}

		for (let l of this.ds.criteria) {
			let cb;

			const li = ce(
				'div',
				[
					f.call(this, l),
					ce('span', l.params.map(p => l[p] ?? 'default').slice(1).join(", ")),
					cb = ce('input', null, { "type": 'checkbox', "checked": '' }),
				],
				{
					"style": `display: flex; justify-content: space-between;`,
				},
			);

			cb.onchange = _ => {
				const fs = this.ds.vectors.geojson.features;

				for (let i = 0; i < fs.length; i += 1)
					if (same(fs[i].properties['__criteria'], l))
						fs[i].properties['__visible'] = cb.checked;

				MAPBOX.getSource(this.ds.id).setData(this.ds.vectors.geojson);
			};

			ul.append(li);
		}

		this.legends_el = ul;

		qs('[slot=range]', this).append(ul);
	};

	list_elements() {
		if (!this.ds.vectors?.geojson) return "";

		const e = font_icon('table');
		e.onclick = this.ds.features_table_modal.bind(this.ds);

		return e;
	};

	info() {
		const e = font_icon('info-circle');
		e.onclick = this.ds.info_modal.bind(this.ds);

		return e;
	};

	ctrls() {
		const e = font_icon('gear');
		e.onclick = _ => qs('.advanced-controls', this).style.display = ((this.show_advanced = !this.show_advanced)) ? 'block' : 'none';

		return e;
	}

	close() {
		const e = font_icon('x-lg');
		e.onclick = O.ds.bind(null, this.ds, { 'active': false });

		return e;
	};

	opacity() {
		return opacity_control({
			"fn": x => {
				this.opacity_value = x;
				this.ds.opacity(x);
			},
			"init": maybe(this.ds, 'vectors', 'opacity'),
		});
	};

	discover() {
		toggle_left_panel('cards');
		this.scrollIntoView();
	}

	static get all() {
		return qsa('ds-card', cards_list, true);
	};
};

customElements.define('ds-card', dscard);
