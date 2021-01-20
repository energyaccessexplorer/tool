import DS from './ds.js';

function timeline_slider(opts) {
	const {steps, drag, width, init} = opts;

	let v;

	const radius = 16,
		    svgwidth = width,
		    svgheight = (radius * 2) + 3,
		    svgmin = radius + 2,
		    svgmax = svgwidth - radius - 2;

	const norm = d3.scaleQuantize().domain([svgmin, svgmax]).range(steps);
	const denorm = d3.scaleLinear().domain([steps[0], steps[steps.length-1]]).range([svgmin, svgmax]);

	const svg = d3.create("svg")
		    .attr('class', 'svg-timeline');

	const g = svg.append('g');

	const gutter = g.append('rect');

	const circle = g.append('circle');

	svg
		.attr('width', svgwidth + 2)
		.attr('height', svgheight + 2 + 30);

	steps.forEach(x => {
		g.append('text').text(x)
			.attr('transform', `translate(${denorm(x) - 16}, ${svgheight + 32})`)
			.style('font-family', 'monospace');
	});

	gutter
		.attr('stroke', '#42505B')
		.attr('stroke-width', 0.5)
		.attr('fill', 'white')
		.attr('x', 1)
		.attr('y', 1)
		.attr('rx', radius)
		.attr('ry', radius)
		.attr('width', svgwidth - 2)
		.attr('height', svgheight - 2);

	circle
		.attr('r', radius)
		.attr('cy', svgheight/2)
		.attr('fill', '#E4A82E')
		.attr('stroke', '#42505B')
		.attr('stroke-width', 3)
		.style('cursor', 'grab');

	function _drag(cx) {
		const nx = norm(cx);
		const cx0 = denorm(nx);
		circle.attr('cx', cx0);

		if (nx !== v) drag(v = nx);
	};

	const behaviour = d3.drag()
		    .on('drag', _ => _drag(d3.event.x));

	circle.call(behaviour);

	gutter.on('click', _ => _drag(d3.event.offsetX));

	_drag(denorm(steps[init || 0]));

	return {
		svg: svg.node(),
		set: x => _drag(denorm(x))
	};
};

function multiline(opts) {
	const {data, color, message} = opts;

	const strokewidth = 2.5;

	const width = opts.width || 600;
	const height = opts.height || 400;

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
		    .attr("stroke", d => d.color || color)
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

			if (!(
				active_series &&
          has(s.values,i) &&
          has(data.dates, i)
			)) return;


			dot.attr("transform", `translate(${x(data.dates[i])},${y(active_series.values[i])})`);

			if (n) n.remove();

			n = nanny.pick_element(dot.node(), {
				title: s.name,
				message: typeof message === 'function' ? message(s, i, s.values[i]) : s.name,
				position: "W",
				close: false
			});
		};

		function left() {
			path
				.attr("stroke", d => d.color || color)
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
				.attr("stroke", d => d.color || color)
				.attr("stroke-width", strokewidth)
				.style("mix-blend-mode", "multiply");

			yg.call(x => x.selectAll(".tick").remove());

			const j = +d3.event.target.id.replace('line-', '');

			active_series = data.series[j];

			path
				.attr("stroke", (d,i) => i === j ? (d.color || color) : "#ddd")
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
	const datasets = DS.array.filter(d => d.on && d.datatype === 'polygons-timeline');

	if (!datasets.length) return;

	const series = datasets.reduce((a,c) => {
		return a.concat(c.csv.data.filter(r => r['District'] === U.subgeoname).map(r => {
			return {
				values: GEOGRAPHY.timeline_dates.map(k => (r[k] === "" ? undefined : +r[k])),
				id: c.id,
				name: el_tree([
					ce('span'), [
						ce('span', c.name),
						ce('span', "[" + c.category.unit + "]", { style: "margin-left: 1em; font-size: 0.8em;" }),
					]
				]),
				color: c.colorscale.stops.slice(-1)
			};
		}));
	}, []);

	let lines = qs('#timeline-lines');
	if (lines) lines.remove();

	const average = datasets.map(i => {
		return {
			id: i['id'],
			values: GEOGRAPHY.timeline_dates.map(d => i.csv.data.map(r => +r[d])).map(x => x.reduce((a,c) => a + c, 0) / x.length)
		};
	});

	const ml = multiline({
		data: {
			series: series,
			dates: GEOGRAPHY.timeline_dates.map(d3.utcParse("%Y-%m-%d"))
		},
		color: "green",
		width: 350,
		height: 250,
		message: function(m,i,a) {
			return el_tree([
				document.createElement('table'), [
					[ ce('tr'), [
						ce('td', ce('strong', "District value: &nbsp;")),
						ce('td', a.toString())
					]],
					[ ce('tr'), [
						ce('td', ce('strong', "State Average: &nbsp;")),
						ce('td', (Math.round(average.find(x => x.id === m.id).values[i] * 100) / 100).toString())
					]]
				]
			]);
		}
	});
	ml.svg.id = 'timeline-lines';

	const rp = qs('#right-pane');

	qs('#district-header', rp).innerText = U.subgeoname;
	qs('#district-graph', rp).append(ml.svg);
};

export async function lines_update() {
	if (!GEOGRAPHY.timeline) return;

	const datasets = DS.array.filter(d => d.on && d.datatype === 'polygons-timeline');

	if (datasets.length) {
		await Promise.all(datasets.map(d => until(_ => d.csv.data)));
		if (U.subgeoname) lines_draw();
	} else {
		const rp = qs('#right-pane');
		qs('#district-header', rp).innerText = "";

		let lines = qs('#timeline-lines');
		if (lines) lines.remove();
	}
};

export function filter_valued_polygons() {
	const ul = qs('#filtered-subgeographies');
	ul.innerHTML = "";

	const datasets = DS.array.filter(d => d.on && d.datatype.match("polygons-(fixed|timeline)"));

	const b = DST.get('boundaries');
	datasets.unshift(b);

	function matches(d) {
		return d.csv.data
			.filter(r => {
				let c;
				if (d.datatype.match("polygons-(timeline)"))
					c = GEOGRAPHY.timeline_dates.slice(0).reverse().find(x => +r[x] > 0);
				else if (d.datatype.match("polygons-(fixed|boundaries)"))
					c = d.config.column;

				return +r[c] >= d._domain.min && +r[c] <= d._domain.max;
			})
			.map(r => +r[d.csv.key]);
	};

	const arr = datasets.filter(d => d.csv.data).map(matches);
	const result = arr[0].filter(e => arr.every(a => a.includes(e)));

	const source = MAPBOX.getSource('filtered-source');

	const names = [];
	const fs = source._data.features;
	for (let i = 0; i < fs.length; i += 1) {
		const x = result.includes(+fs[i].properties[b.vectors.key]);

		fs[i].properties.__hidden = U.subgeo ? (fs[i].id !== +U.subgeo) : !x;

		if (x) {
			ul.append(ce('li', fs[i].properties['District']));
			names.push(fs[i].properties['District']);
		}
	}

	source.setData(source._data);
};
