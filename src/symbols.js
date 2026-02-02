export function points_symbol({size, fill, stroke, strokewidth}) {
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

export function lines_symbol({size, stroke}) {
	const svg = d3.create('svg')
		.attr('class', 'svg-line')
		.attr('width', size)
		.attr('height', size);

	svg
		.append('rect')
		.attr('width', size - 2)
		.attr('height', size/4)
		.attr('x', 0)
		.attr('y', (size) * (3/8))
		.attr('fill', stroke)
		.attr('stroke', 'none');

	return svg.node();
};

export function polygons_symbol({size, stroke, strokewidth, fill, opacity}) {
	const svg = d3.create('svg')
		.attr('class', 'svg-polygon')
		.attr('width', size)
		.attr('height', size)
		.attr('viewBox', "0 0 28 28");

	svg
		.append('path')
		.attr('d', "M 5.5532202,7.3474994 24.062506,2.1642083 26.51526,25.827 1.3896115,25.827438 Z")
		.attr('fill', fill ?? 'none')
		.attr('fill-opacity', opacity)
		.attr('stroke', stroke)
		.attr('stroke-width', strokewidth);

	return svg.node();
};
