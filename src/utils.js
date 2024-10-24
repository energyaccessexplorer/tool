export function uniform_split(n) {
	return d3.range(0, 1.000000001, 1 / (n - 1));
};

export function colorscale(opts) {
	let s;

	let { intervals, stops, domain, width } = opts;

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
			.attr('width', width || "100%")
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
		"domain":    domain,
		"fn":        x => rgba(s(x)),
		"stops":     stops,
		"intervals": intervals || s.domain(),
		"svg":       color_steps(stops),
	};
};

export function svg_pie(data, outer, inner, colors, inner_text, parse, bubble) {
	if (typeof parse !== 'function')
		parse = x => (x * 100).toFixed(2);

	const width =  outer * 2;
	const height = outer * 2;

	const pie = d3.pie()
		.value(d => d[0])
		.sort(null);

	const arc = d3.arc()
		.innerRadius(typeof inner !== 'number' ? outer - (outer/4) : inner)
		.outerRadius(outer - (outer/15));

	const svg = d3.create("svg")
		.attr('xmlns', "http://www.w3.org/2000/svg")
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
		.on("mouseenter", function(d) { if (bubble) n = bubble(parse(d.value), this, d); })
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
		"data":   data,
		"change": change,
		"tween":  tween,
		"path":   path,
		"svg":    svg.node(),
	};
};

export function svg_interval(opts = {}) {
	const {sliders, background, init, steps, width, callback1, callback2, end_callback} = opts;

	const radius = 6;
	const svgwidth = width;
	const svgheight = (radius * 2) + 2;
	const svgmin = radius;
	const svgmax = svgwidth - (radius/2) - 1;

	let norm = d3.scaleLinear().domain([svgmin, svgmax]).range([0,1]);
	let denorm = norm.invert;

	if (steps) {
		norm = d3.scaleQuantize().domain([svgmin, svgmax]).range(uniform_split(steps.length));
		denorm = d3.scaleLinear().domain([0,1]).range([svgmin, svgmax]);
	}

	const svg = d3.create("svg")
		.attr('class', 'svg-interval');

	if (background) {
		svg.node().append(background);

		svg.attr('class', 'svg-interval transparent');

		d3.select(background)
			.attr("transform", "translate(0,4)");
	}

	const g = svg.append('g');
	const ticks = g.append('g').attr('class', 'ticks');

	const gutter = g.append('rect');
	const marked = g.append('rect');

	const marked_fill = getComputedStyle(document.body).getPropertyValue('--the-green');

	const c1 = g.append('circle');
	const c2 = g.append('circle');

	svg
		.attr('width', svgwidth + 2)
		.attr('height', svgheight + 2);

	gutter
		.attr('stroke', background ? 'none' : 'black')
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
		.attr('fill', background ? 'none' : 'lightgray')
		.attr('stroke', background ? 'none' : 'black')
		.attr('width', 0.5)
		.attr('height', radius + 2);

	marked
		.attr('fill', background ? "transparent" : marked_fill)
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

		const w = +c2.attr('cx') - +c1.attr('cx');

		marked
			.attr('x', +c1.attr('cx'))
			.attr('width', (w < 0) ? 0 : w);

		if (typeof callback === 'function')
			callback(norm(cx), cx);
	};

	let x_position;

	c1.call(
		d3.drag()
			.on('drag', _ => {
				const c2x = c2.attr('cx');
				const cx = x_position = Math.min(c2x, Math.max(d3.event.x, svgmin));

				dragged(c1, cx, callback1);
			})
			.on('start', c1.raise.bind(c2))
			.on('end', _ => {
				if (typeof end_callback === 'function') end_callback(norm(x_position));
			})
			.touchable(MOBILE),
	);

	c2.call(
		d3.drag()
			.on('drag', _ => {
				const c1x = c1.attr('cx');
				const cx = x_position = Math.max(c1x, Math.min(d3.event.x, svgmax));

				dragged(c2, cx, callback2);
			})
			.on('start', c2.raise.bind(c2))
			.on('end', _ => {
				if (typeof end_callback === 'function') end_callback(norm(x_position));
			})
			.touchable(MOBILE),
	);

	function change({min,max}) {
		dragged(c1, denorm(min), callback1);
		dragged(c2, denorm(max), callback2);
	};

	if (init) change(init);

	if (sliders === "single")
		c1.attr('r', 0);
	else if (sliders === "none") {
		c1.attr('r', 0);
		c2.attr('r', 0);
	}

	return {
		"svg": svg.node(),
		change,
		c1,
		c2,
	};
};

export function opacity_control({ fn, init }) {
	const o = tmpl('#opacity-control');

	let opacity_value = init ?? 1;

	const grad = svg_interval({
		"width":        256,
		"init":         { "min": 0, "max": opacity_value },
		"sliders":      'single',
		"callback2":    x => opacity_value = x,
		"end_callback": _ => fn(+opacity_value),
	});

	const b = qs('.opacity-box', o);
	qs('.slider', o).append(grad.svg);
	qs('i', o).onclick = _ => b.style.display = 'block';
	b.onmouseleave = _ => b.style.display = 'none';

	return o;
};

export function elem_collapse(el, t, open) {
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
			throw new Error(`triangle: e, ne, s, se, w. Got ${d}`);
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

	if (open || d === 'none') {
		el.style['display'] = 'block';
		c.replaceChildren(triangle('s'));
	} else {
		el.style['display'] = 'none';
		c.replaceChildren(triangle('e'));
	}
};

export function loading(bool) {
	qs('#app-loading').style['display'] = bool ? 'block' : 'none';
};

export function super_error(t, m, e = "error") {
	FLASH.push({
		"type":    e,
		"timeout": 0,
		"title":   t,
		"message": m,
	});

	const l = qs('#app-loading');
	qs('.spinner', l).style.animation = 'none';
	qs('.spinner', l).style.borderTop = 'none';
	qs('p', l).replaceChildren(ce('code', ":("));

	qs('#playground').remove();
};

export function table_data(dict, props, lnglat) {
	const t = ce('table');
	const s = ce('tr', [ce('td', "&nbsp;"), ce('td', "&nbsp;")]);

	let prev;
	for (let e of dict) {
		if (prev === null && e === null) continue;
		prev = e;

		if (!e) {
			t.append(s.cloneNode(true));
			continue;
		}

		const tr = ce('tr', null);

		if (props[e[0]]) {
			tr.append(
				ce('td', ce('strong', e.hasOwnProperty(1) ? e[1] + ": &nbsp;" : "&nbsp;")),
				ce('td', (e.hasOwnProperty(0) && props[e[0]]) ? props[e[0]].toString() : ""),
			);
		}
		else {
			tr.append(
				ce('td', ce('strong', e.hasOwnProperty(1) ? e[1] : "&nbsp;"), { "colspan": "2", "style": "text-align: center;" }),
			);
		}

		t.append(tr);
	};

	if (maybe(lnglat, 'length') === 2) {
		t.append(
			qs('tr', t) ? s.cloneNode(true) : "",
			ce('tr', [
				ce('td', "longitude"),
				ce('td', ce('code', lnglat[0].toFixed(5))),
			]),
			ce('tr', [
				ce('td', "latitude"),
				ce('td', ce('code', lnglat[1].toFixed(5))),
			]),
		);
	}

	return t;
};

/*
 * coordinates_to_raster_pixel
 *
 * Transform a set of coordinates to the "relative position" inside a raster
 * that is bound to an area
 *
 * NOTE: mercator only.
 *
 * @param "coords" int[2]. Coordinates in Longitude/Latitude to be transformed.
 * @param "raster" { width int, height int, novalue numeric, array numeric[] }
 *        full description.
 */

export function coordinates_to_raster_pixel(coords, raster) {
	const b = OUTLINE.raster;

	if (coords.length !== 2)
		throw new Error(`coordinates_to_raster_pixel: expected and array of length 2. Got ${coords}`);

	const merc = new SphericalMercator({ "size": 1 });

	const [mx,my] = merc.forward([coords[0], coords[1]]);
	const [bx,by] = merc.forward([GEOGRAPHY.envelope[0], GEOGRAPHY.envelope[3]]);

	const s = GEOGRAPHY.resolution;

	const plng = Math.round(Math.abs(mx - bx) / s);
	const plat = Math.round(Math.abs(my - by) / s);

	let a = null;

	if (and(plng > 0,
	        plng < b.width,
	        plat > 0,
	        plat < b.height)) {
		a = { "x": coords[0], "y": coords[1] };

		const i = (plat * b.width) + plng;
		a.index = i;

		if (raster) {
			const v = raster.data[i];
			a.value = (v === raster.nodata) ? null : v;
		}
	}

	return a;
};

export function raster_pixel_to_coordinates(i) {
	const r = OUTLINE.raster;
	const [ left, _bottom, _right, top ] = GEOGRAPHY.envelope;

	const merc = new SphericalMercator({ "size": 1 });

	const x = i%r.width;
	const y = Math.floor(i/r.width);

	const o = merc.forward([left, top]);

	const s = GEOGRAPHY.resolution;

	return merc.inverse([o[0] + (x * s), o[1] - (y * s)]);
};
