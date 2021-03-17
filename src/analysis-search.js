import {
	pointer as mapbox_pointer,
} from './mapbox.js';

import {
	plot_active as analysis_plot_active
} from './analysis.js';

export function setup() {
	const root = qs('#analysis.search-panel');
	const input = ce('input', null, { id: 'analysis-search', autocomplete: 'off', class: 'search-input' });
	input.setAttribute('placeholder', "Analysis range: 50 - 100");

	root.prepend(input);

	const resultscontainer = qs('#analysis .search-results');
	const ul = ce('ul');
	resultscontainer.append(ul);

	const maparea = qs('#maparea');

	let resultsinfo;
	let pointer;

	console.log(resultsinfo, resultscontainer, pointto, pointer);

	function pointto(p) {
		const {x,y} = MAPBOX.project(p.i);
		const e = ce('div', null);
		e.style = `background-color: rgb(${ea_analysis_colorscale.fn(p.v)}); width: 1em; height: 1em;`;

		const dict = [[ "v", "" ]];
		const props = { v: e.outerHTML };

		const td = table_data(dict, props);

		const box = maparea.getBoundingClientRect();
		const mbp = mapbox_pointer(td, box.x + x, box.y + y);

		return mbp;
	};

	function li(p) {
		const el = ce('li', Math.round((p.v).toFixed(2) * 100) + " " + JSON.stringify((p.i).map(c => +c.toFixed(3))), {});
		el.onmouseenter = _ => {
			if (pointer) pointer.drop();
			pointer = pointto(p);
		};

		return el;
	};

	input.oninput = async function(_) {
		elem_empty(ul);

		const v = parseFloat(this.value);
		if (isNaN(v)) return;
		if (v < 50 || v > 100) return;

		const results = await getpoints(v/100);

		results
			.sort((a,b) => a.v > b.v ? 1 : -1)
			.slice(0, 100)
			.forEach(t => ul.append(li(t)));
	};
};

async function getpoints(threshold) {
	const raster = await analysis_plot_active(U.output, false);
	const points = raster.reduce(function(a,v,i) { if (v > threshold) a.push({i,v}); return a; }, []);

	const ref = DST.get('boundaries').raster;

	return points.map(t => ({ v: t.v, i: ea_raster_in_coordinates(t.i, ref, GEOGRAPHY.bounds)}));
};

export function init() {
	setup();
};
