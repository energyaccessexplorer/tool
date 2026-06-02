import {
	analysis_colorscale,
} from './analysis.js';

import {
	qs,
} from '../lib/helpers.js';

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

	drawcanvas({
		"canvas":     canvas || qs('canvas#output'),
		"data":       data,
		"width":      OUTLINE.raster.width,
		"height":     OUTLINE.raster.height,
		"nodata":     -1,
		"colorscale": analysis_colorscale,
	});
};

const nice_distances_km = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

function nice_scale_distance(target_km) {
	return nice_distances_km.reduce((prev, curr) =>
		Math.abs(curr - target_km) < Math.abs(prev - target_km) ? curr : prev,
	);
}

function draw_north_arrow_canvas(ctx, centerX, topY, size, fs) {
	const halfW = size * 0.3;
	const midY  = topY + size * 0.55;

	ctx.save();

	ctx.beginPath();
	ctx.moveTo(centerX, topY);
	ctx.lineTo(centerX + halfW, midY);
	ctx.lineTo(centerX - halfW, midY);
	ctx.closePath();
	ctx.fillStyle = '#333333';
	ctx.fill();

	ctx.font = `bold ${fs}px sans-serif`;
	ctx.fillStyle = '#333333';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	ctx.fillText('N', centerX, topY - 2);

	ctx.restore();
}

export function draw_map_overlay(canvas) {
	const [minLng, minLat, maxLng, maxLat] = GEOGRAPHY.envelope;
	const centerLat = (minLat + maxLat) / 2;
	const totalKm   = (maxLng - minLng) * 111.32 * Math.cos(centerLat * Math.PI / 180);
	const kmPerPx   = totalKm / canvas.width;

	const niceKm = nice_scale_distance(kmPerPx * canvas.width * 0.2);
	const barPx  = Math.round(niceKm / kmPerPx);
	const niceMi = niceKm * 0.621371;

	const kmLabel = niceKm >= 1 ? `${niceKm} km` : `${Math.round(niceKm * 1000)} m`;
	const miLabel = niceMi >= 1 ? `${Math.round(niceMi)} mi` : `${Math.round(niceMi * 5280)} ft`;

	const w          = canvas.width;
	const h          = canvas.height;
	const fs         = Math.max(10, Math.round(w * 0.025));
	const margin     = Math.round(w * 0.03);
	const barH       = Math.max(6, Math.round(h * 0.012));
	const arrowSize  = Math.max(20, Math.round(w * 0.04));
	const tickH      = barH + 6;

	const barX   = margin;
	const barY   = h - margin - barH - Math.round(fs * 1.4);
	const arrowX = margin + Math.round(barPx / 2);
	const arrowY = barY - arrowSize - Math.round(fs * 1.4) - 4;

	const bgPad = Math.round(fs * 0.4);
	const bgX   = barX - bgPad;
	const bgY   = arrowY - bgPad - Math.round(fs * 1.2);
	const bgW   = barPx + bgPad * 2;
	const bgH   = h - margin - bgY;

	const ctx = canvas.getContext('2d');

	ctx.save();
	ctx.fillStyle = 'rgba(255,255,255,0.78)';
	ctx.fillRect(bgX, bgY, bgW, bgH);
	ctx.restore();

	draw_north_arrow_canvas(ctx, arrowX, arrowY, arrowSize, fs);

	ctx.save();

	ctx.fillStyle = '#333333';
	ctx.fillRect(barX, barY, barPx, barH);
	ctx.fillRect(barX, barY - 3, 2, tickH);
	ctx.fillRect(barX + barPx - 2, barY - 3, 2, tickH);

	ctx.font = `bold ${fs}px sans-serif`;
	ctx.textBaseline = 'top';

	ctx.textAlign = 'left';
	ctx.fillText('0', barX, barY + barH + 4);

	ctx.textAlign = 'right';
	ctx.fillText(`${kmLabel} / ${miLabel}`, barX + barPx, barY + barH + 4);

	ctx.restore();
};
