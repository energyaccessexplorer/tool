import DS from './ds.js';

import bubblemessage from '../lib/bubblemessage.js';

function timeline_slider(opts) {
	const {steps, drag, width, init} = opts;

	let v;

	const radius = 16;
	const svgwidth = width;
	const svgheight = (radius * 2) + 3;
	const svgmin = radius + 2;
	const svgmax = svgwidth - radius - 2;

	const svg = d3.create("svg")
		.attr('class', 'svg-timeline');

	const g = svg.append('g');

	const gutter = g.append('rect');

	const circle = g.append('circle');

	svg
		.attr('width', "100%")
		.attr('height', svgheight + 2 + 30);

	const parent = qs('#timeline');
	const dates = ce('div', null, { "id": "timeline-dates-container" });
	parent.append(dates);

	steps.forEach(x => {
		const s = ce('span', x, { "font-family": "monospace" });
		dates.append(s);
	});

	gutter
		.attr('stroke', '#42505B')
		.attr('stroke-width', 0.5)
		.attr('fill', 'white')
		.attr('x', 1)
		.attr('y', 1)
		.attr('rx', radius)
		.attr('ry', radius)
		.attr('width', "99.9%")
		.attr('height', svgheight - 2);

	circle
		.attr('r', radius)
		.attr('cy', svgheight/2)
		.attr('fill', '#E4A82E')
		.attr('stroke', '#42505B')
		.attr('stroke-width', 3)
		.style('cursor', 'grab');

	let w = svgwidth;
	let norm = d3.scaleQuantize().domain([svgmin, svgmax]).range(steps);
	let denorm = d3.scaleLinear().domain([steps[0], steps[steps.length-1]]).range([svgmin, svgmax]);
	let current_step = init;

	function _drag(cx) {
		const nx = norm(cx);
		const cx0 = denorm(nx);
		circle.attr('cx', cx0);

		current_step = nx;

		if (nx !== v) drag(v = nx);
	};

	function set(y) {
		const svgmax = w - radius - 2;

		norm = d3.scaleQuantize().domain([svgmin, svgmax]).range(steps);
		denorm = d3.scaleLinear().domain([steps[0], steps[steps.length-1]]).range([svgmin, svgmax]);

		_drag(denorm(y));
	};

	const behaviour = d3.drag()
		.on('drag', _ => _drag(d3.event.x));

	circle.call(behaviour);

	gutter.on('click', _ => _drag(d3.event.offsetX));

	const node = svg.node();

	(async function() {
		await until(_ => node.clientWidth);
		set(steps[init || 0]);
	})();

	parent.addEventListener('resize', function() {
		if (parent.style.display !== 'none')
			w = node.clientWidth;

		set(current_step);
	});

	return {
		svg: node,
		set,
	};
};

function multiline(opts) {
	const {data, color, message} = opts;

	const strokewidth = 2.5;

	const width = opts.width ?? 600;
	const height = opts.height ?? 400;

	const margin = { top: 20, right: 20, bottom: 30, left: 40 };

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
			d3.max(data.series[i].values)
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

			const ym = y.invert(d3.event.layerY);
			const xm = x.invert(d3.event.layerX);
			const i1 = d3.bisectLeft(data.dates, xm, 1);
			const i0 = i1 - 1;
			const i = xm - data.dates[i0] > data.dates[i1] - xm ? i1 : i0;
			const s = data.series.reduce((a, b) => Math.abs(a.values[i] - ym) < Math.abs(b.values[i] - ym) ? a : b, []);

			if (!and(active_series,
			         has(s.values,i),
			         has(data.dates, i))) return;

			dot.attr("transform", `translate(${x(data.dates[i])},${y(active_series.values[i])})`);

			if (n) n.remove();

			n = new bubblemessage({
				title: s.name,
				message: typeof message === 'function' ? message(s, i, s.values[i]) : s.name,
				position: "W",
				close: false,
				noevents: true,
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
				d3.max(data.series[j].values)
			]);

			dot.attr("display", null);

			yg.call(yAxis);
		};
	};

	svg.call(svghover);

	path.call(pathhover);

	return {
		svg: svg.node()
	};
};

export async function init() {
	await until(_ => GEOGRAPHY.timeline_dates.length > 0);

	const steps = GEOGRAPHY.timeline_dates.map(x => parseInt(x.replace('(^[0-9]{4}-)', '\\1'))); // <- \/\/ due to strict mode in modules

	const parent = qs('#timeline');
	const padding = 100;

	const tl = timeline_slider({
		steps: steps,
		width: qs('#maparea').clientWidth - padding,
		init: steps.length - 1,
		parent: parent,
		drag: x => O.timeline = GEOGRAPHY.timeline_dates.find(i => i.match(x))
	});

	tl.svg.style.left = (padding / 2) + "px";
	parent.append(tl.svg);

	return tl;
};

export function lines_draw() {
	const tiercsv = maybe(GEOGRAPHY.divisions, U.divtier, 'csv');
	if (!tiercsv) return;

	const datasets = DS.array
		.filter(d => and(d.on, d.datatype === 'polygons-timeline', maybe(d, 'csv', 'data')));

	if (!datasets.length) return;

	const series = datasets.reduce((a,c) => {
		return a.concat(c.csv.data.filter(r => +r[c.csv.key] === U.subdiv).map(r => ({
			values: GEOGRAPHY.timeline_dates.map(k => (r[k] === "" ? undefined : +r[k])),
			id: c.id,
			name: ce('span', [
				ce('span', c.name),
				ce('span', "[" + c.category.unit + "]", { style: "margin-left: 1em; font-size: 0.8em;" }),
			]),
			color: c.colorscale.stops.slice(-1)
		})));
	}, []);

	let lines = qs('#timeline-lines');
	if (lines) lines.remove();

	const average = datasets.map(i => ({
		id: i['id'],
		values: GEOGRAPHY.timeline_dates.map(d => i.csv.data.map(r => +r[d])).map(x => x.reduce((a,c) => a + c, 0) / x.length)
	}));

	const ml = multiline({
		data: {
			series: series,
			dates: GEOGRAPHY.timeline_dates.map(d3.utcParse("%Y-%m-%d"))
		},
		color: "green",
		width: 350,
		height: 250,
		message: function(m,i,a) {
			const table = document.createElement('table');

			const t1 = ce('tr', [
				ce('td', ce('strong', "Value: &nbsp;")),
				ce('td', a.toString())
			]);

			const t2 = ce('tr', [
				ce('td', ce('strong', "State Average: &nbsp;")),
				ce('td', (Math.round(average.find(x => x.id === m.id).values[i] * 100) / 100).toString())
			]);

			table.append(t1,t2);

			return table;
		}
	});
	ml.svg.id = 'timeline-lines';

	const rp = qs('#right-pane');

	qs('#lines-header', rp).innerText = maybe(tiercsv.data.find(r => +r[tiercsv.key] === U.subdiv), tiercsv.value);
	qs('#lines-graph', rp).append(ml.svg);
};

export async function lines_update() {
	if (!(maybe(GEOGRAPHY.divisions, U.divtier, 'csv'))) return;

	if (!GEOGRAPHY.timeline) return;

	const datasets = DS.array.filter(d => and(d.on, d.datatype === 'polygons-timeline'));

	if (datasets.length) {
		if (U.subdiv > -1) lines_draw();
	}

	if (or(U.divtier < 1, !datasets.length)) {
		const rp = qs('#right-pane');
		qs('#lines-header', rp).innerText = "";

		let lines = qs('#timeline-lines');
		if (lines) lines.remove();
	}
};
