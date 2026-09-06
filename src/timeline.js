import bubblemessage from '../lib/bubblemessage.js';

import { t } from './translate.js';

import {
	and,
	ce,
	has,
	maybe,
	or,
	qs,
} from '../lib/helpers.js';

function multiline(opts) {
	const {data, color, message} = opts;

	const strokewidth = 2.5;

	const width = opts.width ?? 600;
	const height = opts.height ?? 400;

	const margin = { "top": 20, "right": 20, "bottom": 30, "left": 40 };

	const svg = d3.create("svg")
		.attr("viewBox", [0, 0, width, height]);

	const x = d3.scaleUtc()
		.domain(d3.extent(data.dates))
		.range([margin.left, width - margin.right]);

	const xAxis = g => g
		.attr("transform", `translate(0,${height - margin.bottom})`)
		.call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0));

	const y = d3.scaleLinear()
		.range([height - margin.bottom, margin.top])
		.nice();

	let active_series;

	const line = function(i) {
		y.domain([
			d3.min(data.series[i].values),
			d3.max(data.series[i].values),
		]);

		return d3.line()
			.defined(d => !isNaN(d))
			.x((d,j) => x(data.dates[j]))
			.y(d => y(d));
	};

	const yAxis = g => g
		.attr("transform", `translate(${margin.left},0)`)
		.call(d3.axisLeft(y));

	const dot = svg.append("g")
		.attr("display", "none");

	dot.append("circle")
		.attr("r", 5)
		.attr("fill", 'transparent');

	const path = svg.append("g")
		.attr("fill", "none")
		.attr("stroke-width", strokewidth)
		.attr("stroke-linejoin", "round")
		.attr("stroke-linecap", "round")
		.selectAll("path")
		.data(data.series)
		.join("path")
		.style("mix-blend-mode", "multiply")
		.attr("id", (d,i) => 'line-' + i)
		.attr("stroke", d => d.color ?? color)
		.attr("d", (d,i) => line(i)(d.values));

	svg.append("g")
		.call(xAxis);

	const yg = svg.append("g");

	let n;

	function svghover(svg) {
		svg.style("position", "relative");

		if ("ontouchstart" in document) {
			svg
				.style("-webkit-tap-highlight-color", "transparent")
				.on("touchmove", moved)
				.on("touchend", left);
		}
		else {
			svg
				.on("mousemove", moved)
				.on("mouseleave", left);
		}

		function moved() {
			d3.event.preventDefault();

			const xm = x.invert(d3.event.layerX);
			const ym = y.invert(d3.event.layerY);

			const i1 = d3.bisectLeft(data.dates, xm, 1);
			const i0 = i1 - 1;
			const i = xm - data.dates[i0] > data.dates[i1] - xm ? i1 : i0;
			const s = data.series.reduce((a, b) => Math.abs(a.values[i] - ym) < Math.abs(b.values[i] - ym) ? a : b, []);

			if (!and(active_series,
			         has(s.values,i),
			         has(data.dates, i))) return;

			if (or(
				y(active_series.values[i]) === undefined,
				x(data.dates[i]) === undefined,
			)) {
				if (n) n.remove();
				return;
			}

			dot.attr("transform", `translate(${x(data.dates[i])},${y(active_series.values[i])})`);

			if (n) n.remove();

			n = new bubblemessage({
				"title":    s.name,
				"message":  typeof message === 'function' ? message(s, i, s.values[i]) : s.name,
				"position": "E",
				"close":    false,
				"noevents": true,
			}, dot.node());
		};

		function left() {
			path
				.attr("stroke", d => d.color ?? color)
				.attr("stroke-width", strokewidth)
				.style("mix-blend-mode", "multiply");

			dot.attr("display", "none");
			n ? n.remove() : null;

			yg.call(x => x.selectAll(".tick").remove());
		};
	};

	function pathhover(path) {
		if ("ontouchstart" in document) {
			path
				.on("touchstart", entered);
		}
		else {
			path
				.on("mouseenter", entered);
		}

		function entered() {
			path
				.attr("stroke", d => d.color ?? color)
				.attr("stroke-width", strokewidth)
				.style("mix-blend-mode", "multiply");

			yg.call(x => x.selectAll(".tick").remove());

			const j = +d3.event.target.id.replace('line-', '');

			active_series = data.series[j];

			path
				.attr("stroke", (d,i) => i === j ? (d.color ?? color) : "#ddd")
				.attr("stroke-width", (d,i) => i === j ? 7 : strokewidth);

			y.domain([
				d3.min(data.series[j].values),
				d3.max(data.series[j].values),
			]);

			dot.attr("display", null);

			yg.call(yAxis);
		};
	};

	svg.call(svghover);

	path.call(pathhover);

	return {
		"svg": svg.node(),
	};
};

export function lines_draw() {
	const d = GEOGRAPHY.divisions[STATE.divtier];

	const tiercsv = maybe(d, 'csv');
	if (!tiercsv) return;

	const datasets = STATE.datasets
		.filter(d => and(d.type === 'polygons-timeline', maybe(d, 'csv', 'data')));

	if (!datasets.length) return;

	const series = datasets.reduce((a,c) => {
		return a.concat(...c.csv.data.filter(r => +r[c.csv.key] === STATE.subdiv).map(r => ({
			"values": GEOGRAPHY.timeline_dates.map(k => (r[k] === "" ? undefined : +r[k])),
			"id":     c.id,
			"name":   ce('span', [
				ce('span', c.name),
				ce('span', "[" + c.category.unit + "]", { "style": "margin-left: 1em; font-size: 0.8em;" }),
			]),
			"color": c.colorscale.stops.slice(-1),
		})));
	}, []);

	const lines = qs('#timeline-lines');
	if (lines) lines.remove();

	const average = datasets.map(i => ({
		"id":     i['id'],
		"values": GEOGRAPHY.timeline_dates.map(d => i.csv.data.map(r => +r[d])).map(x => x.reduce((a,c) => a + c, 0) / x.length),
	}));

	const ml = multiline({
		"data": {
			"series": series,
			"dates":  GEOGRAPHY.timeline_dates.map(d3.utcParse("%Y-%m-%d")),
		},
		"color":   "green",
		"width":   qs('#geographies').clientWidth,
		"height":  350,
		"message": function(m,i,a) {
			const table = document.createElement('table');

			const t1 = ce('tr', [
				ce('td', ce('strong', `${t(window.LOCALE, 'timeline.value_label')}: &nbsp;`)),
				ce('td', a.toString()),
			]);

			const t2 = ce('tr', [
				ce('td', ce('strong', `${t(window.LOCALE, 'timeline.state_average_label')}: &nbsp;`)),
				ce('td', (Math.round(average.find(x => x.id === m.id).values[i] * 100) / 100).toString()),
			]);

			table.append(t1,t2);

			return table;
		},
	});
	ml.svg.id = 'timeline-lines';

	ml.svg.style.display = 'block';

	qs('#lines-graph').append(ml.svg);

	const h = maybe(d.csv.data.find(r => +r[d.csv.key] === STATE.subdiv), d.csv.column);

	qs('#lines-header').innerText = h;
};

export async function lines_update() {
	if (!GEOGRAPHY.timeline) return;

	if (!(maybe(GEOGRAPHY.divisions, STATE.divtier, 'csv'))) return;

	const datasets = STATE.datasets.filter(d => d.type === 'polygons-timeline');

	if (and(datasets.length, STATE.subdiv > -1))
		lines_draw();
	else {
		qs('#lines-header').innerText = "";

		const lines = qs('#timeline-lines');
		if (lines) lines.remove();
	}
};
