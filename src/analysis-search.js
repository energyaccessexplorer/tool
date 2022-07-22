import bubblemessage from '../lib/bubblemessage.js';

import {
	plot_active as analysis_plot_active,
} from './analysis.js';

import {
	pointto as search_pointto,
	zoom,
} from './search.js';

let ul, input, resultscontainer;

let resultsinfo;

async function getpoints(n = 20) {
	const a = await analysis_plot_active(U.output, false);

	const threshold = a.raster.slice(0)
		.sort((a,b) => a > b ? -1 : 1)
		.slice(0, n)[n-1];

	const points = a.raster.reduce((t,v,i) => {
		if (v > 0 && v >= threshold)
			t.push({i,v});

		return t;
	}, []);

	return points.map(t => ({ "v": t.v, "i": raster_pixel_to_coordinates(t.i) }));
};

function pointto(p, a = false) {
	const dict = [[ "v", ea_indexes[U.output]['name'] ]];
	const props = { "v": ea_lowmedhigh_scale(p.v) };

	search_pointto(p.i, dict, props, a);
};

function li(p) {
	const c = (p.v ? Math.round((p.v).toFixed(2) * 100) : "") + " " + "[" + (p.i).map(c => +c.toFixed(3)).join(", ") + "]";

	const el = ce('li', ce('code', c), {});

	el.onmouseenter = pointto.bind(null, p);

	el.onclick = zoom.bind(null, p, pointto.bind(null, p, true));

	return el;
};

async function trigger({ points = getpoints, n = 20 }) {
	ul.replaceChildren();

	const results = await points(n);

	const count = results.length;

	resultsinfo.innerHTML = `Searching <b>analysis coordinates</b>. Top ${count} results:`;

	results
		.sort((a,b) => a.v > b.v ? -1 : 1)
		.slice(0,n)
		.forEach(t => ul.append(li(t)));

	if (count > n)
		qs('div.search-results-info', resultscontainer).innerHTML = `Searching <b>analysis coordinates</b>. Showing first ${n} of ${count}:`;
};

export function init() {
	const panel = qs('#analysis.search-panel');
	input = ce('span', "Analysis top locations", { "id": 'analysis-search', "class": 'search-input' });

	const file_input = ce('input', null, { "type": "file", "id": "location-search-input", "style": "width: 0; height: 0;", "accept": "text/csv" });
	const upload_icon = font_icon("box-arrow-in-up");
	const upload = ce('label', upload_icon, { "class": "search-input", "for": "location-search-input" });

	const msg = `
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

	let bubble;

	upload.onmouseenter = _ => {
		bubble = new bubblemessage({
			"position": "E",
			"message":  msg,
			"close":    false,
		}, upload_icon);

		bubble.style['pointer-events'] = "none";
	};

	upload.onmouseleave = _ => bubble.remove();

	file_input.onchange = function() {
		if (!this.files.length) return;

		var reader = new FileReader();

		reader.onload = function() {
			const data = d3.csvParseRows(reader.result, d => ({
				"v": null,
				"i": [parseFloat(d[0]), parseFloat(d[1])],
			}));

			trigger({ "points": async _ => data });
		};

		reader.readAsText(this.files[0]);
	};

	panel.addEventListener('activate', trigger);

	panel.prepend(input, file_input, upload);

	resultscontainer = qs('#analysis .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	resultsinfo = ce('div', ce('b', "Analysis coordinates"), { "class": 'search-results-info' });
	resultscontainer.prepend(resultsinfo);

	input.onclick = function(_) {
		trigger();
	};
};
