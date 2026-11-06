/* Static map export (EAE-512)
 *
 * Composes the live map view onto A5 pages at 300dpi with the map furniture a
 * published figure needs — legend, scale bar, north arrow, data sources and
 * attributions — and hands the pages over as a PDF (pdf.ts), so a map can leave
 * the tool ready to print instead of being screenshotted.
 *
 * The map itself is the mapbox canvas as the browser already rendered it, so the
 * figure shows exactly what the user framed. With "Show analysis on map" off
 * that is a plain data-layer map: the priority ramp and the index lines would
 * describe nothing, so each visible layer carries its own legend instead and the
 * credits keep the block below. Whatever does not fit on the first page
 * continues on the next — a block never splits.
 */

import {
	fake_blob_download,
} from '../lib/helpers.js';

import {
	t,
	unesc,
	translateIndexName,
	translateDatasetName,
	translateDatasetAttribute,
} from './translate.js';

import {
	analysis_colorscale_svg,
} from './analysis.js';

import {
	activeDatasets,
	layer_legend,
} from './right-panel-shared.ts';

import type {
	LayerLegend,
	LegacyDataset,
} from './right-panel-shared.ts';

import {
	shown as analysis_shown,
	variant_label,
} from './output-widget.js';

import { export_filename } from './export.js';

import { pages_pdf } from './pdf.ts';

type Weight = 'normal' | 'bold';

interface TextOptions {
	readonly size?: number;
	readonly weight?: Weight;
	readonly color?: string;
	readonly align?: CanvasTextAlign;
}

interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

interface Column {
	readonly left: number;
	readonly right: number;
	readonly width: number;
	readonly bottom: number;
}

/** A dataset plus the provenance the source block reads. */
interface SourceDataset extends LegacyDataset {
	readonly metadata?: {
		readonly sources?: string | null;
		readonly license?: string | null;
	};
}

const DPI = 300;

const MM = DPI / 25.4;

/** A5 portrait: the "half A4" the ticket asks for. */
const A5: { readonly w: number; readonly h: number } = {
	"w": Math.round(148 * MM),
	"h": Math.round(210 * MM),
};

const MARGIN = Math.round(12 * MM);

/** Room kept under the content for the page number. */
const FOOT = 40;

const INK = '#1a1a1a';
const MUTED = '#6b6b6b';
const RULE = '#cccccc';
const HALO = 'rgba(255, 255, 255, 0.85)';
const SANS = 'sans-serif';

/** What the map keeps before the legend is pushed to the next page. */
const MIN_MAP_H = Math.round(55 * MM);

const GAP = 44;

const HEADING = 38;
const NAME_LINE = 32;
const LABEL_LINE = 26;

const RAMP_H = 26;
const RAMP_W = Math.round(70 * MM);
const MARK_W = RAMP_W;

const NICE_KM: readonly number[] = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

const NORTH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 26">
	<text x="10" y="7" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="bold" fill="#333">N</text>
	<polygon points="10,9 14,19 10,17 6,19" fill="#333"/>
</svg>`;

function slugify(str: string): string {
	return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Translated string for canvas drawing: the app escapes HTML entities for the
 * DOM, which would show up literally in a painted glyph run. */
function T(key: string, vars: Record<string, string | number> = {}): string {
	return unesc(t(window.LOCALE, key, vars) as string);
}

function set_font(ctx: CanvasRenderingContext2D, opts: TextOptions = {}): void {
	ctx.font = `${opts.weight ?? 'normal'} ${opts.size ?? 22}px ${SANS}`;
}

function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, opts: TextOptions = {}): void {
	if (!str) return;

	set_font(ctx, opts);
	ctx.fillStyle = opts.color ?? INK;
	ctx.textAlign = opts.align ?? 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillText(str, Math.round(x), Math.round(y));
}

/** Greedy wrap; a token wider than the column (CJK, a long URL) breaks by
 * character so nothing overflows the page. */
function wrap(ctx: CanvasRenderingContext2D, str: string, max_w: number, opts: TextOptions = {}): string[] {
	set_font(ctx, opts);

	const lines: string[] = [];
	let line = '';

	for (const word of str.split(/\s+/).filter(Boolean)) {
		const next = line ? `${line} ${word}` : word;

		if (ctx.measureText(next).width <= max_w) {
			line = next;
			continue;
		}

		if (line) lines.push(line);
		line = '';

		for (const ch of word) {
			if (line && ctx.measureText(line + ch).width > max_w) {
				lines.push(line);
				line = '';
			}

			line += ch;
		}
	}

	if (line) lines.push(line);

	return lines;
}

function load_image(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();

		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Could not load image: ${src.slice(0, 64)}`));
		img.src = src;
	});
}

/** Inline SVG as an image that can be drawn. Width and height are pinned on the
 * clone because the app's SVGs size themselves in percentages, which an <img>
 * has no viewport to resolve. */
function svg_image(node: Element, w: number, h: number): Promise<HTMLImageElement> {
	const clone = node.cloneNode(true) as Element;

	clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	clone.setAttribute('width', String(w));
	clone.setAttribute('height', String(h));

	return load_image('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
		new XMLSerializer().serializeToString(clone),
	));
}

/** 'idle' never fires when the map is already idle, so settle on a timer too. */
function map_idle(timeout = 8000): Promise<void> {
	return new Promise(resolve => {
		let done = false;

		const finish = (): void => {
			if (done) return;

			done = true;
			MAPBOX.off('idle', finish);
			resolve();
		};

		MAPBOX.on('idle', finish);
		window.setTimeout(finish, timeout);
	});
}

function column_for(page_h: number): Column {
	return {
		"left":   MARGIN,
		"right":  A5.w - MARGIN,
		"width":  A5.w - (2 * MARGIN),
		"bottom": page_h - MARGIN,
	};
}

interface Page {
	readonly canvas: HTMLCanvasElement;
	readonly ctx: CanvasRenderingContext2D;
	readonly column: Column;
	y: number;
}

interface Doc {
	readonly pages: Page[];
}

function start_page(): Page {
	const canvas = document.createElement('canvas');

	canvas.width = A5.w;
	canvas.height = A5.h;

	const ctx = canvas.getContext('2d');

	if (!ctx) throw new Error('No 2d context for a static map page');

	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, A5.w, A5.h);

	return { canvas, "ctx": ctx, "column": column_for(A5.h), "y": MARGIN };
}

function current(doc: Doc): Page {
	const page = doc.pages[doc.pages.length - 1];

	if (!page) throw new Error('The document has no page');

	return page;
}

/** A block starts on the page it fits on, so text never straddles a break. */
function fit(doc: Doc, height: number): Page {
	const page = current(doc);

	if (page.y + height <= page.column.bottom - FOOT) return page;

	const next = start_page();

	doc.pages.push(next);

	return next;
}

function meta_lines(): string[] {
	const geography = `${T('static_map.geography')}: ${GEOGRAPHY.name}`;

	if (!analysis_shown) return [geography];

	return [
		`${T('left_panel.output.prioritization_index_label')}: ${translateIndexName(window.LOCALE, STATE.index)}`,
		`${T('left_panel.output.analysis_area_label')}: ${variant_label()}`,
		geography,
	];
}

function header(ctx: CanvasRenderingContext2D, column: Column): number {
	const now = new Date();
	const stamp = `${now.toLocaleDateString(window.LOCALE)} ${now.toLocaleTimeString(window.LOCALE, { "hour": '2-digit', "minute": '2-digit' })}`;

	let y = MARGIN + 52;

	text(ctx, T('modal.export.static_map.image_title'), column.left, y, { "size": 52, "weight": 'bold' });
	text(ctx, stamp, column.right, y, { "size": 24, "align": 'right', "color": MUTED });

	y += 30;

	for (const meta of meta_lines()) {
		for (const line of wrap(ctx, meta, column.width, { "size": 26 })) {
			text(ctx, line, column.left, y, { "size": 26, "color": MUTED });
			y += 32;
		}
	}

	return y + 28;
}

/** The captured canvas is the whole viewport, so the map's own bounds give the
 * bar its length; the page scale is what makes it print at its labelled size. */
function scale_bar(ctx: CanvasRenderingContext2D, box: Box, km_per_px: number): void {
	const target = km_per_px * box.w * 0.25;
	const km = NICE_KM.reduce((prev, curr) => Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev);
	const bar_w = km / km_per_px;

	const mi = km * 0.621371;
	const label = `${km >= 1 ? `${km} km` : `${Math.round(km * 1000)} m`} / ${mi >= 1 ? `${Math.round(mi)} mi` : `${Math.round(mi * 5280)} ft`}`;

	const x = box.x + 18;
	const y = box.y + box.h - 42;
	const h = 12;

	ctx.fillStyle = HALO;
	ctx.fillRect(x - 8, y - 12, bar_w + 16, h + 34);

	ctx.fillStyle = INK;
	ctx.fillRect(x, y, bar_w, h);
	ctx.fillRect(x, y - 5, 3, h + 10);
	ctx.fillRect(x + bar_w - 3, y - 5, 3, h + 10);
	ctx.fillRect(x + (bar_w / 2) - 1, y - 3, 2, h + 6);

	text(ctx, label, x, y + h + 22, { "size": 24 });
}

function north_arrow(ctx: CanvasRenderingContext2D, box: Box, arrow: HTMLImageElement): void {
	const x = box.x + box.w - 42 - 18;
	const y = box.y + 18;

	ctx.fillStyle = HALO;
	ctx.fillRect(x - 8, y - 8, 58, 68);
	ctx.drawImage(arrow, x, y, 42, 54);
}

/** A layer paints one colour instead of a ramp: a dot, a stroke or a patch. */
function mark(ctx: CanvasRenderingContext2D, shape: 'point' | 'line' | 'area', color: string, x: number, y: number): void {
	const top = y - RAMP_H + 4;

	ctx.fillStyle = color;
	ctx.strokeStyle = color;

	if (shape === 'point') {
		ctx.beginPath();
		ctx.arc(x + 12, top + (RAMP_H / 2), 11, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.stroke();

		return;
	}

	if (shape === 'line') {
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.moveTo(x, top + (RAMP_H / 2));
		ctx.lineTo(x + (MARK_W / 3), top + (RAMP_H / 2));
		ctx.stroke();

		return;
	}

	ctx.fillRect(x, top, MARK_W / 3, RAMP_H);
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 2;
	ctx.strokeRect(x + 1, top + 1, (MARK_W / 3) - 2, RAMP_H - 2);
}

/** The same legend the layer's card draws: its ramp between its min / unit /
 * max ends, or, for a layer that paints one colour, the mark it puts on the map.
 * A mark carries no label: its card shows none either, and the only range those
 * layers declare is the proximity parameter the analysis reads, which says
 * nothing about what the dot or the line means. */
function layer_swatch(ctx: CanvasRenderingContext2D, legend: LayerLegend, x: number, y: number): void {
	const top = y - RAMP_H + 4;
	const { labels } = legend;

	if (legend.stops) {
		const stops = legend.stops;
		const gradient = ctx.createLinearGradient(x, top, x + RAMP_W, top);

		stops.forEach((color, i) => {
			gradient.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, color);
		});

		ctx.fillStyle = gradient;
		ctx.fillRect(x, top, RAMP_W, RAMP_H);
		ctx.strokeStyle = RULE;
		ctx.lineWidth = 1;
		ctx.strokeRect(x + 0.5, top + 0.5, RAMP_W - 1, RAMP_H - 1);

		if (!labels) return;

		const base = top + RAMP_H + LABEL_LINE;

		text(ctx, labels.min, x, base, { "size": 22, "color": MUTED });
		text(ctx, labels.mid, x + (RAMP_W / 2), base, { "size": 22, "color": MUTED, "align": 'center' });
		text(ctx, labels.max, x + RAMP_W, base, { "size": 22, "color": MUTED, "align": 'right' });

		return;
	}

	if (!legend.mark) return;

	mark(ctx, legend.mark.shape, legend.mark.color, x, y);
}

interface SourceGroup {
	readonly names: readonly string[];
	readonly sources: string;
}

interface SourceRow {
	readonly name_lines: readonly string[];
	readonly source_lines: readonly string[];
}

function dataset_sources(ds: SourceDataset): string {
	const sources = translateDatasetAttribute(window.LOCALE, ds, ds.metadata?.sources, 'sources') as string;
	const license = translateDatasetAttribute(window.LOCALE, ds, ds.metadata?.license, 'license') as string;

	// Same provider, different stray whitespace: those are one credit line, not
	// two, so the grouped block stays readable.
	const clean = (str: string): string => str.replace(/\s+/g, ' ').trim();
	const credit = clean(sources ?? '');
	const terms = clean(license ?? '');

	return terms ? `${credit} (${terms})` : credit;
}

/** Datasets that share a source string are listed once, under that source: a
 * map normally draws several layers from the same provider. */
function group_sources(list: readonly SourceDataset[]): SourceGroup[] {
	const by_sources = new Map<string, string[]>();

	for (const ds of list) {
		const sources_text = dataset_sources(ds);
		const names = by_sources.get(sources_text) ?? [];

		names.push(translateDatasetName(window.LOCALE, ds) as string);
		by_sources.set(sources_text, names);
	}

	return [...by_sources].map(([sources, names]) => ({ "sources": sources, "names": names }));
}

function source_rows(ctx: CanvasRenderingContext2D, column: Column): SourceRow[] {
	return group_sources(activeDatasets() as readonly SourceDataset[]).map(group => ({
		"name_lines":   wrap(ctx, group.names.join(', '), column.width, { "size": 26, "weight": 'bold' }),
		"source_lines": group.sources ? wrap(ctx, group.sources, column.width, { "size": 24 }) : [],
	}));
}

function layer_name_lines(ctx: CanvasRenderingContext2D, column: Column, ds: SourceDataset): string[] {
	return wrap(ctx, translateDatasetName(window.LOCALE, ds) as string, column.width, { "size": 26, "weight": 'bold' });
}

function swatch_lines(legend: LayerLegend | null): number {
	if (!legend) return 0;

	return RAMP_H + (legend.stops && legend.labels ? 48 : 30);
}

function layer_item_height(ctx: CanvasRenderingContext2D, column: Column, ds: SourceDataset): number {
	return (layer_name_lines(ctx, column, ds).length * NAME_LINE) + swatch_lines(layer_legend(ds));
}

function legend_height(ctx: CanvasRenderingContext2D, column: Column): number {
	if (analysis_shown) return HEADING + 20 + RAMP_H + LABEL_LINE;

	const list = activeDatasets() as readonly SourceDataset[];

	if (!list.length) return 0;

	return HEADING + list.reduce((sum, ds) => sum + layer_item_height(ctx, column, ds), 0);
}


/** The analysis ramp: the only legend while the prioritized areas are on the map. */
function draw_priority_legend(doc: Doc, image: HTMLImageElement, width: number): void {
	const page = fit(doc, HEADING + 20 + RAMP_H + LABEL_LINE);
	const { ctx, column } = page;

	text(ctx, T('left_panel.output.priority_legend'), column.left, page.y, { "size": 28, "weight": 'bold' });

	const top = page.y + 20;

	ctx.drawImage(image, column.left, top, width, RAMP_H);

	const base = top + RAMP_H + LABEL_LINE;
	const labels = ['low', 'medium', 'high'].map(k => T(`left_panel.output.ramp.${k}`));

	text(ctx, labels[0] ?? '', column.left, base, { "size": 24 });
	text(ctx, labels[1] ?? '', column.left + (width / 2), base, { "size": 24, "align": 'center' });
	text(ctx, labels[2] ?? '', column.left + width, base, { "size": 24, "align": 'right' });

	page.y = base + GAP;
}

/** What the map draws, layer by layer, with the legend each card shows. */
function draw_layers(doc: Doc): void {
	const list = activeDatasets() as readonly SourceDataset[];

	if (!list.length) return;

	let page = fit(doc, HEADING);

	text(page.ctx, T('static_map.map_layers'), page.column.left, page.y, { "size": 28, "weight": 'bold' });
	page.y += HEADING;

	for (const ds of list) {
		page = fit(doc, layer_item_height(page.ctx, page.column, ds));

		const { ctx, column } = page;

		for (const line of layer_name_lines(ctx, column, ds)) {
			text(ctx, line, column.left, page.y, { "size": 26, "weight": 'bold' });
			page.y += NAME_LINE;
		}

		const item = layer_legend(ds);

		if (item) layer_swatch(ctx, item, column.left, page.y + 2);

		page.y += swatch_lines(item);
	}

	page.y += 20;
}

/** Every visible layer is credited here, grouped by provider. */
function draw_sources(doc: Doc): void {
	let page = fit(doc, HEADING);

	text(page.ctx, T('static_map.data_source'), page.column.left, page.y, { "size": 28, "weight": 'bold' });
	page.y += HEADING;

	for (const row of source_rows(page.ctx, page.column)) {
		const height = ((row.name_lines.length + row.source_lines.length) * NAME_LINE) + 6;

		page = fit(doc, height);

		for (const line of row.name_lines) {
			text(page.ctx, line, page.column.left, page.y, { "size": 26, "weight": 'bold' });
			page.y += NAME_LINE;
		}

		for (const line of row.source_lines) {
			text(page.ctx, line, page.column.left, page.y, { "size": 24, "color": MUTED });
			page.y += NAME_LINE;
		}

		page.y += 6;
	}

	page.y += GAP;
}

function draw_attributions(doc: Doc): void {
	const page = fit(doc, 34 + LABEL_LINE);

	text(page.ctx, T('static_map.attributions'), page.column.left, page.y + 34, { "size": 28, "weight": 'bold' });
	text(page.ctx, T('static_map.mapbox_attribution'), page.column.left, page.y + 34 + LABEL_LINE, { "size": 24, "color": MUTED });

	page.y += 34 + LABEL_LINE;
}

function draw_map(page: Page, capture: HTMLCanvasElement, arrow: HTMLImageElement, reserve: number): void {
	const { ctx, column } = page;
	const available = column.bottom - FOOT - page.y;
	const scale = Math.min(column.width / capture.width, Math.max(available - reserve, MIN_MAP_H) / capture.height);

	const box: Box = {
		"w": Math.round(capture.width * scale),
		"h": Math.round(capture.height * scale),
		"x": Math.round(column.left + ((column.width - (capture.width * scale)) / 2)),
		"y": Math.round(page.y),
	};

	ctx.drawImage(capture, box.x, box.y, box.w, box.h);

	ctx.strokeStyle = RULE;
	ctx.lineWidth = 1;
	ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);

	const bounds = MAPBOX.getBounds();
	const center_lat = (bounds.getNorth() + bounds.getSouth()) / 2;
	const span_km = (bounds.getEast() - bounds.getWest()) * 111.32 * Math.cos(center_lat * (Math.PI / 180));

	scale_bar(ctx, box, span_km / box.w);
	north_arrow(ctx, box, arrow);

	page.y = box.y + box.h + GAP;
}

/** Number every page in the foot, which is also what `fit()` reserves. */
function draw_page_numbers(doc: Doc): void {
	const total = doc.pages.length;

	doc.pages.forEach((page, i) => {
		text(page.ctx, `${i + 1}/${total}`, page.column.right, page.column.bottom - 8, {
			"size": 20,
			"align": 'right',
			"color": MUTED,
		});
	});
}

async function render(capture: HTMLCanvasElement): Promise<HTMLCanvasElement[]> {
	const arrow = await svg_image(
		new DOMParser().parseFromString(NORTH_SVG, 'image/svg+xml').documentElement,
		42,
		54,
	);

	const first = start_page();
	const doc: Doc = { "pages": [first] };

	const column = first.column;

	first.y = header(first.ctx, column);

	// The legend starts on the first page when it can, so reserve as much of the
	// page for it as it needs — up to half — and let the map keep the rest.
	const legend_needed = legend_height(first.ctx, column);
	const room = column.bottom - FOOT - first.y;
	const reserve = Math.min(legend_needed + HEADING + GAP, Math.round(room * 0.5));

	const ramp_w = Math.min(Math.round(column.width * 0.45), 620);
	const ramp_image = analysis_shown
		? await svg_image(analysis_colorscale_svg as Element, ramp_w, RAMP_H)
		: null;

	draw_map(first, capture, arrow, reserve);

	if (ramp_image) draw_priority_legend(doc, ramp_image, ramp_w);
	else draw_layers(doc);

	draw_sources(doc);
	draw_attributions(doc);
	draw_page_numbers(doc);

	return doc.pages.map(page => page.canvas);
}

export async function download_static_map(): Promise<void> {
	await map_idle();

	const pages = await render(MAPBOX.getCanvas());
	const blob = await pages_pdf(pages);

	await fake_blob_download(blob, export_filename(`${slugify(GEOGRAPHY.name)}-map`, 'pdf'), 'application/pdf');
}
