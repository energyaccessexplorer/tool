import DS from './ds.js';

function points_symbol(opts) {
	const {size,fill,stroke,strokewidth} = opts;

	const svg = d3.create('svg')
		.attr('class', 'svg-point')
		.attr('width', size)
		.attr('height', size);

	svg
		.append('circle')
		.attr('r', (size/2) - 2)
		.attr('cx', size/2)
		.attr('cy', size/2)
		.attr('fill', fill)
		.attr('stroke', stroke)
		.attr('stroke-width', strokewidth);

	return svg.node();
};

function lines_symbol(opts) {
	const {size,dasharray,stroke,width,fill} = opts;

	const svg = d3.create('svg')
		.attr('width', size)
		.attr('height', size);

	svg
		.append('path')
		.attr('d', "M 0.5625,23.71875 C 2.0625,8.0625 14.439788,10.706994 17.625,7.5 20.810212,4.2930056 23.71875,0.375 23.71875,0.375")
		.attr('fill', fill)
		.attr('stroke-dasharray', dasharray)
		.attr('stroke', stroke)
		.attr('stroke-width', width * 2);

	return svg.node();
};

function polygons_symbol(opts) {
	const {size,stroke,strokewidth,fill,opacity} = opts;

	const svg = d3.create('svg')
		.attr('class', 'svg-polygon')
		.attr('width', size)
		.attr('height', size);

	svg
		.append('path')
		.attr('d', "M 5.5532202,7.3474994 24.062506,2.1642083 26.51526,25.827 1.3896115,25.827438 Z")
		.attr('fill', fill)
		.attr('fill-opacity', opacity)
		.attr('stroke', stroke)
		.attr('stroke-width', strokewidth);

	return svg.node();
};

function lines_legends_svg(l) {
	const svg = d3.create('svg')
		.attr('width', 24)
		.attr('height', 24)
		.attr('style', "vertical-align: middle;")
		.attr('viewBox', "-3 0 32 32");

	svg
		.append('path')
		.attr('d', "M 0.5625,23.71875 C 2.0625,8.0625 14.439788,10.706994 17.625,7.5 20.810212,4.2930056 23.71875,0.375 23.71875,0.375")
		.attr('fill', 'none')
		.attr('stroke', l['stroke'] || 'black')
		.attr('stroke-width', l['stroke-width']);

	return svg.node();
};

function points_legends_svg(l) {
	const svg = d3.create('svg')
		.attr('width', 24)
		.attr('height', 24)
		.attr('style', "vertical-align: middle;")
		.attr('viewBox', "-3 0 32 32");

	svg.append('circle')
		.attr('r', 10)
		.attr('cx', 12)
		.attr('cy', 12)
		.attr('fill', this.ds.vectors.fill)
		.attr('stroke', l['stroke'] || 'black')
		.attr('stroke-width', l['stroke-width']);

	return svg.node();
}

function polygons_legends_svg(l) {
	const svg = d3.create('svg')
		.attr('width', 24)
		.attr('height', 24)
		.attr('style', "vertical-align: middle;")
		.attr('viewBox', "-3 0 32 32");

	svg
		.append('path')
		.attr('d', "M 5.5532202,7.3474994 24.062506,2.1642083 26.51526,25.827 1.3896115,25.827438 Z")
		.attr('fill', this.ds.vectors.fill)
		.attr('stroke', l['stroke']);

	return svg.node();
}

function svg_el() {
	const ds = this.ds;
	let d = ce('div');
	let e = maybe(ds.colorscale, 'svg') || ce('div');

	function ramp_values({min, max}) {
		const diff = Math.abs(max - min);
		let i = 3 - Math.ceil(Math.log10(diff || 1));
		if (i < 0) i = 0;

		return [
			ce('div', min.toFixed(i) + ""),
			ce('div', max.toFixed(i) + "")
		];
	}

	switch (ds.datatype) {
	case 'points': {
		e = points_symbol({
			size: 24,
			fill: ds.vectors.fill,
			stroke: ds.vectors.stroke,
			strokewidth: 2,
		});
		break;
	}

	case 'lines': {
		e = lines_symbol({
			size: 28,
			dasharray: ds.vectors.dasharray,
			stroke: ds.vectors.stroke,
			width: ds.vectors.width * 2,
			fill: 'none'
		});
		break;
	}

	case 'polygons':
	case 'polygons-boundaries': {
		e = polygons_symbol({
			size: 28,
			fill: ds.vectors.fill,
			opacity: ds.vectors.opacity,
			stroke: ds.vectors.stroke,
			strokewidth: (ds.vectors.width - 1) || 1
		});
		break;
	}

	case 'polygons-fixed':
	case 'polygons-timeline': {
		const r = tmpl('#ramp');

		if (ds.domain) {
			qs('.ramp', r).append(...ramp_values(ds.domain));
		}

		d.append(
			r,
			ce('div', null, { style: "display: inline-block; width: 64px; height: 5px; background-color: rgba(155,155,155,1); margin: 15px 15px 0 0;" }),
			ce('div', "Not Available", { style: "display: inline-block; font-size: x-small;" })
		);

		break;
	}

	case 'raster-mutant':
	case 'raster': {
		let r = tmpl('#ramp');

		if (ds.domain) {
			qs('.ramp', r).append(...ramp_values(ds.domain));
			d.append(r);
		}

		break;
	}

	default: {
		console.warn("dscard.svg could not be set.", ds.id);
		break;
	}
	}

	if (ds.items) {
		const el = ce('ul', null, { class: 'collection' });

		for (let d of ds.items) {
			let li = ce('li');

			li.append(d.card.svg_el, ce('div', d.name, { class: 'subheader' }));
			el.append(li);
		}

		return el;
	}

	d.prepend(e);

	return d;
}

export function init() {
	const list = qs('#cards-pane #cards-list');

	sortable(list, {
		'items': 'ds-card',
		'forcePlaceholderSize': true,
		'placeholder': '<div style="margin: 1px; background-color: rgba(0,0,0,0.3);"></div>',
	})[0]
		.addEventListener(
			'sortupdate',
			e => O.datasets = e.detail.destination.items.map(i => i.getAttribute('bind'))
		);

	const ca = ce('div', 'Clear all datasets', { "id": 'cards-clear-all' });
	ca.onclick = _ => {
		O.datasets = [];

		DS.array
			.filter(x => x.on)
			.forEach(x => x.active(false));

		O.view = U.view;
	};

	qs('#cards-pane').prepend(ca);
};

export function update() {
	const cards_list = qs('#cards-pane #cards-list');

	const ldc = U.inputs.reverse().map(i => DST.get(i).card);
	const empty = cards_list.children.length === 0;

	if (!empty) sortable('#cards-list', 'disable');

	for (let i of ldc)
		if (!cards_list.contains(i)) cards_list.prepend(i);

	if (!empty) sortable('#cards-list', 'enable');
};

export default class dscard extends HTMLElement {
	constructor(d) {
		if (!(d instanceof DS)) throw Error(`dscard: Expected a DS. Got ${d}.`);
		super();

		if (d.disabled) return undefined;

		this.ds = d;

		this.opacity_value = 1;

		this.render();

		return this;
	};

	render() {
		this.setAttribute('bind', this.ds.id);

		this.svg_el = svg_el.call(this);

		attach.call(this, shadow_tmpl('#ds-card-template'));

		slot_populate.call(this, this.ds);

		slot_populate.call(this, {
			'svg': this.svg_el,
			'info': this.info(),
			'unit': (this.ds.category.unit && ce('span', `[${this.ds.category.unit}]`, { style: "margin-left: 1em;" })),
			'opacity': this.opacity(),
			'close': this.close(),
		});

		return this;
	};

	disable() {
		this.remove();
	};

	refresh() {
		qs('[slot=svg]', this)
			.replaceChildren(this.svg_el = svg_el.call(this));

		this.opacity_value = 1;
		qs('[slot=opacity]', this)
			.replaceChildren(this.opacity());
	};

	legends(ls, t) {
		const it = qs('[slot=svg]', this);

		const ul = ce('div', null, { style: "font-size: smaller;" });

		let f;
		switch (t) {
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

		for (let l of ls) {
			const li = ce('div');
			li.append(f.call(this, l), ce('span', '&nbsp;&nbsp;&nbsp;'), l.params.map(p => l[p]).join(", "));

			ul.append(li);
		}

		it.replaceChildren(ul);
	};

	info() {
		const e = font_icon('info-circle');
		e.onclick = _ => this.ds.info_modal();

		return e;
	};

	close() {
		const e = font_icon('x-lg');
		e.onclick = _ => O.dataset(this.ds, 'active', false);

		return e;
	};

	opacity() {
		return ea_opacity_control({
			fn: x => {
				this.opacity_value = x;
				this.ds.opacity(x);
			},
		});
	};
};

customElements.define('ds-card', dscard);
