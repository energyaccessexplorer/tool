// Attemt to estimate real-world pixel sixe otherwise provided by GeoTIFF ModelPixelScale.
export function estimate_model_pixel_scale(data, width, height, nodata) {
	function count_edges(rows, cols, step, size, idx) {
		const edges = new Uint32Array(size);
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const i = r * width + c;
				if (data[i] !== nodata && data[i + step] !== nodata && data[i] !== data[i + step])
					edges[idx(r, c)]++;
			}
		}
		return edges;
	}

	const col_edges = count_edges(height, width - 1, 1,     width,  (_, c) => c);
	const row_edges = count_edges(height - 1, width, width, height, (r) => r);

	return [mode_spacing(col_edges), mode_spacing(row_edges)];
}

// Most common distance between consecutive block boundaries.
function mode_spacing(edges) {
	const freq = {};
	let prev = -1;

	for (let i = 0; i < edges.length; i++) {
		if (edges[i] > 0) {
			if (prev >= 0) freq[i - prev] = (freq[i - prev] || 0) + 1;
			prev = i;
		}
	}

	let best = 1, max = 0;
	for (const v in freq) if (freq[v] > max) { max = freq[v]; best = +v; }
	return best;
}
