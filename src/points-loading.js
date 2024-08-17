import {
	coordinates_to_raster_pixel,
} from './utils.js';

import bubblemessage from '../lib/bubblemessage.js';

import modal from '../lib/modal.js';

import {
	coords_search_pois as mapbox_coords_search_pois,
	info_mode_change,
} from './mapbox.js';

import {
	plot_active as analysis_plot_active,
	analysis_colorscale,
	lowmedhigh_scale,
} from './analysis.js';

import {
	pointto as search_pointto,
	zoom,
} from './search.js';

let ul, resultscontainer, resultsinfo;

function pointto(p, a = false) {
	const dict = [[ "v", ea_indexes[U.output]['name'] ]];
	const props = { "v": lowmedhigh_scale(p.v) };

	search_pointto(p.c, dict, props, a);
};

function li(p) {
	const pi3 = (p.c).map(c => +c.toFixed(3));

	const pn = ce('span');

	const el = ce('li', [
		ce('code', 	"[" + pi3.join(", ") + "]", { "style": "font-size: 0.9em" } ),
		pn,
	]);

	const t = (p.v ? Math.round((p.v).toFixed(2) * 100) : "");

	el.setAttribute('group', t);

	el.onmouseenter = pointto.bind(null, p);

	el.onclick = zoom.bind(null, p, pointto.bind(null, p, true));

	mapbox_coords_search_pois({ "coords": p.c, "limit": 1 })
		.then(r => pn.append(ce('span', maybe(r, 0, 'name'), { "class": "context" })));

	return el;
};

function trigger() {
	ul.replaceChildren();

	const list = COORDINATES
		.sort((a,b) => a.v > b.v ? -1 : 1)
		.map(t => li(t));

	const groups = {};
	list.forEach(i => {
		const a = i.getAttribute('group');
		if (!groups[a]) groups[a] = [];

		groups[a].push(i);
	});

	ul.append(...list);

	resultsinfo.innerHTML = `${list.length} points selected:`;

	for (const g in groups) {
		const el = ul.querySelector(`[group='${g}']`);
		const h = ce('h5', g + "%");

		ul.insertBefore(h, el);

		h.style = `
font-size: 0.9em;
background-color: rgba(${analysis_colorscale.fn(g/100.0)});
padding: 0.5em;
padding-left: 1em;
margin: 0.5em auto;
margin-left: 0;
width: calc(${g}% - 1.5em);
`;
	}
};

async function fileload(data) {
	const a = await analysis_plot_active(U.output, false);

	COORDINATES = d3.csvParseRows(data, d => {
		const c = [parseFloat(d[0]), parseFloat(d[1])];

		const p = coordinates_to_raster_pixel(c, {
			"data":   a.raster,
			"nodata": -1,
		});

		return { "v": p.value, "i": p.index, c };
	});

	trigger();
};

async function reload() {
	const a = await analysis_plot_active(U.output, false);

	COORDINATES = COORDINATES.map(c => {
		const p = coordinates_to_raster_pixel(c.c, {
			"data":   a.raster,
			"nodata": -1,
		});

		return p ? { "v": p.value, "i": p.index, "c": c.c } : undefined;
	}).filter(p => p);

	trigger();
};

export function init() {
	const panel = qs('#points.search-panel');

	const file_input = ce('input', null, { "type": "file", "id": "points-input", "style": "width: 0; height: 0;", "accept": "text/csv" });
	const upload = qs('#points-upload', panel);
	const upmsg = `
<h1>Upload a CSV file</h1>

This file should be <strong>strictly</strong> formatted.
<ul>
  <li>Two numbers per line: longitud and latitude</li>
  <li>Separated by a comma</li>
  <li>Decimal points</li>
  <li>No quotation marks</li>
  <li>Nothing more</li>
</ul>

<p>Example with two coordinates:</p>
<pre>
    -12.09156,9.05680
    -10.90457,7.93582
</pre>
`;

	let upbubble, downbubble, pickbubble, inputbubble;

	upload.onmouseenter = _ => {
		upbubble = new bubblemessage({
			"position": "S",
			"message":  upmsg,
			"close":    false,
		}, qs('i', upload));

		upbubble.style['pointer-events'] = "none";
	};

	upload.onmouseleave = _ => upbubble.remove();

	const download = qs('#points-download', panel);
	const downmsg = `Download a CSV file with the points/values below`;

	download.onmouseenter = _ => {
		downbubble = new bubblemessage({
			"position": "S",
			"message":  downmsg,
			"close":    false,
		}, qs('i', download));

		downbubble.style['pointer-events'] = "none";
	};

	download.onmouseleave = _ => downbubble.remove();

	download.onclick = _ => {
		if (!COORDINATES.length) return;

		const str = COORDINATES.map(c => [c.c[0], c.c[1], c.v].join(',')).join('\n');
		const time = (new Date()).getTime();

		fake_blob_download(str, `energyaccessexplorer-points-${time}.csv`);
	};

	const pointspick = qs('#points-pick', panel);
	const pickmsg = `Pick a sequence of points from the map`;

	pointspick.onmouseenter = _ => {
		pickbubble = new bubblemessage({
			"position": "S",
			"message":  pickmsg,
			"close":    false,
		}, qs('i', pointspick));

		pickbubble.style['pointer-events'] = "none";
	};

	pointspick.onmouseleave = _ => pickbubble.remove();

	pointspick.onclick = _ => {
		INFOMODE = false;
		info_mode_change();

		COORDINATESMODE = true;
	};

	const pointsinput = qs('#points-input', panel);
	const inputmsg = `Input coordinates manually`;

	pointsinput.onmouseenter = _ => {
		inputbubble = new bubblemessage({
			"position": "S",
			"message":  inputmsg,
			"close":    false,
		}, qs('i', pointsinput));

		inputbubble.style['pointer-events'] = "none";
	};

	pointsinput.onmouseleave = _ => inputbubble.remove();

	pointsinput.onclick = _ => {
		const content = tmpl('#points-input-form', {});
		const header = "Input Longitude/Latitude";

		const m = new modal({
			"id":      'points-input-modal',
			header,
			content,
			"destroy": true,
		});

		const form = qs('form', m.dialog);

		const c = MAPBOX.getCenter();
		const e = GEOGRAPHY.envelope;

		const lng = qs('#lng', form);
		lng.value = c.lng.toFixed(4);
		lng.min = e[0].toFixed(4);
		lng.max = e[2].toFixed(4);

		const lat = qs('#lat', form);
		lat.value = c.lat.toFixed(4);
		lat.min = e[1].toFixed(4);
		lat.max = e[3].toFixed(4);

		form.onsubmit = function(e) {
			e.preventDefault();

			COORDINATES.unshift({ "c": [+qs('#lng', form).value, +qs('#lat', form).value] });
			qs('#points.search-panel').dispatchEvent(new Event('activate'));
		};

		m.show();
	};

	file_input.onchange = function() {
		if (!this.files.length) return;

		const reader = new FileReader();

		reader.onload = function() {
			fileload(reader.result);
		};

		reader.readAsText(this.files[0]);

		file_input.value = null;
	};

	panel.addEventListener('activate', reload);

	panel.prepend(file_input);

	resultscontainer = qs('#points .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	resultsinfo = ce('div', ce('b', "Picked points"), { "class": 'search-results-info' });
	resultscontainer.prepend(resultsinfo);
};
