export function drawcanvas(opts) {
	const {canvas, data, width, height, nodata, colorscale} = opts;

	const ctx = canvas.getContext("2d");
	const imagedata = ctx.createImageData(width, height);
	const imgd = imagedata.data;

	canvas.width = width;
	canvas.height = height;

	let i, p;
	for (i = p = 0; i < data.length; i += 1, p += 4) {
		if (data[i] === nodata) continue;

		const c = colorscale.fn(data[i]);

		if (!c) continue;

		imgd[p] = c[0];
		imgd[p+1] = c[1];
		imgd[p+2] = c[2];
		imgd[p+3] = 255;
	}

	ctx.putImageData(imagedata, 0, 0);

	return canvas;
};

/*
 * outputcanvas
 *
 * @param "raster" []numbers
 * @param "canvas" a canvas element (if null, will default to canvas#output)
 */

export function outputcanvas(data, canvas = null) {
	const A = DST.get('boundaries');

	if (!data.length) {
		console.warn("plot.outputcanvas: no raster given. Filling up with a blank (transparent) one...");
		data = new Float32Array(A.raster.data.length).fill(-1);
	};

	drawcanvas({
		canvas: canvas || qs('canvas#output'),
		data: data,
		width: A.raster.width,
		height: A.raster.height,
		nodata: -1,
		colorscale: ea_analysis_colorscale,
	});
};
