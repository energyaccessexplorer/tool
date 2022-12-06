import DS from './ds.js';

import {
	points_symbol,
	lines_symbol,
	polygons_symbol,
	lines_legends_svg,
	points_legends_svg,
	polygons_legends_svg,
} from './symbols.js';

function svg_el() {
	const ds = this.ds;
	let d = ce('div');
	let e = maybe(ds.colorscale, 'svg') || ce('div');

	function ramp_domain() {
		let {min,max} = this.ds.domain;

		const diff = Math.abs(max - min);
		let i = 3 - Math.ceil(Math.log10(diff || 1));
		if (i < 0) i = 0;

		if (and(this.ds.category.unit === "%",
		        or(and(min === 0, max === 100),
		           and(min === 100, max === 0)))) i = 0;

		return [
			ce('div', min.toFixed(i)),
			ce('div', max.toFixed(i)),
		];
	};

	switch (ds.datatype) {
	case 'points-timeline':
	case 'points': {
		e = points_symbol({
			"size":        24,
			"fill":        ds.vectors.fill,
			"stroke":      ds.vectors.stroke,
			"strokewidth": 2,
		});
		break;
	}

	case 'lines-timeline':
	case 'lines': {
		e = lines_symbol({
			"size":      28,
			"dasharray": ds.vectors.dasharray,
			"stroke":    ds.vectors.stroke,
			"width":     ds.vectors.width * 2,
			"fill":      'none',
		});
		break;
	}

	case 'polygons-boundaries':
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

	case 'polygons-valued':
	case 'polygons-timeline': {
		const r = tmpl('#ramp');

		if (ds.domain) {
			qs('.ramp', r).append(...ramp_domain.call(this));
		}

		d.append(
			r,
			ce('div', null, { "style": "display: inline-block; width: 64px; height: 5px; background-color: rgba(155,155,155,1); margin: 15px 15px 0 0;" }),
			ce('div', "Not Available", { "style": "display: inline-block; font-size: x-small;" }),
		);

		break;
	}

	case 'raster-mutant':
	case 'raster-timeline':
	case 'raster': {
		const r = tmpl('#ramp');

		if (ds.domain) {
			qs('.ramp', r).append(...ramp_domain.call(this));
			d.append(r);
		}

		break;
	}

	case 'table': {
		break;
	}

	default: {
		console.warn("dscard.svg_el could not decide datatype.", ds.id);
		break;
	}
	}

	d.prepend(e);

	return d;
};

export function init() {
	const list = qs('#cards #cards-list');

	sortable(list, {
		'items':                'ds-card',
		'forcePlaceholderSize': true,
		'placeholder':          '<div style="margin: 1px; background-color: rgba(0,0,0,0.3);"></div>',
	})[0]
		.addEventListener(
			'sortupdate',
			e => O.inputs = e.detail.destination.items.map(i => i.getAttribute('bind')),
		);

	const ca = ce('div', 'Clear all datasets', { "id": 'cards-clear-all' });
	ca.onclick = _ => {
		O.inputs = [];

		DS.array
			.filter(x => x.on)
			.forEach(x => x.active(false));

		O.view = U.view;
	};

	qs('#cards').prepend(ca);
};

export function update() {
	const cards_list = qs('#cards #cards-list');

	const ldc = U.inputs.reverse().map(i => DST.get(i).card);
	const empty = cards_list.children.length === 0;

	if (!empty) sortable('#cards-list', 'disable');

	for (let i of ldc)
		if (!cards_list.contains(i)) cards_list.prepend(i);

	if (!empty) sortable('#cards-list', 'enable');
};

export default class dscard extends HTMLElement {
	constructor(d) {
		if (!(d instanceof DS)) throw new Error(`dscard: Expected a ds but got ${d}`);
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

		attach.call(this, tmpl('#ds-card-template'));

		slot_populate.call(this, Object.assign({}, this.ds, {
			'svg':     this.svg_el,
			'info':    this.info(),
			'unit':    (this.ds.category.unit && ce('span', `[${this.ds.category.unit}]`, { "style": "margin-left: 1em;" })),
			'opacity': this.opacity(),
			'close':   this.close(),
		}));

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

	legends() {
		if (this.ds.criteria.length < 2) return;

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

		qs('[slot=svg]', this).append(ul);
	};

	info() {
		const e = font_icon('info-circle');
		e.onclick = this.ds.info_modal.bind(this.ds);

		return e;
	};

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
};

customElements.define('ds-card', dscard);
