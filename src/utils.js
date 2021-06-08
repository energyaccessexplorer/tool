/* eslint no-unused-vars: "off" */

NORM_STOPS = d3.range(0, 1.000000001, 0.25);

function ea_colorscale(opts) {
	let s;

	let {intervals,stops,domain} = opts;

	if (!stops || !stops.length)
		stops = ea_default_colorscale.stops;

	if (!domain) domain = NORM_STOPS;

	if (maybe(intervals, 'length')) {
		s = d3.scaleQuantile()
			.domain(domain = intervals)
			.range(stops);
	}
	else {
		s = d3.scaleLinear()
			.domain(d3.range(domain.min, domain.max + 0.0000001, (domain.max - domain.min) / (stops.length - 1)))
			.range(stops)
			.clamp(true);
	}

	function color_steps(steps, height) {
		const h = height || 5;

		const svg = d3.create("svg")
			    .attr('class', 'svg-interval');

		const g = svg.append('g');

		steps.forEach((v,i) => {
			g.append('rect')
				.attr('fill', v)
				.attr('stroke', 'none')
				.attr('x', `${(100/steps.length) * i}%`)
				.attr('width', `${100/steps.length}%`)
				.attr('height', h);
		});

		svg
			.attr('width', "100%")
			.attr('height', h);

		return svg.node();
	};

	function rgba(str) {
		let c;

		if (!str) return [0, 0, 0, 255];

		if (str.match(/^#([A-Fa-f0-9]{3}){1,2}$/)) {
			c = str.substring(1).split('');

			if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];

			c = '0x' + c.join('');

			return [(c>>16)&255, (c>>8)&255, c&255, 255];
		}
		else if ((c = str.match(/^rgba?\(([0-9]{1,3}), ?([0-9]{1,3}), ?([0-9]{1,3}),? ?([0-9]{1,3})?\)$/))) {
			return [+c[1], +c[2], +c[3], +c[4] || 255];
		}

		else
			throw new Error(`rgba: argument ${str} doesn't match`);
	};

	return {
		domain: domain,
		fn: x => rgba(s(x)),
		stops: stops,
		intervals: intervals,
		svg: color_steps(stops)
	};
};

function ea_svg_pie(data, outer, inner, colors, inner_text, parse) {
	if (typeof parse !== 'function')
		parse = x => (x * 100).toFixed(2);

	const width =  outer * 2,
		    height = outer * 2;

	const pie = d3.pie()
		    .value(d => d[0])
		    .sort(null);

	const arc = d3.arc()
		    .innerRadius(typeof inner !== 'number' ? outer - (outer/4) : inner)
		    .outerRadius(outer - (outer/15));

	const svg = d3.create("svg")
		    .attr('class', 'svg-pie')
		    .attr("width", width)
		    .attr("height", height);

	const g = svg.append("g")
		    .attr("transform", `translate(${ width / 2 }, ${ height / 2 })`);

	let n;

	const outline = svg.append('circle')
		    .attr('cx', width / 2)
		    .attr('cy', height / 2)
		    .attr('r', outer - (outer/15) - 1)
		    .attr('stroke', 'gray')
		    .attr('stroke-width', 0)
		    .attr('fill', 'none');

	let path = g
		  .datum(data)
		  .selectAll("path")
		  .data(pie).enter()
		  .append("path")
		  .attr("fill", (d,i) => colors[i])
		  .attr("d", arc)
		  .on("mouseenter", function(d) { n = nanny.pick_element(this, { message: parse(d.value) + "%", position: "W", close: false }); })
		  .on("mouseleave", function(_) { if (n) n.remove(); })
		  .each(function(d) { this._current = d; });

	function change(v) {
		pie.value(d => d[v]);
		path = path.data(pie);

		path
			.transition()
			.duration(750)
			.attrTween("d", tween);

		outline.attr('stroke-width', data.every(x => !x[v]) ? 0.5 : 0);
	};

	function tween(a) {
		const i = d3.interpolate(this._current, a);
		this._current = i(0);
		return t => arc(i(t));
	};

	return {
		data: data,
		change: change,
		tween: tween,
		path: path,
		svg: svg.node(),
	};
};

function ea_svg_interval(opts = {}) {
	const {sliders, domain, init, steps, width, callback1, callback2, end_callback} = opts;

	const radius = 6,
		    svgwidth = width || 256,
		    svgheight = (radius * 2) + 2,
		    linewidth = radius * 2,
		    svgmin = radius + 1,
		    svgmax = svgwidth - radius - 1;

	let norm = d3.scaleLinear().domain([svgmin, svgmax]).range([domain.min, domain.max]);
	let denorm = norm.invert;

	if (steps) {
		norm = d3.scaleQuantize().domain([svgmin, svgmax]).range(steps);
		denorm = d3.scaleLinear().domain([steps[0], steps[steps.length-1]]).range([svgmin, svgmax]);
	}

	const svg = d3.create("svg")
		    .attr('class', 'svg-interval');

	const g = svg.append('g');
	const ticks = g.append('g').attr('class', 'ticks');

	const gutter = g.append('rect');
	const marked = g.append('rect');

	const c1 = g.append('circle');
	const c2 = g.append('circle');

	const fill = getComputedStyle(document.body).getPropertyValue('--the-green');

	svg
		.attr('width', svgwidth + 2)
		.attr('height', svgheight + 2);

	gutter
		.attr('stroke', 'black')
		.attr('stroke-width', 0.1)
		.attr('fill', 'transparent')
		.attr('x', 1)
		.attr('y', (svgheight / 2) - 1)
		.attr('rx', 0)
		.attr('ry', 0)
		.attr('width', svgwidth - 2)
		.attr('height', 1);

	ticks.selectAll('rect.tick')
		.data(steps || []).enter()
		.append('rect')
		.attr('class', 'tick')
		.attr('x', d => denorm(d))
		.attr('y', radius - 2)
		.attr('fill', 'lightgray')
		.attr('stroke', 'none')
		.attr('width', 0.5)
		.attr('height', radius + 2);

	marked
		.attr('fill', fill)
		.attr('stroke', 'none')
		.attr('x', 1)
		.attr('y', (svgheight / 2) - 1.5)
		.attr('height', 2);

	c1
		.attr('r', radius)
		.attr('cy', svgheight/2)
		.attr('fill', 'white')
		.attr('stroke', 'gray')
		.attr('stroke-width', 0.2)
		.style('cursor', 'grab');

	c2
		.attr('r', radius)
		.attr('cy', svgheight/2)
		.attr('fill', 'white')
		.attr('stroke', 'gray')
		.attr('stroke-width', 0.2)
		.style('cursor', 'grab');

	function dragged(c, cx, callback) {
		if (steps) cx = denorm(norm(cx));

		c.attr('cx', cx);

		const w = +c2.attr('cx') - c1.attr('cx');

		marked
			.attr('x', +c1.attr('cx'))
			.attr('width', (w < 0) ? 0 : w);

		if (typeof callback === 'function') callback(norm(cx).toFixed(2));
	};

	let x_position;

	c1.call(
		d3.drag()
			.on('drag', _ => {
				const c2x = c2.attr('cx');
				const cx = x_position = Math.min(c2x, Math.max(d3.event.x, svgmin));

				dragged(c1, cx, callback1);
			})
			.on('start', _ => c1.raise())
			.on('end', _ => {
				if (typeof end_callback === 'function') end_callback(norm(x_position));
			})
			.touchable(MOBILE)
	);

	c2.call(
		d3.drag()
			.on('drag', _ => {
				const c1x = c1.attr('cx');
				const cx = x_position = Math.max(c1x, Math.min(d3.event.x, svgmax));

				dragged(c2, cx, callback2);
			})
			.on('start', _ => c2.raise())
			.on('end', _ => {
				if (typeof end_callback === 'function') end_callback(norm(x_position));
			})
			.touchable(MOBILE)
	);

	function change({min,max}) {
		dragged(c1, denorm(min), callback1);
		dragged(c2, denorm(max), callback2);
	};

	if (init) change(init);

	if (sliders === "single") c1.remove();

	return {
		svg: svg.node(),
		change: change
	};
};

function ea_svg_checkbox(init, callback) { // this is not used anywhere
	const size = 24;

	const svg = d3.create("svg")
		    .attr('class', 'svg-checkbox');

	const g = svg.append('g');

	const gutter = g.append('rect');

	const check = g.append('path');

	let status = init || false;

	const active = getComputedStyle(document.body).getPropertyValue('--the-yellow');

	svg
		.attr('width', size)
		.attr('height', size)
		.style('cursor', 'pointer');

	gutter
		.attr('x', 0)
		.attr('y', 0)
		.attr('rx', 1)
		.attr('ry', 1)
		.attr('stroke', 'gray')
		.attr('stroke-width', 0.2)
		.attr('width', size)
		.attr('height', size);

	check
		.attr('fill', 'white')
		.attr('stroke', 'white')
		.attr('d', "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z");

	function change(s,x) {
		gutter
			.attr('stroke', (s ? active : '#aaaaaa'))
			.style('fill', (s ? active : 'white'));

		if ((typeof callback === 'function') && x) callback(s);
	};

	svg.on('click', _ => change(status = !status, true));

	change(status, false);

	return {
		svg: svg.node(),
		change: change
	};
};

function ea_opacity_control({ fn }) {
	const o = tmpl('#opacity-control');
	let opacity_value = 1;

	const grad = ea_svg_interval({
		init: { min: 0, max: 1 },
		domain: { min: 0, max: 1 },
		sliders: 'single',
		callback2: x => opacity_value = x,
		end_callback: _ => fn(+opacity_value),
	});

	const b = qs('.opacity-box', o);
	qs('.slider', o).append(grad.svg);
	qs('i', o).onclick = _ => b.style.display = 'block';
	b.onmouseleave = _ => b.style.display = 'none';

	return o;
};

function elem_collapse(el, t, open) {
	function triangle(d) {
		let t;

		switch (d) {
		case 'e':
			t = 'rotate(-45deg)translate(0,0)';
			break;

		case 's':
			t = 'rotate(45deg)translate(0,-6px)';
			break;

		case 'n':
			t = 'rotate(-135deg)translate(0,-6px)';
			break;

		case 'w':
			t = 'rotate(135deg)translate(-2px,0)';
			break;

		case 'ne':
			t = 'rotate(-90deg)';
			break;

		case 'se':
			t = '';
			break;

		default:
			throw `triangle: e, ne, s, se, w. Got ${d}.`;
		}

		const svg = d3.create('svg');
		svg.attr('width', "12");
		svg.attr('height', "12");
		svg.attr('viewBox', "0 0 12 12");

		const polyline = svg.append('polyline');
		polyline.attr('points', "12,0 12,12 0,12 ");

		svg.attr('style', `transform: ${t};`);

		return svg.node();
	};

	const d = el.style['display'];
	const c = qs('.collapse', t);

	elem_empty(c);

	if (open || d === 'none') {
		el.style['display'] = 'block';
		c.append(triangle('s'));
	} else {
		el.style['display'] = 'none';
		c.append(triangle('e'));
	}
};

function ea_loading(bool) {
	qs('#app-loading').style['display'] = bool ? 'block' : 'none';
};

function ea_super_error(t, m, e = "error") {
	ea_flash.push({
		type: e,
		timeout: 0,
		title: t,
		message: m
	});

	const l = qs('#app-loading');
	qs('.spinner', l).style.animation = 'none';
	qs('.spinner', l).style.borderTop = 'none';
	qs('p', l).innerHTML = "<code>:(</code>";

	qs('#playground').remove();
};

function table_data(dict, props) {
	const t = ce('table');

	for (const e of dict) {
		if (!e) {
			t.append(ce('tr', [ ce('td', "&nbsp;"), ce('td', "&nbsp;") ]));
			continue;
		}

		t.append(ce('tr', [
			ce('td', ce('strong', e.hasOwnProperty(1) ? e[1] + ": &nbsp;" : "&nbsp;")),
			ce('td', (e.hasOwnProperty(0) && props[e[0]]) ? props[e[0]].toString() : ""),
		]));
	};

	return t;
};

function table_add_lnglat(d, lnglat = [0, 0]) {
	d.append(ce('tr', [
		ce('td', "&nbsp;"),
		ce('td', "&nbsp;"),
	]));

	d.append(ce('tr', [
		ce('td', "longitude"),
		ce('td', ce('code', lnglat[0].toFixed(2))),
	]));

	d.append(ce('tr', [
		ce('td', "latitude"),
		ce('td', ce('code', lnglat[1].toFixed(2))),
	]));
};

/*
 * ea_coordinates_in_raster
 *
 * Transform a set of coordinates to the "relative position" inside a raster
 * that is bound to an area
 *
 * NOTE: mercator only.
 *
 * @param "coords" int[2]. Coordinates in Longitude/Latitude to be transformed.
 * @param "bounds" {int,int,int,int}. Bounding box containing the raster data.
 * @param "raster" { width int, height int, novalue numeric, array numeric[] }
 *        full description.
 */

function ea_coordinates_in_raster(coords, {left,bottom,right,top}, raster) {
	if (coords.length !== 2)
		throw Error(`ea_coordinates_raster: expected and array of length 2. Got ${coords}`);

	const hs = d3.scaleLinear().domain([left, right]).range([0, raster.width]);
	const vs = d3.scaleLinear().domain([top, bottom]).range([0, raster.height]);

	const plng = Math.floor(hs(coords[0]));
	const plat = Math.floor(vs(coords[1]));

	let a = null;

	if ((plng > 0 && plng < raster.width &&
       plat > 0 && plat < raster.height )) {
		a = { x: coords[0], y: coords[1] };

		const i = (plat * raster.width) + plng;
		const v = raster.data[i];

		a.value = (v === raster.nodata) ? null : v;
		a.index = i;
	}

	return a;
};

function ea_raster_in_coordinates(i, reference, bounds) {
	const [x,y] = [i%reference.width, Math.floor(i/reference.width)];
	return GEOGRAPHY.raster_coords(x,y);
};
