import { compute_share_amounts, share_scale_colors, share_scale_labels, OUTSIDE_BUCKET } from './summary.js';

import '../lib/jszip.js';

import '../lib/pptxgen.js';

import {
	aggregate_layer_values,
	analysis_cells,
	medhigh_point_count,
} from './analysis.ts';

import {
	build_detailed_data,
	compute_distribution,
	describe,
} from './right-panel-data-tab.js';

import {
	get_locations_results,
} from './right-panel-high-priority-areas.js';

import {
	prepare_tabular_data,
	generate_rows,
} from './area-analysis.js';

import {
	area_type,
	svg_pie,
} from './utils.js';

import {
	and,
	or,
} from '../lib/helpers.js';

import {
	t,
	translateDatasetName,
	translateIndexName,
	unesc,
} from './translate.js';

const N_POINTS = 20;

export const PPT_MAX_COLUMNS = 8;

const green = "#00794C";
const white = "#ffffff";
const EMAIL = 'energyaccessexplorer@wri.org';
const ATTRIBUTION_URL = 'https://www.energyaccessexplorer.org/attribution/';
const black = "#393F44";
const grey = "#F9F8F8";
const bold = true;
const breakLine = true;
const x = 0.3;
const first_paragraph_y = 2;

const tableborder = { "pt": "1", "color": "#ffffff" };

// High down to Low, then the out-of-analysis residual. Same order as the tool's
// Area/Population share cards, whose discrete scale the report repeats.
const SHARE_ORDER = [4, 3, 2, 1, 0, OUTSIDE_BUCKET];

function a4(t, c) {
	if (c === 'x')
		return 11.69 * (t/100);

	else if (c === 'y')
		return 8.26 * (t/100);
}

// The analysis domain is rescaled to the selection, so its bounds arrive as float
// noise — 45000 shows up as 44999.999999999985. Print the value the tool shows.
function range_text(domain) {
	const bound = v => Number.isFinite(Number(v)) ? parseFloat(Number(v).toFixed(2)) : v;

	return `min: ${bound(domain.min)}, max: ${bound(domain.max)}`;
};

// The deck carries no SVG pictures: PowerPoint sizes an SVG with a viewBox to the
// viewBox rather than its frame, and some builds drop or misplace SVG-backed pictures.
async function svg_bitmap(svg, w, h) {
	const url = URL.createObjectURL(new Blob([svg], { "type": 'image/svg+xml' }));

	try {
		const img = new Image();
		img.src = url;
		await img.decode();

		// ~600ppi at the placed size, so it stays sharp if it is scaled up.
		const c = document.createElement('canvas');
		c.width  = Math.round(w * 600);
		c.height = Math.round(h * 600);

		c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);

		return c.toDataURL('image/png');
	} finally {
		URL.revokeObjectURL(url);
	}
};

async function logo_bitmap(path, w, h) {
	return svg_bitmap(await (await fetch(path)).text(), w, h);
};

function load_image(src) {
	const img = new Image();
	img.src = src;

	return img.decode().then(() => img);
};

// The basemap and the inset choropleth go in as one flattened picture: stacked, the
// PowerPoint can draw the wrong image for one of two pictures stacked in a frame.
async function compose_map(basemap, choropleth, w, h, fx, fy, fw, fh, overlay) {
	const base = await load_image(basemap);
	const over = await load_image(choropleth);

	// Compose at the basemap's own resolution, which is already the ~150ppi the map is
	// placed at, so neither layer is upsampled.
	const c = document.createElement('canvas');
	c.width  = base.naturalWidth  || Math.round(w * 150);
	c.height = base.naturalHeight || Math.round(h * 150);

	const ctx = c.getContext('2d');
	ctx.drawImage(base, 0, 0, c.width, c.height);
	ctx.drawImage(over, fx * c.width, fy * c.height, fw * c.width, fh * c.height);
	if (overlay)
		ctx.drawImage(overlay, fx * c.width, fy * c.height, fw * c.width, fh * c.height);

	// Opaque and photographic: JPEG is a fifth of the PNG's size, and PowerPoint
	// mishandles some canvas-encoded PNGs.
	return c.toDataURL('image/jpeg', 0.92);
};

// The administrative subdivisions the choropleth averages over, drawn as boundary
// lines: the basemap shows country borders only, so without these the units are
// blobs with no delineation.
function division_boundaries(division) {
	const data = division.raster.data;
	const W = division.raster.width;
	const H = division.raster.height;
	const nodata = division.raster.nodata;

	const c = document.createElement('canvas');
	c.width = W;
	c.height = H;

	const ctx = c.getContext('2d');
	const img = ctx.createImageData(W, H);
	const px = img.data;

	const line = x => x !== -1 && x !== nodata;

	for (let yy = 0; yy < H; yy++)
		for (let xx = 0; xx < W; xx++) {
			const i = yy * W + xx;
			const v = data[i];
			if (!line(v)) continue;
			if ((xx < W - 1 && line(data[i + 1]) && data[i + 1] !== v) ||
			    (yy < H - 1 && line(data[i + W]) && data[i + W] !== v)) {
				const o = i * 4;
				px[o] = 80; px[o + 1] = 80; px[o + 2] = 80; px[o + 3] = 230;
			}
		}

	ctx.putImageData(img, 0, 0);
	return c;
};

// Set once per export (see pptx): the footer logo, sized for its frame.
let FOOTER_LOGO = null;

function textopts($) {
	return Object.assign({ "color": black, "fontSize": 12, "valign": "top" }, $);
};

// pptxgenjs fills take rrggbb; the colourscales carry css rgb()/rgba() strings.
function fill_color(color) {
	const m = /rgba?\(([0-9]{1,3}), ?([0-9]{1,3}), ?([0-9]{1,3})/.exec(color || '');

	if (m) return m.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('');

	return (color || 'cccccc').replace(/^#/, '');
};

// The tool's Data card picks a donut for a small distribution and bars for a large
// one (right-panel-data-tab.ts); the report mirrors that so the two read alike.
const DONUT_MAX = 5;
const card_top_h = 0.5;
const chart_head_h = 0.3;

function is_categorical(ds) {
	return !!ds && (ds.type === 'raster-valued' || ds.type === 'raster-valued-mutant');
};

function card_height(ds) {
	if (!is_categorical(ds)) return 1.55;

	const distribution = compute_distribution(ds, null);
	if (!distribution?.length) return 1.55;

	const chart_h = distribution.length <= DONUT_MAX
		? 1
		: Math.max(1, distribution.length * 0.135);

	// 0.35 leaves the gap the grey panel keeps under each card.
	return card_top_h + chart_head_h + chart_h + 0.35;
};

function footer($) {
	const h = 0.5;

	$.addShape(
		'rect',
		{ "x": 0, "y": a4(100, 'y') - 0.5, "w": a4(100, 'x'), h, "fill": { "color": green } },
	);

	$.addImage(Object.assign(
		{ "x": 0.5, "y": (a4(100, 'y') - h) + 0.075, "w": 0.62, "h": 0.35 },
		FOOTER_LOGO ? { "data": FOOTER_LOGO } : { "path": `${window.BASE}/images/EAE%20Logo_Compact%20White.svg` },
	));
};

function chapter(number, name) {
	const $ = this.addSlide();

	$.addShape(
		this.ShapeType.rect,
		{ "x": "5%", "y": "5%", "w": 0.8, "h": 0.6, "fill": { "color": green } },
	);

	$.addText(
		number,
		{ "x": a4(5, 'x') + 0.2, "y": a4(5, 'y') + 0.1, "w": 0.5, "h": 0.5, "color": white, "fontSize": 24, "bold": true },
	);

	$.addText(
		name,
		{ "color": green, x, "y": a4(50, 'y'), "w": "90%", "h": 2, "fontSize": 48, bold },
	);

	footer($);
};

function title($, text) {
	$.addText(
		text,
		{ "color": green, x, "y": 0.3, "w": "90%", "h": 0.5, "fontSize": 22, bold },
	);
};

async function front() {
	const $ = this.addSlide();
	const color = white;

	$.background = { "color": green };
	$.color = color;

	$.addImage({
		"x":    0.5,
		"y":    0.5,
		"w":    3.2,
		"h":    0.75,
		"data": await logo_bitmap(`${window.BASE}/images/EAE%20Logo_Horizontal%20White.svg`, 3.2, 0.75),
	});

	$.addText(
		[
			{
				"text":    t(window.LOCALE, 'report.front.title'),
				"options": { "fontSize": 48, bold, breakLine },
			}, {
				"text":    GEOGRAPHY.name,
				"options": { "fontSize": 48, bold, breakLine },
			}, {
				"text":    t(window.LOCALE, 'report.front.subtitle'),
				"options": { "fontSize": 10 },
			},
		],
		{ color, x, "y": "50%", "w": "90%", "h": 2.5 },
	);

	$.addText(
		[
			{
				"text":    t(window.LOCALE, 'report.front.prepared_by'),
				"options": { bold, breakLine },
			}, {
				"text":    t(window.LOCALE, 'report.front.developed_with'),
				"options": { breakLine },
			}, {
				"text":    "https://www.energyaccessexplorer.org/",
				"options": { "fontSize": 8 },
			},
		],
		{ x, "y": "90%", "w": "70%", "h": 0.8, "fontSize": 10 },
	);

	$.addText(
		(new Date()).toDateString(),
		{ "x": "85%", "y": "90%", "w": "12%", "h": 0.3, "fontSize": 9, bold },
	);
};

function platform_overview() {
	const $ = this.addSlide();
	const color = black;

	title($, t(window.LOCALE, 'report.overview.title'));

	$.addText(
		t(window.LOCALE, 'report.overview.what_we_do'),
		{ color, x, "y": 1.1, "w": "90%", "h": 1.3, "fontSize": 12, bold },
	);

	$.addText(
		t(window.LOCALE, 'report.overview.audiences_title'),
		{ "color": green, x, "y": 2.7, "w": "90%", "h": 0.4, "fontSize": 12, bold },
	);

	const audiences = [
		'planning',
		'enterprise',
		'donors',
		'service',
		'cooking',
	];

	let y = 3.25;
	for (const key of audiences) {
		$.addText(
			[
				{
					"text":    t(window.LOCALE, `report.overview.audience.${key}.name`) + " ",
					"options": { bold },
				}, {
					"text": t(window.LOCALE, `report.overview.audience.${key}.desc`),
				},
			],
			textopts({ color, x, y, "w": "90%", "h": 0.8, "fontSize": 10 }),
		);

		y += 0.82;
	}

	footer($);
};

function how_it_works() {
	const $ = this.addSlide();
	const color = black;

	title($, t(window.LOCALE, 'report.how.title'));

	$.addText(
		t(window.LOCALE, 'report.how.para1'),
		{ color, x, "y": 1.1, "w": "90%", "h": 1.5, "fontSize": 12, bold },
	);

	$.addText(
		t(window.LOCALE, 'report.how.para2'),
		{ color, x, "y": 2.8, "w": "90%", "h": 1.5, "fontSize": 11 },
	);

	$.addText(
		t(window.LOCALE, 'report.how.methodology'),
		{ "color": green, x, "y": 4.5, "w": "90%", "h": 0.4, "fontSize": 12, bold },
	);

	const demand_color = "#1B4B8F";

	const stages = [
		{
			"key": "datasets",
			"sub": [
				{ "key": "demand", "color": demand_color },
				{ "key": "supply", "color": green },
			],
		}, {
			"key": "interactions",
		}, {
			"key": "analysis",
		}, {
			"key": "maps",
		},
	];

	const box_w = 2.4;
	const box_h = 1.5;
	const gap = 0.35;
	const box_y = 5.05;

	stages.forEach((stage, i) => {
		const box_x = x + (i * (box_w + gap));

		$.addShape(
			this.ShapeType.rect,
			{ "x": box_x, "y": box_y, "w": box_w, "h": box_h, "fill": { "color": grey } },
		);

		const runs = [
			{
				"text":    t(window.LOCALE, `report.how.stage.${stage.key}.name`),
				"options": { bold, breakLine, "color": green, "fontSize": 11 },
			},
		];

		if (stage.sub) {
			for (const s of stage.sub) {
				runs.push({
					"text":    t(window.LOCALE, `report.how.stage.${stage.key}.${s.key}`) + ": ",
					"options": { bold, "color": s.color, "fontSize": 9 },
				});
				runs.push({
					"text":    t(window.LOCALE, `report.how.stage.${stage.key}.${s.key}.desc`),
					"options": { breakLine, "color": black, "fontSize": 9 },
				});
			}
		} else {
			runs.push({
				"text":    t(window.LOCALE, `report.how.stage.${stage.key}.desc`),
				"options": { "color": black, "fontSize": 9 },
			});
		}

		$.addText(
			runs,
			{ "x": box_x + 0.1, "y": box_y + 0.1, "w": box_w - 0.2, "h": box_h - 0.2, "valign": "top" },
		);

		if (i < stages.length - 1) {
			// Drawn, not typed: the width of the "→" glyph follows whichever font the
			// reader substitutes. A shaft plus a head, as a connector needs a zero-height
			// <a:ext>.
			const ay = box_y + (box_h / 2);
			const ax = box_x + box_w + 0.055;

			$.addShape(this.ShapeType.rect, {
				"x":    ax,
				"y":    ay - 0.014,
				"w":    0.175,
				"h":    0.028,
				"fill": { "color": green },
				"line": { "color": green, "width": 0 },
			});

			$.addShape(this.ShapeType.triangle, {
				"x":      ax + 0.165,
				"y":      ay - 0.0375,
				"w":      0.075,
				"h":      0.075,
				"rotate": 90,
				"fill":   { "color": green },
				"line":   { "color": green, "width": 0 },
			});
		}
	});

	footer($);
};

function open_data() {
	const $ = this.addSlide();
	const color = black;

	title($, t(window.LOCALE, 'report.open_data.title'));

	const para1_runs = [];
	t(window.LOCALE, 'report.open_data.para1').split(EMAIL).forEach((part, i, parts) => {
		if (part) para1_runs.push({ "text": part, "options": { color } });

		if (i < parts.length - 1) {
			para1_runs.push({
				"text":    EMAIL,
				"options": { "color": green, "underline": true, "hyperlink": { "url": `mailto:${EMAIL}` } },
			});
		}
	});

	$.addText(
		para1_runs,
		{ color, x, "y": 1.1, "w": "90%", "h": 1.6, "fontSize": 12 },
	);

	$.addText(
		t(window.LOCALE, 'report.open_data.para2'),
		{ color, x, "y": 2.9, "w": "90%", "h": 2.2, "fontSize": 11 },
	);

	$.addText(
		[{
			"text":    t(window.LOCALE, 'report.attribution'),
			"options": { "color": green, "underline": true, "hyperlink": { "url": ATTRIBUTION_URL } },
		}],
		{ x, "y": 5.4, "w": "90%", "h": 0.8, "fontSize": 10, bold },
	);

	footer($);
};

function selected_datasets() {
	for (const index of ['demand', 'supply']) {
		if (!STATE.config.datasets.some(d => d.index === index))
			continue;

		selected_datasets_index(this.addSlide(), index);
	}
};

function selected_datasets_index($, index) {
	title($, t(window.LOCALE, 'report.datasets.title', { "index": translateIndexName(window.LOCALE, index) }));

	const rows = [[
		{
			"text":    t(window.LOCALE, 'report.datasets.col.dataset'),
			"options": textopts({ "align": "left", bold }),
		}, {
			"text":    t(window.LOCALE, 'report.datasets.col.unit'),
			"options": textopts({ "align": "left", bold }),
		}, {
			"text":    t(window.LOCALE, 'report.datasets.col.range'),
			"options": textopts({ "align": "left", bold }),
		}, {
			"text":    t(window.LOCALE, 'report.datasets.col.selected_range'),
			"options": textopts({ "align": "left", bold }),
		}, {
			"text":    t(window.LOCALE, 'report.datasets.col.importance'),
			"options": textopts({ "align": "left", bold }),
		},
	]];

	const monospace = { "align": "left", "valign": "middle", "fontFace": "monospace", "fontSize": 9 };

	const selected = STATE.config.datasets
		.filter(d => d.index === index)
		.map(d => ([
			{
				"text":    d.name,
				"options": textopts({ "align": "left" }),
			}, {
				"text": d.unit ? d.unit.replace('<sup>2</sup>', '²') : t(window.LOCALE, 'report.datasets.proximity'),
			}, {
				"text":    range_text(d.domain),
				"options": textopts(monospace),
			}, {
				"text":    range_text(d._domain),
				"options": textopts(monospace),
			}, {
				"text":    d.weight,
				"options": textopts(monospace),
			},
		]));

	const tabletextopts = Object.assign(textopts({ "fontSize": 10, "align": "left", "valign": "middle" }));

	$.addTable(rows.concat(selected), Object.assign(tabletextopts, { x, "y": first_paragraph_y, "w": "90%" }));

	footer($);
};

async function selected_data() {
	const summary = SUMMARY[STATE.index];
	if (!summary || !summary['raw_raster']) return;

	let entries = [];

	try {
		// EAE-521: the cells come from the memoised analysis result (the same
		// raster SUMMARY.raw_raster holds — one run() per reload now). This
		// deck's own "analysed cells" rule — every cell the analysis scored,
		// v !== -1 — is deliberately kept AS-IS: it is one of the three
		// conflicting definitions (notes §6.6) — it keeps the bottom band
		// has_priority_score() drops and is neither the result's per-area
		// values mask nor its whole-outline national one — so its aggregate
		// stays computed here until the mask unification lands (plan §5 step 5).
		const raster = (await analysis_cells(STATE.index)).raster;
		const mask = { "raster": { "data": raster.map(v => v === -1 ? -1 : 0) } };
		const layer_data = await aggregate_layer_values(mask);
		if (!layer_data) return;

		entries = build_detailed_data(layer_data);
	} catch {
		return;
	}

	// Raster-valued data (OnStove technology mix, OnSSET LULC, ...) has no single
	// display value: it never reaches the aggregate below, so it is taken straight
	// from the active datasets and reported as a distribution (see data_card_body).
	const cards = entries.filter(e => {
		const ds = DST.get(e.id);
		if (is_categorical(ds)) return false;

		return e.value != null && String(e.value).trim() !== '' && String(e.value) !== 'NaN';
	});

	for (const ds of STATE.datasets) {
		if (!is_categorical(ds)) continue;
		if (compute_distribution(ds, null)?.length) cards.push({ "id": ds.id, "label": ds.name });
	}

	if (!cards.length) return;

	// Cards size themselves to their distribution, so they run down the slide until
	// the next one would cross the footer band and then start a new slide.
	const top_y = 1.0;
	const bottom_y = a4(100, 'y') - 0.65;
	const card_w = a4(100, 'x') - (x * 2);

	const pages = [];
	let page = null;
	let card_y = top_y;

	for (const e of cards) {
		const ds = DST.get(e.id);
		const card_h = card_height(ds);

		if (!page || card_y + card_h > bottom_y) {
			page = this.addSlide();
			pages.push(page);

			title(page, pages.length === 1 ? t(window.LOCALE, 'report.data.title') : t(window.LOCALE, 'report.data.title_continued'));
			card_y = top_y;
		}

		page.addShape(
			this.ShapeType.rect,
			{ "x": x, "y": card_y, "w": card_w, "h": card_h - 0.2, "fill": { "color": grey } },
		);

		const label = ds ? translateDatasetName(window.LOCALE, ds) : e.label;

		page.addText(
			label,
			textopts({ "color": green, "x": x + 0.15, "y": card_y + 0.08, "w": card_w - 0.3, "h": 0.35, bold, "fontSize": 12 }),
		);

		await data_card_body(page, e, ds, x + 0.15, card_y + card_top_h, card_w - 0.3, card_h - 0.7);

		card_y += card_h;
	}

	for (const p of pages) footer(p);
};

async function data_card_body($, e, ds, tx, ty, tw, th) {
	const distribution = is_categorical(ds) ? compute_distribution(ds, null) : null;

	if (distribution?.length) {
		$.addText(
			t(window.LOCALE, 'right_panel.data.categorical_desc', { "name": translateDatasetName(window.LOCALE, ds) }).replace(/<\/?strong>/g, ''),
			textopts({ "x": tx, "y": ty, "w": tw, "h": chart_head_h, "color": black, "fontSize": 11 }),
		);

		const chart_y = ty + chart_head_h;

		if (distribution.length <= DONUT_MAX) {
			const s = 1;

			const donut = svg_pie(
				distribution.map(c => [c.percentage]),
				66,
				33,
				distribution.map(c => c.color),
				v => `${v.toFixed(1)}%`,
			);

			$.addImage({
				"x":    tx + tw - s,
				"y":    chart_y,
				"w":    s,
				"h":    s,
				"data": await svg_bitmap(donut.svg.outerHTML, s, s),
			});

			// Every slice is named and quantified in the scale beside the donut: a
			// printed slide has no hover bubble to read the shares off.
			let ly = chart_y + 0.02;

			for (const c of distribution) {
				$.addShape('rect', { "x": tx, "y": ly + 0.035, "w": 0.09, "h": 0.07, "fill": { "color": fill_color(c.color) } });

				$.addText(
					c.name,
					textopts({ "x": tx + 0.14, "y": ly, "w": 1.6, "h": 0.17, "fontSize": 9 }),
				);

				$.addText(
					`${c.percentage.toFixed(1)}%`,
					textopts({ "x": tx + 1.7, "y": ly, "w": 0.6, "h": 0.17, "fontSize": 9, "align": "right" }),
				);

				ly += 0.17;
			}

			return;
		}

		const sorted  = [...distribution].sort((a, b) => b.percentage - a.percentage);
		const max_pct = sorted[0].percentage || 1;
		const row_h   = 0.135;
		const name_w  = 2.4;
		const value_w = 0.7;
		const bar_w   = tw - name_w - value_w - 0.3;

		sorted.forEach((c, i) => {
			const ly = chart_y + (i * row_h);

			$.addText(
				c.name,
				textopts({ "x": tx, "y": ly, "w": name_w, "h": row_h, "fontSize": 9, "valign": "middle" }),
			);

			$.addShape('rect', {
				"x":    tx + name_w,
				"y":    ly + 0.035,
				"w":    bar_w * (c.percentage / max_pct),
				"h":    row_h - 0.07,
				"fill": { "color": fill_color(c.color) },
			});

			$.addText(
				`${c.percentage.toFixed(1)}%`,
				textopts({ "x": tx + name_w + bar_w + 0.1, "y": ly, "w": value_w, "h": row_h, "fontSize": 9, "align": "right", "valign": "middle" }),
			);
		});

		return;
	}

	const name = ds ? translateDatasetName(window.LOCALE, ds) : e.label;
	const description = unesc(describe(e.datatype, e.unit, name, e.value, e.aggregation)).replace(/<\/?strong>/g, '');

	const runs = [];
	if (e.value) {
		const parts = description.split(e.value);
		parts.forEach((part, i) => {
			if (part)
				runs.push({ "text": part, "options": { "color": black } });
			if (i < parts.length - 1)
				runs.push({ "text": e.value, "options": { "color": green, bold } });
		});
	}

	$.addText(runs.length ? runs : description, textopts({ "x": tx, "y": ty, "w": tw, "h": th, "fontSize": 11 }));
}
function geography_indexes() {
	const $ = this.addSlide();

	geography_indexes_left.call(this, $);
	geography_indexes_right.call(this, $);

	footer($);
};

function geography_indexes_left($) {
	title($, GEOGRAPHY.name);

	$.addText(
		t(window.LOCALE, 'report.geography.outputs'),
		textopts({ x, "y": 1, "w": "45%", "h": 0.4, bold }),
	);

	let y = 2;
	for (const i of ['eai', 'demand', 'supply', 'ani']) {
		$.addText(
			[
				{
					"text":    translateIndexName(window.LOCALE, i) + " ",
					"options": { bold },
				}, {
					"text": t(window.LOCALE, 'modal.eae_info.index.' + i + '.explain'),
				},
			],
			textopts({ x, y, "w": "45%", "h": 1, "fontSize": 11 }),
		);

		y += 1.2;
	}
};

function geography_indexes_right($) {
	const tabletextopts = Object.assign(textopts({ "fontSize": 7, "align": "left", "valign": "middle", "margin": 0 }));

	function th(o = {}) {
		return Object.assign({}, tabletextopts, { bold, "color": white, "align": "left" }, o);
	};

	const cs = share_scale_colors();

	// Row heights are fixed and every cell is sized to stay on its own line, so the
	// height the table actually takes is known: the totals below are positioned from
	// it and can never land on the last row.
	const header_h = 0.5;
	const row_h = 0.34;

	function table(c, y) {
		// The same six legend entries as the UI's Area/Population share cards, in the
		// same order. Only the two light fills (High and the residual) take dark text.
		const order  = SHARE_ORDER;
		const labels = share_scale_labels(window.LOCALE);

		const header_cells = order.map(i => ({
			"text":    labels[i],
			"options": th(i >= 4 ? { "fill": fill_color(cs[i]), "color": black, "margin": 0.02 } : { "fill": fill_color(cs[i]), "margin": 0.02 }),
		}));

		const rows = [
			[
				{ "text": "" },
				...header_cells,
			],
		];

		for (const k of Object.keys(SUMMARY)) {
			const r = [];

			r.push({ "text": translateIndexName(window.LOCALE, k), "options": Object.assign({ bold }, tabletextopts) });

			const amounts = compute_share_amounts(SUMMARY[k][c]).amounts;
			r.push(...order.map(i => ({ "text": amounts[i].toLocaleString(window.LOCALE), "options": tabletextopts })));

			rows.push(r);
		}

		$.addTable(
			rows,
			Object.assign(
				{ "x": "51%", y, "w": "45%", "rowH": rows.map((_, i) => i === 0 ? header_h : row_h), "colW": [1.45, 0.635, 0.635, 0.635, 0.635, 0.635, 0.635] },
				tabletextopts,
			),
		);

		return header_h + ((rows.length - 1) * row_h);
	};

	$.addShape(
		this.ShapeType.rect,
		{ "x": "50%", "y": 0, "w": "50%", "h": "100%", "fill": { "color": grey } },
	);

	const area_title_y = 1.5;
	const area_table_y = 1.95;

	$.addText(
		t(window.LOCALE, 'report.geography.area_share', { "unit": area_type(STATE.variant) }),
		textopts({ "x": "55%", "y": area_title_y, "w": "40%", "h": 0.4, bold, "color": green }),
	);

	const area_total_y = area_table_y + table('area', area_table_y) + 0.05;

	const pop_title_y = area_total_y + 0.59;
	const pop_table_y = pop_title_y + 0.45;

	$.addText(
		t(window.LOCALE, 'report.geography.pop_share'),
		textopts({ "x": "55%", "y": pop_title_y, "w": "40%", "h": 0.4, bold, "color": green }),
	);

	const pop_total_y = pop_table_y + table('population-density', pop_table_y) + 0.05;

	const summary = SUMMARY[STATE.index];

	if (summary) {
		const area_share = compute_share_amounts(summary['area']);
		const pop_share = compute_share_amounts(summary['population-density']);

		const area_unit = area_type(STATE.variant);

		$.addText(
			t(window.LOCALE, 'report.geography.total_area', { "total": area_share.total.toLocaleString(window.LOCALE), "high": area_share.amounts[4].toLocaleString(window.LOCALE), "unit": area_unit }),
			textopts({ "x": "51%", "y": area_total_y, "w": "45%", "h": 0.3, "fontSize": 9 }),
		);

		$.addText(
			t(window.LOCALE, 'report.geography.total_pop', { "total": pop_share.total.toLocaleString(window.LOCALE), "high": pop_share.amounts[4].toLocaleString(window.LOCALE) }),
			textopts({ "x": "51%", "y": pop_total_y, "w": "45%", "h": 0.3, "fontSize": 9 }),
		);
	}
};

async function analysis(index) {
	function row(d) {
		return [
			{
				"text": d.text,
			}, {
				"text":    (d.value).toLocaleString(window.LOCALE),
				"options": { "color": green, "fontSize": 24, "align": "left", bold, "wrap": false },
			},
		];
	};

	const summary_raster = SUMMARY[index].raster;

	const pop = DST.get('population-density');
	const pop_data = pop.raster.data;

	let right_rows = [];
	switch (index) {
	case 'demand': {
		let population_demand = 0;
		const data = summary_raster;

		for (let i = 0; i < data.length; i++) {
			if (and(data[i] > 0.5, pop_data[i] !== pop.raster.nodata))
				population_demand += pop_data[i];
		}

		right_rows = [
			row({
				"text":  t(window.LOCALE, 'report.analysis.row.pop_demand'),
				"value": Math.round(population_demand),
			}),
		];

		const health = DST.get('health');
		if (health?.on) {
			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.health'),
					"value": medhigh_point_count(
						health.raster.data,
						summary_raster,
					),
				}),
			);
		}

		const schools = DST.get('schools');
		if (schools?.on) {
			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.schools'),
					"value": medhigh_point_count(
						schools.raster.data,
						summary_raster,
					),
				}),
			);
		}

		break;
	}

	case 'supply': {
		// TODO: points? any points?
		const points = STATE.datasets.filter(d => and(d.index === index, d.type === 'points'));

		// TODO: lines? transmission + distribution?
		const lines = STATE.datasets.filter(d => and(d.index === index, d.type === 'lines'));

		let points_count = 0;
		for (const d of points) {
			const data = d.raster.data;

			for (let i = 0; i < data.length; i++) {
				if (and(data[i] === 0, summary_raster[i] > -1))
					points_count += 1;
			}
		}

		let population_lines = 0;
		for (const d of lines) {
			const data = d.raster.data;

			for (let i = 0; i < data.length; i++) {
				if (and(or(data[i] === 0, data[i] === 1), pop_data[i] !== pop.raster.nodata, summary_raster[i] > -1))
					population_lines += pop_data[i];
			}
		}

		const ghi = DST.get('ghi');
		const wind = DST.get('windspeed');

		right_rows = [];

		if (points_count) {
			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.supply_points'),
					"value": points_count,
				}),
			);
		}

		if (lines.length) {
			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.pop_lines'),
					"value": Math.round(population_lines),
				}),
			);
		}

		if (ghi?.on) {
			const data = [];
			for (let i = 0; i < summary_raster.length; i++) {
				if (summary_raster[i] === -1) continue;
				else if (ghi.raster.data[i] === ghi.raster.nodata) continue;

				data.push(ghi.raster.data[i]);
			}

			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.ghi'),
					"value": Math.round(data.reduce((a,b) => a+b) / data.length),
				}),
			);
		}

		if (wind?.on) {
			const data = [];
			for (let i = 0; i < summary_raster.length; i++) {
				if (summary_raster[i] === -1) continue;
				else if (wind.raster.data[i] === wind.raster.nodata) continue;

				data.push(wind.raster.data[i]);
			}

			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.wind'),
					"value": (data.reduce((a,b) => a+b) / data.length).toFixed(2),
				}),
			);
		}

		break;
	}

	case 'ani':
	case 'eai': {
		const data = summary_raster;

		const pop = DST.get('population-density');
		const pop_data = pop.raster.data;

		let population_count = 0;
		for (let i = 0; i < data.length; i++) {
			if (and(data[i] > -1, pop_data[i] !== pop.raster.nodata))
				population_count += pop_data[i];
		}

		const points = STATE.datasets.filter(d => and(or(d.id === 'health', d.id === "schools")));
		const lines = STATE.datasets.filter(d => and((d.index === 'supply'), d.type === 'lines'));

		const health = DST.get('health');
		const schools = DST.get('schools');

		let points_count = 0;
		for (const d of points) {
			const data = d.raster.data;

			for (let i = 0; i < data.length; i++) {
				if (and(data[i] === 0, summary_raster[i] > -1))
					points_count += 1;
			}
		}

		let population_lines = 0;
		for (const d of lines) {
			const data = d.raster.data;

			for (let i = 0; i < data.length; i++) {
				if (and(or(data[i] === 0, data[i] === 1), pop_data[i] !== pop.raster.nodata, summary_raster[i] > -1))
					population_lines += pop_data[i];
			}
		}

		right_rows = [
			row({
				"text":  t(window.LOCALE, 'report.analysis.row.pop_covered'),
				"value": Math.round(population_count),
			}),
		];

		if (lines.length) {
			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.pop_lines'),
					"value": Math.round(population_lines),
				}),
			);
		}

		if (points.length) {
			const x = [
				[schools?.on, t(window.LOCALE, 'report.analysis.points.schools')],
				[health?.on, t(window.LOCALE, 'report.analysis.points.health')],
			].filter(p => p[0]).map(p => p[1]).join(' and ');

			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.points_amounts', { x }),
					"value": points_count,
				}),
			);
		}

		break;
	}
	}

	if (!right_rows.length) return;

	const $ = this.addSlide();

	await analysis_left.call(this, $, index);

	await analysis_right.call(this, $, index, right_rows);

	footer($);
};

async function fetch_basemap(envelope, width_in) {
	// Reuse the same token/theme the client map uses; never hardcode it.
	const token = (EAE && EAE['settings'] && EAE['settings'].mapbox_token) || null;
	if (!token) return null;

	const [minLng, minLat, maxLng, maxLat] = envelope;
	// Pad the bbox ~10% on each side so neighbouring context shows around the geography.
	const padLng = (maxLng - minLng) * 0.1;
	const padLat = (maxLat - minLat) * 0.1;
	const bMinLng = minLng - padLng;
	const bMinLat = minLat - padLat;
	const bMaxLng = maxLng + padLng;
	const bMaxLat = maxLat + padLat;

	// The /static/[bbox]/ form fits the bbox into the requested pixels. Match the
	// aspect ratio to the padded bbox to avoid letterboxing, and ask for ~150ppi at
	// the size the map is placed so the reader can scale it up without it going soft.
	const W = Math.min(1280, Math.max(400, Math.round(width_in * 150)));
	const H = Math.min(1280, Math.round(W * (bMaxLat - bMinLat) / (bMaxLng - bMinLng)));

	const url =
		`https://api.mapbox.com/styles/v1/mapbox/light-v10/static/[${bMinLng},${bMinLat},${bMaxLng},${bMaxLat}]/${W}x${H}` +
		`?access_token=${token}&logo=false&attribution=false`;

	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const blob = await res.blob();
		const dataUrl = await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
		return dataUrl;
	} catch {
		// Any failure (network, status, ...) falls back to the choropleth-only slide.
		return null;
	}
};

async function analysis_left($, index) {
	title($, translateIndexName(window.LOCALE, index));

	$.addText(
		[
			{
				"text":    translateIndexName(window.LOCALE, index) + " ",
				"options": { bold },
			}, {
				"text": t(window.LOCALE, 'modal.eae_info.index.' + index + '.explain'),
			},
		],
		textopts({ x, "y": 1, "w": "45%", "h": 1.6, "shrinkText": true }),
	);

	// Five flat bands as shapes: the ramp needs no picture at all (see svg_bitmap).
	const ramp = share_scale_colors().slice(0, 5);
	const ramp_w = a4(25, 'x');
	const ramp_y = 2.5;
	const ramp_h = 0.1;

	ramp.forEach((color, i) => {
		$.addShape(this.ShapeType.rect, {
			"x":    x + (i * ramp_w / ramp.length),
			"y":    ramp_y,
			"w":    ramp_w / ramp.length,
			"h":    ramp_h,
			"fill": { "color": fill_color(color) },
			"line": { "color": fill_color(color), "width": 0 },
		});
	});

	const valign = "top";

	$.addTable([[
		{
			"text":    t(window.LOCALE, 'left_panel.output.ramp.low'),
			"options": textopts({ "align": "left", valign }),
		}, {
			"text":    t(window.LOCALE, 'left_panel.output.ramp.medium'),
			"options": textopts({ "align": "center", valign }),
		}, {
			"text":    t(window.LOCALE, 'left_panel.output.ramp.high'),
			"options": textopts({ "align": "right", valign }),
		},
	]], textopts({ x, "y": 2.6, "w": "25%" }));

	const c = SUMMARY[index]['canvas'];
	let data = c.toDataURL('image/png');

	const r = c.width / c.height;

	// The map fills the left section: the whole column width, from under the colour
	// ramp down to the footer band.
	const map_x0 = x;
	const map_x1 = a4(50, 'x') - 0.2;
	const map_y0 = 2.85;
	const map_y1 = a4(100, 'y') - 0.65;

	// Basic basemap underneath the choropleth (falls back to null on any failure,
	// leaving the choropleth on the plain white background).
	const basemap = await fetch_basemap(GEOGRAPHY.envelope, map_x1 - map_x0);

	// Over a basemap the scale bar and north arrow sit in its bottom padding; without
	// one they go under the map, which gives up a strip of the section to them.
	const strip = basemap ? 0 : 0.5;

	const max_w = map_x1 - map_x0;
	const max_h = map_y1 - map_y0 - strip;

	let w = max_w;
	let h = w / r;

	if (h > max_h) {
		h = max_h;
		w = h * r;
	}

	const map_x = map_x0 + ((max_w - w) / 2);
	const map_y = map_y0 + ((max_h - h) / 2);

	const [minLng, minLat, maxLng, maxLat] = GEOGRAPHY.envelope;

	// Choropleth placement. Without a basemap the map is the choropleth alone; over a
	// basemap the two layers are composed, so the slide carries one map picture either
	// way. The scale bar and north arrow sit in the basemap's bottom padding, or under
	// the map when there is no basemap.
	let ox = map_x;
	let oy = map_y + h + 0.12;
	let fw = 1;

	if (basemap) {
		// The choropleth canvas extent matches GEOGRAPHY.envelope; place it within the
		// basemap by the padding fractions used to build the basemap bbox.
		const padLng = (maxLng - minLng) * 0.1;
		const padLat = (maxLat - minLat) * 0.1;
		const bMinLng = minLng - padLng;
		const bMinLat = minLat - padLat;
		const bMaxLng = maxLng + padLng;
		const bMaxLat = maxLat + padLat;
		const fx = (minLng - bMinLng) / (bMaxLng - bMinLng);
		fw = (maxLng - minLng) / (bMaxLng - bMinLng);
		const fy = (bMaxLat - maxLat) / (bMaxLat - bMinLat);
		const fh = (maxLat - minLat) / (bMaxLat - bMinLat);

		const division = STATE.variant !== 'raster' ? GEOGRAPHY.divisions[STATE.variant] : null;
		const overlay = division?.raster?.data ? division_boundaries(division) : null;

		data = await compose_map(basemap, data, w, h, fx, fy, fw, fh, overlay);

		ox = map_x + fx * w;
		oy = map_y + h - 0.36;
	}

	$.addImage({
		"x": map_x,
		"y": map_y,
		w,
		h,
		data,
	});

	const centerLat = (minLat + maxLat) / 2;
	const totalKm   = (maxLng - minLng) * 111.32 * Math.cos(centerLat * Math.PI / 180);
	const kmPerInch = totalKm / (fw * w);
	const nice_vals = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
	const target_km = kmPerInch * w * 0.3;
	const niceKm    = nice_vals.reduce((p, c) => Math.abs(c - target_km) < Math.abs(p - target_km) ? c : p);
	const barW      = niceKm / kmPerInch;
	const niceMi    = niceKm * 0.621371;
	const kmLabel   = niceKm >= 1 ? `${niceKm} km` : `${Math.round(niceKm * 1000)} m`;
	const miLabel   = niceMi >= 1 ? `${Math.round(niceMi)} mi` : `${Math.round(niceMi * 5280)} ft`;

	// North arrow as SVG so N and needle are always aligned
	const north_svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 26">
		<text x="10" y="7" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="bold" fill="#333">N</text>
		<polygon points="10,9 14,19 10,17 6,19" fill="#333"/>
	</svg>`;
	$.addImage({ "x": ox, "y": oy, "w": 0.26, "h": 0.34, "data": await svg_bitmap(north_svg, 0.26, 0.34) });

	// Scale bar
	const bx = ox + 0.26 + 0.12;
	const by = oy + 0.15;
	const bh = 0.04;

	$.addShape(this.ShapeType.rect, { "x": bx,                  "y": by - 0.02, "w": 0.01, "h": bh + 0.04, "fill": { "color": "333333" } });
	$.addShape(this.ShapeType.rect, { "x": bx,                  "y": by,        "w": barW, "h": bh,         "fill": { "color": "333333" } });
	$.addShape(this.ShapeType.rect, { "x": bx + barW - 0.01,    "y": by - 0.02, "w": 0.01, "h": bh + 0.04, "fill": { "color": "333333" } });

	$.addText(`${kmLabel} / ${miLabel}`, textopts({ "x": bx, "y": by + bh + 0.02, "w": barW, "h": 0.12, "fontSize": 6, "align": "center" }));

	if (basemap) {
		$.addText('© Mapbox', textopts({ "x": map_x + w - 1.1, "y": map_y + h - 0.2, "w": 1, "h": 0.12, "fontSize": 6, "align": "right" }));
	}
};

async function analysis_right($, index, rows) {
	$.addShape(
		this.ShapeType.rect,
		{ "x": "50%", "y": 0, "w": "50%", "h": "100%", "fill": { "color": grey } },
	);

	$.addTable(rows, textopts({ "x": "52%", "y": 1, "w": "46%", "colW": [3.2, 2] }));

	const index_name = translateIndexName(window.LOCALE, index).toLowerCase();
	const people_unit = t(window.LOCALE, 'right_panel.prioritization.graphs.people_unit');
	const labels = share_scale_labels(window.LOCALE);
	const colors = share_scale_colors();

	// The pies and their breakdown sit side by side across the panel; two and a half
	// inches each keeps every bucket label and value on one line. The row pitch leaves
	// room for the font PowerPoint substitutes, whose 8pt serif is taller than the
	// browser's sans.
	const col_x  = [a4(52, 'x'), a4(76, 'x')];
	const col_w  = 2.5;
	const caption_y = 3.8;
	const pie_y     = 4.1;
	const pie_s     = 1.05;
	const legend_y  = pie_y + pie_s + 0.05;
	const legend_dy = 0.17;
	const desc_y    = legend_y + (legend_dy * SHARE_ORDER.length) + 0.07;

	for (const k of ['population-density', 'area']) {
		const is_area = k === 'area';
		const x = col_x[is_area ? 1 : 0];
		const label = t(window.LOCALE, is_area ? 'report.analysis.area_share' : 'report.analysis.pop_share');
		const unit = is_area ? 'km²' : people_unit;
		const desc_key = is_area ? 'right_panel.prioritization.graphs.area_desc' : 'right_panel.prioritization.graphs.pop_desc';

		$.addText(
			`${label} (${unit})`,
			textopts({ x, "y": caption_y, "w": col_w, "h": 0.3, bold, "fontSize": 11 }),
		);

		$.addImage({
			x,
			"y":    pie_y,
			"w":    pie_s,
			"h":    pie_s,
			"data": await svg_bitmap(SUMMARY[index][k]['pie'].svg.outerHTML, pie_s, pie_s),
		});

		const amounts = compute_share_amounts(SUMMARY[index][k]);

		// The percentages on the pie alone leave out how much each bucket is worth;
		// repeat the share cards' discrete scale (same words, same numbers) beside it.
		let ly = legend_y;

		for (const i of SHARE_ORDER) {
			$.addShape(
				this.ShapeType.rect,
				{ "x": x, "y": ly + 0.035, "w": 0.09, "h": 0.07, "fill": { "color": fill_color(colors[i]) } },
			);

			// The unit lives in the caption: a value followed by " people" does not fit
			// on one row.
			$.addText(
				labels[i],
				textopts({ "x": x + 0.14, "y": ly, "w": 1.3, "h": legend_dy, "fontSize": 8, "shrinkText": true }),
			);

			$.addText(
				amounts.amounts[i].toLocaleString(window.LOCALE),
				textopts({ "x": x + 1.5, "y": ly, "w": 0.96, "h": legend_dy, "fontSize": 8, "align": "right", "shrinkText": true }),
			);

			ly += legend_dy;
		}

		const description = t(window.LOCALE, desc_key, {
			"indexName": index_name,
			"x":         `${amounts.total.toLocaleString(window.LOCALE)} ${unit}`,
			"y":         `${amounts.amounts[4].toLocaleString(window.LOCALE)} ${unit}`,
		}).replace(/<\/?strong>/g, '');

		$.addText(
			description,
			textopts({ x, "y": desc_y, "w": col_w, "h": 1.45, "fontSize": 8 }),
		);
	}
};

function toplocations_table(slide_title, columns, rows_data) {
	const $ = this.addSlide();

	const border = tableborder;

	title($, slide_title);

	const header = [
		{
			"text":    "#",
			"options": textopts({ "align": "left", bold, "fontSize": 8 }),
		},
		...columns.map(name => ({
			"text":    name.replace(/\b\w/g, c => c.toUpperCase()),
			"options": textopts({ "align": "left", bold, "fontSize": 8 }),
		})),
	];

	const rows = [header, ...rows_data.map((row, i) => [
		{
			"text":    i + 1,
			"options": { "align": "left", "fontSize": 8, "fontFace": "monospace" },
		},
		...columns.map(col => ({
			"text":    row[col] != null ? String(row[col]) : "",
			"options": { "align": "left", "fontSize": 7 },
		})),
	])];

	const tableWidth = a4(100, 'x') - x * 2;
	const firstColWidth = 0.5;
	const remainingColWidth = (tableWidth - firstColWidth) / columns.length;
	const colW = [firstColWidth, ...Array(columns.length).fill(remainingColWidth)];

	$.addTable(rows, textopts({ x, "y": 1.1, "w": tableWidth, "colW": colW, "rowH": 0.27, border }));

	footer($);
};

export async function pptx(opts = {}) {
	const p = new PptxGenJS();

	p.defineLayout({ "name": "A4", "width": a4(100, 'x'), "height": a4(100, 'y') });
	p.layout = 'A4';

	FOOTER_LOGO = await logo_bitmap(`${window.BASE}/images/EAE%20Logo_Compact%20White.svg`, 0.62, 0.35);

	await front.call(p);

	let c = 0;

	{
		chapter.call(p, "" + (c++), t(window.LOCALE, 'report.chapter.summary'));

		platform_overview.call(p);
		how_it_works.call(p);
		open_data.call(p);
		selected_datasets.call(p);
		await selected_data.call(p);
		geography_indexes.call(p);
	}

	{
		chapter.call(p, "" + (c++), t(window.LOCALE, 'report.chapter.analysis'));

		await analysis.call(p, 'demand');
		await analysis.call(p, 'supply');
		await analysis.call(p, 'eai');
		await analysis.call(p, 'ani');
	}

	{
		const area_label = area_type(STATE.variant);
		const is_admin = STATE.variant !== 'raster';
		chapter.call(p, "" + (c++), is_admin ? t(window.LOCALE, 'report.toplocations.top_area', { "area": area_label }) : t(window.LOCALE, 'report.chapter.top_locations'));

		const results = (opts.results || get_locations_results()).slice(0, N_POINTS);

		if (results.length) {
			const { headers, is_raster, analysis_name, column_meta } = prepare_tabular_data(results);
			const rows = [...generate_rows(results, is_raster, analysis_name, 0, results.length)];

			const FIXED = ['Priority score', analysis_name];
			const selected = opts.visible_headers || headers.filter(h => column_meta.get(h)?.visible);
			const fixed_cols = FIXED.filter(h => headers.includes(h));
			const extra_cols = selected.filter(h => headers.includes(h) && !FIXED.includes(h));
			const columns = [...fixed_cols, ...extra_cols].slice(0, PPT_MAX_COLUMNS);

			const slide_title = is_admin
				? t(window.LOCALE, 'report.toplocations.admin_title', { "area": area_label, "index": STATE.index.toUpperCase() })
				: t(window.LOCALE, 'report.toplocations.raster_title', { "index": STATE.index.toUpperCase() });
			toplocations_table.call(p, slide_title, columns, rows);
		}
	}

	return p;
};

