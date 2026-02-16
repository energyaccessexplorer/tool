import DS from './ds.js';

import bind from '../lib/bind.js';

import bubblemessage from '../lib/bubblemessage.js';

import {
	colorscale_svg,
	svg_interval,
	uniform_split,
} from './utils.js';

import {
	lines_symbol,
	points_symbol,
	polygons_symbol,
} from './symbols.js';

import {
	left_panel,
	sort,
} from './a.js';

import {
	and,
	ce,
	coalesce,
	debounce,
	maybe,
	or,
	qs,
	qsa,
	same,
	tmpl,
} from '../lib/helpers.js';

const cards_list = qs('#cards-list');

const slider_width = 320;

function mutant_options() {
	if (!maybe(this.ds, 'hosts', 'length')) return "";

	const ds = this.ds;

	const container = ce('div', null, { "class": 'control-option' });
	const select = ce('select');

	ds.hosts.forEach(d => select.append(ce('option', d.name, { "value": d.id })));

	select.value = ds.host.id;

	select.onchange = e => {
		const host = DST.get(e.target.value);

		ds.selection = [e.target.value];

		ds.mutate(host)
			.then(_ => this.bind())
			.then(_ => COMMIT("layers"));
	};

	container.append(select);

	return container;
};

function value_checkboxes() {
	const ds = this.ds;

	if (!ds._domain_select) return null;

	switch (ds.type) {
	case 'raster-valued-mutant':
	case 'raster-valued':	{
		break;
	}

	default:
		return null;
	};

	const pick = _ => {
		this.checkboxes = qsa('.checkbox-row > input', this, true);
		ds._domain_select = [...new Set(this.checkboxes.filter(i => i.checked).map(i => +i.value))];

		if (ds.host) ds.host._domain_select = ds._domain_select;
	};

	const change = _ => {
		pick();
		COMMIT("datasets");
	};

	const payload = ds.csv.data.map(x => ({
		"name":    x[ds.csv.column],
		"value":   x[ds.csv.key],
		"color":   d => d.style['background-color'] = `rgba(${ds.colorscale.fn(+x[ds.csv.key])})`,
		"checked": (!ds._domain_select.length ? true : ds._domain_select.indexOf(x[ds.csv.key]) > -1),
		change,
	}));

	return payload;
};

function manual_inputs() {
	const ds = this.ds;
	const cat = this.ds.category;

	if (!ds.domain) return "";

	const {min,max} = ds.domain;

	const input_change = (e,i) => {
		const v = +e.value;
		const d = ds._domain;

		if (or(
			v < min,
			v > max,
			and(i === 'min', v > d['max']),
			and(i === 'max', v < d['min']),
		)) {
			e.reportValidity();
			e.setCustomValidity("Value out of range");
			return;
		}

		d[i] = v;

		this.values(d);
	};

	const step = maybe(ds, 'raster', 'intervals') ? undefined :
		0.1 * Math.pow(10, Math.floor(Math.log10(Math.abs(max - min))));

	this.manual_min = ce('input', null, {
		"type":  "number",
		"min":   min,
		"max":   max,
		"step":  step,
		"value": ds._domain.min,
	});

	this.manual_min.oninput = debounce(input_change.bind(null, this.manual_min, 'min'), 600);

	this.manual_max = ce('input', null, {
		"type":  "number",
		"min":   min,
		"max":   max,
		"step":  step,
		"value": ds._domain.max,
	});

	this.manual_max.oninput = debounce(input_change.bind(null, this.manual_max, 'max'), 600);

	switch (maybe(cat, 'controls', 'range')) {
	case 'single':
		this.manual_min = null;
		break;

	case 'double':
		break;

	case null:
	case 'none':
	default:
		this.manual_min = null;
		this.manual_max = null;
		break;
	}

	return (this.manual_min || this.manual_max);
};

function range() {
	const ds = this.ds;
	const cat = this.ds.category;

	switch (ds.type) {
	case 'points':
	case 'lines':
	case 'polygons':
	case 'polygons-valued':
	case 'polygons-timeline':
	case 'raster-mutant':
	case 'raster-timeline':
	case 'raster': {
		break;
	}

	default:
		return null;
	}

	const {min,max} = ds.domain;

	const diff = Math.abs(max - min);
	let f = 3 - Math.ceil(Math.log10(diff || 1));
	if (f < 0) f = 0;

	if (and(cat.unit === "%",
	        or(and(min === 0, max === 100),
	           and(min === 100, max === 0)))) f = 0;

	let steps;
	if (maybe(cat, 'controls', 'range_steps')) {
		steps = [];
		const s = (max - min) / (cat.controls.range_steps - 1);

		for (let i = 0; i < cat.controls.range_steps; i += 1)
			steps[i] = min + (s * i);
	}

	const svg_change = (v, i) => {
		const d = ds._domain;
		d[i] = this.ds.fn.invert(parseFloat(v));
	};

	this.range_svg = svg_interval({
		"sliders":      ds.category.controls.range,
		"width":        slider_width,
		"height":       8,
		"radius":       10,
		"init":         {
			"min": this.ds.fn(ds._domain.min),
			"max": this.ds.fn(ds._domain.max),
		},
		"steps":        steps,
		"callback1":    v => svg_change(v, 'min'),
		"callback2":    v => svg_change(v, 'max'),
		"end_callback": _ => {
			this.values();
			COMMIT("datasets");
		},
	});

	return this.range_svg;
};

function weight_group() {
	const ds = this.ds;

	if (!ds.category.controls.weight) return null;

	const el = ce('select', null, { "bind": 'weight' });

	el.prepend(
		...["Low", "Low-Medium", "Medium", "Medium-High", "High"]
			.map((e,i) => ce('option', e, { "value": i + 1 }))
			.reverse());

	el.value = ds.weight;

	el.onchange = e => {
		ds.weight = +e.target.value;
		COMMIT("datasets");
	};

	this.weight = el;

	return el;
};

function specs() {
	if (!this.ds.criteria || this.ds.criteria.length < 2) return;

	let f;
	switch (this.ds.type) {
	case "lines":
		f = x => lines_symbol({
			"size":             20,
			"stroke":           x['stroke'] || 'black',
		});
		break;

	case "points":
		f = x => points_symbol({
			"size":         20,
			"fill":         this.ds.vectors.fill,
			"stroke":       x['stroke'] || 'black',
			"stroke-width": x['stroke-width'],
		});
		break;

	case "polygons":
		f = x => polygons_symbol({
			"size":   20,
			"fill":   this.ds.vectors.fill,
			"stroke": x['stroke'],
		});
		break;

	default:
		break;
	}

	return this.ds.criteria.map(l => {
		const id = l[l.params[0]] || 'default';

		const change = (d,e) => {
			this.checkboxes = qsa('.checkbox-row > input', this, true);

			this.ds.selection = this.checkboxes
				.filter(c => c.checked)
				.map(c => c.value || 'default');

			const fs = this.ds.vectors.data.features;
			for (let i = 0; i < fs.length; i += 1)
				if (same(fs[i].properties['__criteria'], l))
					fs[i].properties['__visible'] = e.target.checked;

			MAPBOX.getSource(this.ds.id).setData(this.ds.vectors.data);
		};

		this.ds.selection.push(id);

		return {
			"csymbol": f.call(this, l),
			"cname":   l.params.map(p => l[p] ?? 'default').join(", "),
			"checked": true,
			change,
		};
	});
};

function symbol() {
	let e;
	const ds = this.ds;

	switch (ds.type) {
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
		e = points_symbol({
			"size":        24,
			"fill":        ds.vectors.fill,
			"stroke":      ds.vectors.stroke,
			"strokewidth": 2,
		});
		break;
	}

	case 'lines-timeline': {
		e = lines_symbol({
			"size":        24,
			"stroke":      ds.vectors.stroke,
		});
		break;
	}

	case 'lines': {
		e = lines_symbol({
			"size":      24,
			"stroke":    ds.vectors.stroke,
		});
		break;
	}

	case 'polygons-boundaries': {
		e = polygons_symbol({
			"size":        24,
			"fill":        ds.vectors.fill,
			"opacity":     ds.vectors.opacity,
			"stroke":      ds.vectors.stroke,
			"strokewidth": (ds.vectors.width - 1) || 1,
		});
		break;
	}

	case 'polygons': {
		e = polygons_symbol({
			"size":        28,
			"fill":        ds.vectors.fill,
			"opacity":     ds.vectors.opacity,
			"stroke":      ds.vectors.stroke,
			"strokewidth": (ds.vectors.width - 1) || 1,
		});
		break;
	}

	case 'polygons-valued': {
		break;
	}

	case 'raster-valued-mutant':
	case 'raster-valued':	{
		break;
	}

	case 'raster-mutant':
	case 'raster-timeline':
	case 'raster': {
		break;
	}

	case 'polygons-timeline': {
		e = polygons_symbol({
			"size":        28,
			"fill":        ds.vectors.fill,
			"opacity":     ds.vectors.opacity,
			"stroke":      ds.vectors.stroke,
			"strokewidth": (ds.vectors.width - 1) || 1,
		});
		break;
	}

	case 'table': {
		break;
	}

	default: {
		break;
	}
	}

	if (e instanceof Node)
		e.classList.add('svg-symbol');

	return e;
};

function colorscale() {
	if (!this.ds.colorscale) return null;

	let bubble;

	function mouseenter(t, _i, message) {
		if (!message) return;
		bubble = new bubblemessage({ message, "position": "E", "close": false, "noevents": true }, t);
	};

	function mouseleave() {
		if (bubble) bubble.remove();
	};

	switch (this.ds.type) {
	case 'polygons-valued':
	case 'polygons-timeline':
	case 'raster-mutant':
	case 'raster-timeline':
	case 'raster': {
		let x = i => i;

		if (this.ds.raster.intervals) {
			x = i => this.ds.colorscale.intervals[i] + " - " + this.ds.colorscale.intervals[i+1];
		} else {
			const s = uniform_split(this.ds.colorscale.stops.length + 1);
			x = i => this.ds.fn.invert(s[i]).toFixed(2) + " - " + this.ds.fn.invert(s[i+1]).toFixed(2);
		}

		return colorscale_svg(
			this.ds.colorscale.stops,
			16,
			(t,i) => mouseenter(t, i, x(i)),
			mouseleave,
		);
	}

	case 'raster-valued':
	case 'raster-valued-mutant': {
		const ds = this.ds.hosts ? this.ds.host : this.ds;
		return colorscale_svg(
			ds.colorscale.stops,
			16,
			(t,i) => mouseenter(t, i, maybe(ds.csv.table, i)),
			mouseleave,
		);
	}

	default:
		return null;
	}
};

function ramp() {
	const ds = this.ds.hosts ? this.ds.host : this.ds;
	const cat = this.ds.category;

	if (!ds.domain) return "";

	if (ds._domain_select) return bind(tmpl('#ramp'), {
		"middle": coalesce(cat.controls.range_label, cat.unit),
	});

	const {min,max} = ds.domain;

	const diff = Math.abs(max - min);
	let i = 3 - Math.ceil(Math.log10(diff || 1));
	if (i < 0) i = 0;

	if (and(cat.unit === "%",
	        or(and(min === 0, max === 100),
	           and(min === 100, max === 0)))) i = 0;

	return bind(tmpl('#ramp'), {
		"left":   min.toFixed(i),
		"middle": coalesce(cat.controls.range_label, cat.unit, 'range'),
		"right":  max.toFixed(i),
	});
};

function opacity() {
	this.opacity = svg_interval({
		"init":      { "min": 0, "max": this.opacity_value },
		"sliders":   'single',
		"height":    8,
		"radius":    10,
		"callback2": x => {
			this.opacity_value = x;
			this.ds.opacity(x);
		},
	});

	return this.opacity.svg;
};

export function init() {
	sortable(cards_list, {
		'items':                'ds-card',
		'forcePlaceholderSize': true,
		'placeholder':          '<div style="margin: 1em;"></div>',
	})[0]
		.addEventListener('sortupdate', _ => {
			sort(maybe(sortable(cards_list, 'serialize'), 0, 'items').map(c => c.node.ds));
			COMMIT();
		});

	const remove_all = function() {
		STATE.datasets.forEach(x => x.turn(false));
		COMMIT("datasets");
		update();
	};

	let visible = true;
	const visible_all = function() {
		visible = !visible;

		STATE.datasets.forEach(x => x.visibility(visible));

		qs('span', this).innerText = visible ? "Hide all layers" : "Show all layers";
		qs('i', this).className = visible ? 'bi-eye-slash-fill' : 'bi-eye-fill';
	};

	const reset_all = function() {
		STATE.datasets.forEach(d => {
			d._domain = Object.assign({}, d.domain, d.category.domain_init);
			d._domain_select = d.domain_select ? [...d.domain_select] : undefined;
			d.weight = 3;
			d.opacity(1);

			d.card.values();

			if (d.vectors?.data) {
				const fs = d.vectors.data.features;
				for (let i = 0; i < fs.length; i += 1)
					fs[i].properties['__visible'] = true;

				MAPBOX.getSource(d.id).setData(d.vectors.data);
			}

			COMMIT("datasets");
		});
	};

	let collapsed = true;
	const expand_all = function() {
		collapsed = !collapsed;

		STATE.datasets.forEach(d => d.card.toggle_settings(!collapsed));

		qs('span', this).innerText = collapsed ? "Expand all settings" : "Collapse all settings";
		qs('i', this).className = collapsed ? 'bi-arrows-angle-expand' : 'bi-arrows-angle-contract';
	};

	bind(qs('#cards #cards-buttons'), {
		remove_all,
		visible_all,
		reset_all,
		expand_all,
	});
};

export function update() {
	const list = STATE.datasets
		.map(d => d.card)
		.filter(c => c);

	if (list.length) sortable(cards_list, 'disable');

	cards_list.append(...list);

	if (list.length) sortable(cards_list, 'enable');
};

function settings(_, button, value) {
	if (value === null || value === undefined) {
		this.show_settings = !this.show_settings;
	} else {
		this.show_settings = value;
	}

	qs('aside', this).style.display = this.show_settings ? 'block' : 'none';
	qs('i', button).className = this.show_settings ? 'bi-chevron-up' : 'bi-chevron-down';
};

export default class dscard extends HTMLElement {
	manual_min;
	manual_max;

	checkboxes = [];

	show_settings = false;
	opacity_value = 1;

	constructor(d) {
		if (!(d instanceof DS)) throw new Error(`dscard: Expected a ds but got ${d}`);
		super();

		if (d.disabled) return undefined;

		this.ds = d;

		this.render();

		return this;
	};

	render() {
		this.append(tmpl('#card-template'));

		this.bind();

		return this;
	};

	bind() {
		bind(this, Object.assign({}, this.ds, {
			"unit-label":       coalesce(this.ds.category.controls.range_label, this.ds.category.unit, "Range"),
			"range":            maybe(range.call(this), 'svg'),
			"value-checkboxes": value_checkboxes.call(this),
			"pvna":             (this.ds.type === 'polygons-valued'),
			"info":             this.ds.info_modal.bind(this.ds),
			"index":            coalesce(this.ds.index, "Filter").replace(/(ani|eai)/, "Filter"),
			"specs":            specs.call(this),
			"symbol":           symbol.call(this),
			"colorscale":       colorscale.call(this),
			"ramp":             ramp.call(this),
			"visibility":       (_, e) => this.ds.visibility(e.target.checked),
			"opacity":          opacity.call(this),
			"close":            _ => { this.ds.turn(false); COMMIT("datasets"); },
			"weight-group":     weight_group.call(this),
			"settings":         (_, e) => settings.call(this, _, e.target.closest('button')),
			"table":            this.ds.features_table_modal.bind(this.ds),
			"manual-inputs":    manual_inputs.call(this),
			"manual-min":       this.manual_min,
			"manual-max":       this.manual_max,
			"mutant-options":   mutant_options.call(this),
		}), { "final": false });
	};

	disable() {
		this.remove();
	};

	values(d) {
		if (d === undefined) d = this.ds._domain;

		if (this.manual_min) this.manual_min.value = d['min'];
		if (this.manual_max) this.manual_max.value = d['max'];

		if (this.weight) this.weight.value = this.ds.weight;

		this.opacity_value = this.ds.opacity;
		this.opacity.change({
			"min": 0,
			"max": 1,
		});

		if (this.range_svg) {
			this.range_svg.change({
				"min": this.ds.fn(d['min']),
				"max": this.ds.fn(d['max']),
			});
		}

		for (const c of this.checkboxes) c.checked = true;

		COMMIT("datasets");
	};

	discover() {
		left_panel('cards');
		this.scrollIntoView();
	};

	toggle_settings(v) {
		settings.call(this, null, qs('button[bind-func=settings]', this), v);
	};
};

customElements.define('ds-card', dscard);
