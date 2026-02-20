// Attemt to estimate real-world pixel sixe otherwise provided by GeoTIFF ModelPixelScale.
export function estimate_model_pixel_scale(data, width, height, nodata) {
	// Count value-changes per column (horizontal boundaries).
	const col_edges = new Uint32Array(width);
	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width - 1; col++) {
			const i = row * width + col;
			const a = data[i], b = data[i + 1];
			if (a !== nodata && b !== nodata && a !== b) col_edges[col]++;
		}
	}

	// Count value-changes per row (vertical boundaries).
	const row_edges = new Uint32Array(height);
	for (let row = 0; row < height - 1; row++) {
		for (let col = 0; col < width; col++) {
			const i = row * width + col;
			const a = data[i], b = data[i + width];
			if (a !== nodata && b !== nodata && a !== b) row_edges[row]++;
		}
	}

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
