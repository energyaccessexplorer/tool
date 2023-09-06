export function points_symbol(opts) {
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

export function lines_symbol(opts) {
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

export function polygons_symbol(opts) {
	const {size,stroke,strokewidth,fill,opacity} = opts;

	const svg = d3.create('svg')
		.attr('class', 'svg-polygon')
		.attr('width', size)
		.attr('height', size);

	svg
		.append('path')
		.attr('d', "M 5.5532202,7.3474994 24.062506,2.1642083 26.51526,25.827 1.3896115,25.827438 Z")
		.attr('fill', fill ?? 'none')
		.attr('fill-opacity', opacity)
		.attr('stroke', stroke)
		.attr('stroke-width', strokewidth);

	return svg.node();
};

export function lines_legends_svg(l) {
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
		.attr('stroke-width', l['stroke-width'])
		.attr('stroke-dasharray', l['dasharray']);

	return svg.node();
};

export function points_legends_svg(l) {
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
};

export function polygons_legends_svg(l) {
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
};
