export function intersect(indexes, raster) {
	for (const i of indexes)
		if (raster.data[i] !== raster.nodata) return true;

	return false;
};

export function intersection(...rasters) {
	const length = OUTLINE.raster.data.length;
	const r = new Int8Array(length).fill(0);

	for (let i = 0; i < length; i++) {
		let skip = false;

		for (let k of rasters) {
			if (k.data[i] === k.nodata) {
				skip = true;
				break;
			}
		}

		if (skip) continue;

		r[i] = 1;
	}

	return r;
};

export function average(raster) {
	let sum = 0;
	let size = 0;

	const data = raster.data;
	const nodata = raster.nodata;

	let min;
	let max;

	for (let i = 0; i < data.length; i++) {
		const v = data[i];
		if (v === nodata) continue;

		if (max === undefined || v > max) max = v;
		if (min === undefined || v < min) min = v;

		sum += v;
		size += 1;
	}

	const r = new Float32Array(data.length).fill(-1);

	const lin = d3.scaleLinear().domain([min,max]).range([0,1]);
	for (let i = 0; i < r.length; i++)
		r[i] = (data[i] === nodata) ? -1 : lin(data[i]);

	return {
		min,
		max,
		sum,
		size,
		nodata,
		normalised_data: r,
		avg: sum/size,
	};
};

export function crop_to(raster, envelope) {
	let sum = 0;
	let size = 0;

	const data = raster.data;
	const nodata = raster.nodata;

	const edata = envelope.data;
	const enodata = envelope.nodata;

	let min;
	let max;

	const r = new Float32Array(data.length).fill(nodata);

	for (let i = 0; i < data.length; i++) {
		if (edata[i] === enodata) continue;

		const v = data[i];
		if (v === nodata) continue;

		if (max === undefined || v > max) max = v;
		if (min === undefined || v < min) min = v;

		r[i] = v;
		sum += v;
		size += 1;
	}

	return {
		min,
		max,
		sum,
		size,
		nodata,
		data: r,
		avg: sum/size,
	};
};
