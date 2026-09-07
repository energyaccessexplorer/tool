// EAE-305 view module for the Timeline epic: first-add modal, the left
// panel's year-range control and the Timeline tab's blank state. All state
// lives in the timeline-state.ts Meiosis cell; this module subscribes and
// renders. The only app-global touches kept here are the legacy write
// `STATE.timeline` (kept in sync for timeline.js's graphs) and localStorage
// persistence of the modal dismissal — the atom itself stays pure.

import { subscribe, service, cell, actions } from './timeline-state.ts';

import type { TimelineState, TrendSeries, TrendLocation } from './timeline-state.ts';

import { ce, qs, tmpl, same } from '../lib/helpers.js';

import { t, translateNode, translateUnit } from './translate.js';

import { format_value_unit as formatValueUnit, raster_reverse_crosswalk } from './utils.js';

import modal from '../lib/modal.js';

import { setup_about_button } from './right-panel-graphs.js';

import { valuedPolygons, colorsArray as filteredColorsArray } from './filtered.ts';

let modalShown = false;

/** Redraws the trend chart's y-axis for the hovered series' unit; set while
 * a chart is mounted, null between renders. */
let trendAxisUpdate: ((id: string | null) => void) | null = null;

interface YearControl {
	readonly dates: readonly string[];
	readonly slider: { render(i: number): void };
	readonly select: HTMLSelectElement;
	readonly sync: (i: number) => void;
}

let yearControl: YearControl | null = null;

/** The slices of a DS dataset the trend computation reads. STATE.datasets
 * is untyped legacy (globals.d.ts); cast at the boundary. */
interface TrendDataset {
	readonly id: string;
	readonly name: string;
	readonly timeline?: { readonly enabled?: boolean } | boolean | null;
	readonly on?: boolean;
	readonly type?: string;
	readonly colorscale?: { readonly stops?: readonly string[] };
	readonly category?: { readonly unit?: string };
	readonly csv?: {
		readonly key?: string;
		readonly data?: readonly Record<string, string>[];
	};
	readonly config?: { readonly divisions_tier?: number | string };
}

/** One (value, date) point of a trend line; NaN v marks a missing cell. */
interface TrendPoint {
	readonly v: number;
	readonly date: Date;
}

const parseTimelineDate = d3.utcParse('%Y-%m-%d');

// Cross-tier selections resolve via the same reverse raster crosswalk the
// table export uses; raster selections map through the pixel directly.
function rowsForLocation(ds: TrendDataset, location: TrendLocation): readonly Record<string, string>[] {
	const csv = ds.csv;
	const data = csv?.data;
	if (!csv || !data) return [];

	const sourceTier = ds.config?.divisions_tier;

	if ('pixel' in location) {
		const areaId = sourceTier !== undefined
			? GEOGRAPHY.divisions?.[sourceTier]?.raster?.data[location.pixel]
			: undefined;
		if (areaId === undefined || areaId === -1) return [];
		const row = csv.data.find(r => Number(r[csv.key ?? '']) === areaId);
		return row ? [row] : [];
	}

	if (sourceTier === location.tier) {
		const row = csv.data.find(r => Number(r[csv.key ?? '']) === Number(location.id));
		return row ? [row] : [];
	}

	const sourceIds = sourceTier !== undefined
		? raster_reverse_crosswalk(sourceTier, location.tier).get(Number(location.id)) ?? new Set<number>()
		: new Set<number>();
	return Array.from(sourceIds)
		.map(sid => data.find(r => Number(r[csv.key ?? '']) === sid))
		.filter((r): r is Record<string, string> => r !== undefined);
};

/** Average each active polygons-timeline dataset's CSV column per date,
 * optionally scoped to one Filtered geographies location's rows. Also
 * derives the `dates` the series are indexed by: the subset of the
 * geography's timeline_dates that actually has a non-empty cell in at least
 * one loaded dataset. While no CSV has loaded yet it falls back to the full
 * configured range, so the year control doesn't flash empty mid-fetch. */
function computeTrend(location: TrendLocation | null): { series: TrendSeries[]; dates: readonly string[] } {
	const rawDates = GEOGRAPHY.timeline_dates ?? [];

	const active = (STATE.datasets as readonly TrendDataset[]).filter(d =>
		Boolean(d.timeline) && Boolean(d.on) && d.type === 'polygons-timeline');

	const loaded = active.filter(d => d.csv?.data !== undefined);

	const dates = loaded.length > 0
		? rawDates.filter(date => loaded.some(d => (d.csv?.data ?? []).some(r => {
				const v = r[date];
				return v !== "" && v !== null && v !== undefined;
			})))
		: rawDates;

	const series = loaded.map((d, i) => {
		const rows = location ? rowsForLocation(d, location) : (d.csv?.data ?? []);

		return {
			"id":     d.id,
			"label":  d.name,
			"color":  d.colorscale?.stops?.[d.colorscale.stops.length - 1]
				?? filteredColorsArray[(i + 1) % filteredColorsArray.length]
				?? '#000000',
			"unit":   d.category?.unit || '',
			"values": dates.map(date => {
				// Empty cells mean "no data for this year", not a zero reading: +""
				// would coerce to 0 and drag the yearly average to the baseline,
				// so years without reports would plot as fake 0% points (EAE-498).
				const vals = rows.map(r => {
					const v = r[date];
					return v === "" || v === null || v === undefined ? NaN : +v;
				}).filter(v => !isNaN(v));
				return vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : NaN;
			}),
		};
	});

	return { series, dates };
};

/** Recompute the derived trend slice (series + available dates) from the
 * current STATE.datasets, and dispatch it. The action's no-op guard means
 * this is cheap to call on every COMMIT / data-load, which is what makes the
 * widget truly reactive instead of only updating on the `active` flip. */
function recomputeTrend(): void {
	const c = cell();

	if (!c.state.active) {
		actions.setTrend(c, [], []);
		return;
	}

	const { series, dates } = computeTrend(c.state.trendLocation);
	actions.setTrend(c, series, dates);
};

/** Dim every trend-line element but the hovered one (shared data-series-id). */
function highlightSeries(id: string | null): void {
	document.querySelectorAll('.timeline-trend-lines [data-series-id]').forEach(el => {
		el.classList.toggle('dimmed', id !== null && el.getAttribute('data-series-id') !== id);
	});

	trendAxisUpdate?.(id);
};

// Domain spans the actual data (zero baseline unless values go negative) and
// is nudged outward to clean tick boundaries by the caller's .nice(), so the
// y-axis numbers always bracket the plotted values - percentages included.
// EAE-498: '%' used to be pinned to a fixed 0-100 frame, which flattened each
// series whose values sit below ~1 or above 100 against mismatched tick numbers.
function unitDomain(_unit: string, members: readonly TrendSeries[]): [number, number] {
	const finite = members.reduce((a: number[], s) => a.concat(s.values), []).filter(v => !isNaN(v));
	const min = finite.length ? Math.min(...finite) : 0;
	const max = finite.length ? Math.max(...finite) : 0;

	const lo = Math.min(0, min);
	const hi = Math.max(0, max);

	return lo === hi ? [lo, lo + 1] : [lo, hi];
};

// Mirrors cards.js range precision: percentages read as whole numbers on a
// wide spread, other units keep enough decimals to stay legible on a small
// spread. Sub-1% values (fraction-encoded indicators) keep 2 decimals so the
// legend Max/Min match the plotted value instead of rounding to "0%" (EAE-498).
function legendNumber(value: number, unit: string, spread: number): string | number {
	if (unit === '%' && spread >= 2) return Math.round(value);
	if (unit === '%') return Number(value.toFixed(2));

	let digits = 3 - Math.ceil(Math.log10(spread || 1));
	if (digits < 0) digits = 0;
	if (digits > 3) digits = 3;

	return value.toFixed(digits);
};

// EAE-498: render y-axis tick labels with our own decimal logic. The chart used
// scale.tickFormat()/d3.format defaults for these labels, which produced ticks
// that did not always line up with the plotted numbers once domains were data
// fitted (small/percent fractions), so ticks are computed explicitly instead.
function fmtTick(v: number, span: number): string {
	if (!isFinite(v)) return '';
	if (v === 0) return '0';
	const step = Math.max(span / 4, 1e-9);
	const dec = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step))));
	let s = v.toFixed(dec);
	if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
	return s;
};

function axisTicks(domain: readonly [number, number]): number[] {
	const lo = domain[0];
	const hi = domain[1];
	if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return [];
	let ticks: number[] = [];
	if (typeof d3.ticks === 'function') ticks = d3.ticks(lo, hi, 4);
	if (ticks.length < 2) {
		const n = 4;
		const step = (hi - lo) / n;
		ticks = [];
		for (let i = 0; i <= n; i++) ticks.push(lo + step * i);
	}
	const out = ticks.filter(v => v >= lo && v <= hi);
	if (!out.length) return [lo, hi];
	// Guarantee the axis numbers bracket the plotted values: d3.ticks stops at
	// the last aligned multiple (e.g. 100 for a domain that ends at 108.7), so
	// cap the ticks with the domain max - and min - when they fall short (EAE-498).
	const first = out[0];
	const last = out[out.length - 1];
	if (first !== undefined && first > lo) out.unshift(lo);
	if (last !== undefined && last < hi) out.push(hi);
	return out;
};

function buildTrendChart(dates: readonly Date[], series: readonly TrendSeries[]): Node | null {
	const width = 280;
	const height = 200;
	const margin = { "top": 18, "right": 10, "bottom": 20, "left": 38 };

	const svg = d3.create('svg').attr('viewBox', [0, 0, width, height]).attr('width', '100%');

	const groups = new Map<string, TrendSeries[]>();
	for (const s of series) {
		const members = groups.get(s.unit);
		if (members) members.push(s);
		else groups.set(s.unit, [s]);
	}

	// One domain per unit, every group sharing the same pixel range: same-unit
	// series stay comparable to each other, different units cover a similar
	// span instead of one flattening the rest.
	const scales = new Map(Array.from(groups, ([unit, members]) => [
		unit,
		d3.scaleLinear().domain(unitDomain(unit, members)).nice().range([height - margin.bottom, margin.top]),
	]));

	// The map is keyed by every unit present in series, so a lookup for one
	// of them always hits; the fallback only satisfies the type checker.
	const scaleFor = (unit: string): D3ScaleLinear =>
		scales.get(unit) ?? d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);

	// With mixed units no tick number is true for every series, so the axis
	// drops its labels entirely until a hover picks one series to speak for.
	const mixed = groups.size > 1;

	const x = d3.scaleUtc().domain(d3.extent(dates)).range([margin.left, width - margin.right]);

	// Explicit tickValues at the data points: a default .ticks(n) aligns to
	// "nice" Jan-1 year boundaries, which drops the first year when the
	// domain starts later than Jan-1 (e.g. 2020-03-01) — so 2020 lost its
	// label while 2021/2022/2023 kept theirs. Every year with data gets a label.
	svg.append('g')
		.attr('transform', `translate(0,${height - margin.bottom})`)
		.call(d3.axisBottom(x).tickValues(dates).tickFormat(d3.utcFormat('%Y')));

	const yAxis = svg.append('g').attr('transform', `translate(${margin.left},0)`);

	const yLabel = svg.append('text')
		.attr('class', 'timeline-trend-unit-label')
		.attr('x', 2)
		.attr('y', margin.top - 6);

	function drawAxis(unit: string | null): void {
		const scale = scaleFor(unit === null ? (series[0]?.unit ?? '') : unit);
		const domain = scale.domain();
		const span = domain[1] - domain[0];
		const show = !(unit === null || mixed);
		const axis = d3.axisLeft(scale)
			.tickValues(axisTicks(domain))
			.tickFormat(v => show ? fmtTick(v, span) : '');

		yAxis.call(axis);
		yLabel.text(show ? translateUnit(window.LOCALE, unit) : '');
	};

	const defaultUnit = mixed ? null : (series[0]?.unit ?? null);
	drawAxis(defaultUnit);

	trendAxisUpdate = id => {
		const hovered = id === null ? null : (series.find(s => s.id === id) ?? null);
		drawAxis(hovered !== null && mixed ? hovered.unit : defaultUnit);
	};

	svg.append('g')
		.attr('fill', 'none')
		.attr('stroke-width', 2)
		.selectAll('path')
		.data(series)
		.join('path')
		.attr('data-series-id', d => d.id)
		.attr('stroke', d => d.color)
		.attr('d', d => d3.line<number>()
			.defined(v => !isNaN(v))
			.x((_v, i) => x(dates[i] ?? new Date(NaN)))
			.y(v => scaleFor(d.unit)(v))(d.values))
		.style('cursor', 'pointer')
		.on('mouseenter', d => highlightSeries(d.id))
		.on('mouseleave', () => highlightSeries(null));

	svg.append('g')
		.selectAll('g')
		.data(series)
		.join('g')
		.attr('data-series-id', d => d.id)
		.attr('fill', d => d.color)
		.each(function(d) {
			const y = scaleFor(d.unit);
			const unit = translateUnit(window.LOCALE, d.unit);

			d3.select(this)
				.selectAll('circle')
				.data(d.values.map((v, i): TrendPoint => ({ v, "date": dates[i] ?? new Date(NaN) })))
				.join('circle')
				.attr('cx', p => x(p.date))
				.attr('cy', p => isNaN(p.v) ? -100 : y(p.v))
				.attr('r', 3)
				.style('cursor', 'pointer')
				.on('mouseenter', () => highlightSeries(d.id))
				.on('mouseleave', () => highlightSeries(null))
				.append('title')
				.text(p => isNaN(p.v) ? null : `${d.label} — ${d3.utcFormat('%Y')(p.date)}: ${formatValueUnit(p.v.toFixed(2), unit)}`);
		});

	return svg.node();
};

function renderTrendLines(state: TimelineState): void {
	const chartContainer = qs('#timeline-trend-chart');
	const legendContainer = qs('#timeline-trend-legend');
	if (!chartContainer || !legendContainer) return;

	const series = state.trend.series;

	// Dates come from the derived trend slice (available years), not the raw
	// geography config, so a year with no data (e.g. 2023) never appears.
	const dateStrings = state.trend.dates;
	const dates = dateStrings.map(parseTimelineDate).filter(d => !isNaN(d.getTime()));

	chartContainer.replaceChildren();
	legendContainer.replaceChildren();

	trendAxisUpdate = null;

	if (!series.length || !dates.length) return;

	const chart = buildTrendChart(dates, series);
	if (chart) chartContainer.append(chart);

	legendContainer.append(...series.map(s => {
		const finite = s.values.filter(v => !isNaN(v));
		const max = finite.length ? Math.max(...finite) : 0;
		const min = finite.length ? Math.min(...finite) : 0;
		const unit = translateUnit(window.LOCALE, s.unit);
		const spread = max - min;

		const row = ce('div', [
			ce('span', "●", { "class": "colored-disc", "style": `color: ${s.color};` }),
			ce('span', s.label),
			ce('span', `Max: ${formatValueUnit(legendNumber(max, s.unit, spread), unit)} Min: ${formatValueUnit(legendNumber(min, s.unit, spread), unit)}`, { "class": "timeline-trend-legend-minmax" }),
		], { "class": "timeline-trend-legend-row", "data-series-id": s.id });

		row.onmouseenter = () => highlightSeries(s.id);
		row.onmouseleave = () => highlightSeries(null);

		return row;
	}));

	const subtitle = qs('#timeline-trend-subtitle') as HTMLElement | null;
	const first = dateStrings[0];
	const last = dateStrings[dateStrings.length - 1];
	if (!subtitle || first === undefined || last === undefined) return;

	const from = new Date(first).getUTCFullYear();
	const to = new Date(last).getUTCFullYear();

	subtitle.replaceChildren();

	if (state.trendLocation) {
		const clearBtn = ce('button', t(window.LOCALE, 'timeline.trend.clear_location'), { "type": "button", "class": "timeline-trend-clear-location" });
		clearBtn.onclick = () => actions.setTrendLocation(cell(), null);

		subtitle.append(
			ce('span', t(window.LOCALE, 'timeline.trend.subtitle_location', { "location": state.trendLocation.label, from, to })),
			clearBtn,
		);
	} else {
		subtitle.append(ce('span', t(window.LOCALE, 'timeline.trend.subtitle', { from, to })));
	}
};

function renderFiltersToggle(state: TimelineState): void {
	const container = qs('#timeline-filters-toggle-container') as HTMLElement | null;
	if (!container) return;

	const checkbox = qs('#timeline-filters-toggle') as HTMLInputElement | null;
	if (!checkbox) return;

	if (checkbox.onchange) {
		checkbox.checked = state.filters.enabled;
		return;
	}

	checkbox.checked = state.filters.enabled;
	checkbox.onchange = () => {
		actions.setFilterEnabled(cell(), checkbox.checked);
		renderFiltered(cell().state);
		COMMIT();
	};
};

// STATE.timeline <-> cell.year bridge: the legacy per-geography selected
// date follows the year control, and the filtered map clipping reruns.
function renderFiltered(state: TimelineState): void {
	if (state.year.selected && STATE.timeline !== state.year.selected)
		STATE.timeline = state.year.selected;

	try { valuedPolygons(); }
	catch (e) { console.warn('timeline: valuedPolygons failed', e); }
};

function firstAddModal(): void {
	const content = tmpl('#timeline-first-add-modal');
	translateNode(window.LOCALE, content);

	const checkbox = qs('#timeline-modal-dont-show', content) as HTMLInputElement;
	const close = qs('#timeline-modal-close', content) as HTMLElement;

	const m = new modal({
		"header": t(window.LOCALE, 'timeline.modal.header'),
		content,
		"destroy": true,
	});

	close.onclick = () => {
		if (checkbox.checked) {
			localStorage.setItem('timeline-modal-dismissed', '1');
			actions.dismissModal(cell());
		}
		m.remove();
	};

	m.show();
};

// Green stepped slider with a dot per available year: filled dots mark years
// at or before the current one, unfilled dots mark years still ahead.
function buildYearSlider(
	container: Element,
	years: readonly number[],
	pick: (i: number) => void,
): { render(i: number): void } {
	const width = 220;
	const height = 34;
	const margin = 10;
	const trackY = 20;

	const svg = d3.create('svg').attr('viewBox', [0, 0, width, height]).attr('width', '100%');

	const x = d3.scalePoint().domain(d3.range(years.length)).range([margin, width - margin]);

	svg.append('line')
		.attr('x1', margin).attr('x2', width - margin)
		.attr('y1', trackY).attr('y2', trackY)
		.attr('stroke', '#D9D9D9').attr('stroke-width', 4).attr('stroke-linecap', 'round');

	const filled = svg.append('line')
		.attr('y1', trackY).attr('y2', trackY)
		.attr('stroke', '#00794C').attr('stroke-width', 4).attr('stroke-linecap', 'round');

	const dots = svg.append('g').selectAll('circle')
		.data(d3.range(years.length))
		.join('circle')
		.attr('cx', d => x(d))
		.attr('cy', trackY)
		.attr('r', 2.5);

	// Invisible, larger per-year hit targets so clicking a year dot (or its
	// neighborhood) snaps the handle to that year — the visible dots are only
	// 2.5px, too small to click directly. Bound to the same index as the dot
	// they sit over, so pick() is exact (no coordinate scaling math).
	svg.append('g').selectAll('circle')
		.data(d3.range(years.length))
		.join('circle')
		.attr('cx', d => x(d))
		.attr('cy', trackY)
		.attr('r', 11)
		.attr('fill', 'transparent')
		.style('cursor', 'pointer')
		.on('click', d => pick(d));

	const label = svg.append('text')
		.attr('y', 9)
		.attr('text-anchor', 'middle')
		.attr('font-weight', 700)
		.attr('font-size', 11)
		.attr('fill', '#1A1919');

	const handle = svg.append('circle')
		.attr('cy', trackY)
		.attr('r', 8)
		.attr('fill', '#00794C')
		.attr('stroke', 'white')
		.attr('stroke-width', 2)
		.style('cursor', 'grab');

	function nearestIndex(px: number): number {
		let closest = 0, closestDist = Infinity;
		for (let i = 0; i < years.length; i++) {
			const d = Math.abs(x(i) - px);
			if (d < closestDist) { closestDist = d; closest = i; }
		}
		return closest;
	};

	function render(i: number): void {
		filled.attr('x1', margin).attr('x2', x(i));
		dots.attr('fill', d => d <= i ? '#FFFFFF' : '#B0B0B0');
		handle.attr('cx', x(i));
		label.attr('x', Math.max(margin + 14, Math.min(width - margin - 14, x(i)))).text(years[i]);
	};

	handle.call(d3.drag().on('drag', () => pick(nearestIndex(d3.event.x))));

	const node = svg.node();
	if (node) container.replaceChildren(node);

	return { render };
};

function renderTimelineBlankState(state: TimelineState): void {
	const blank = qs('#timeline-blank-state') as HTMLElement | null;
	const container = qs('#timeline-tab-container') as HTMLElement | null;
	if (!blank || !container) return;

	blank.style.display = state.active ? 'none' : 'flex';
	container.style.display = state.active ? '' : 'none';
};

function renderYearControl(state: TimelineState): void {
	const section = qs('#timeline-year-control-section') as HTMLElement | null;
	if (!section) return;

	section.style.display = state.active ? '' : 'none';
	if (!state.active) { yearControl = null; return; }

	// Available years, falling back to the configured range while the first
	// trend recompute is still pending (before any CSV has loaded).
	const dates = state.trend.dates.length > 0 ? state.trend.dates : (GEOGRAPHY.timeline_dates ?? []);
	const years = dates.map(d => new Date(d).getUTCFullYear());

	if (!yearControl || !same(yearControl.dates, dates)) {
		const select = qs('#timeline-year-select') as HTMLSelectElement;
		select.replaceChildren(...years.map((y, i) => ce('option', y, { "value": i })));

		let lastIndex: number | null = null;

		const pick = (i: number): void => {
			if (i === lastIndex) return;
			lastIndex = i;

			select.value = String(i);
			slider.render(i);
			actions.selectYear(cell(), dates[i] ?? null);
			STATE.timeline = dates[i] ?? null;
		};

		const slider = buildYearSlider(qs('#timeline-year-slider') as HTMLElement, years, pick);
		select.onchange = () => pick(Number(select.value));

		yearControl = { dates, slider, select, "sync": i => { select.value = String(i); slider.render(i); } };
	}

	yearControl.sync(Math.max(0, yearControl.dates.indexOf(state.year.selected ?? '')));
};

export function init(): void {
	setup_about_button(qs('#timeline-year-control-section'), t(window.LOCALE, 'timeline.year_control.about'));
	setup_about_button(qs('.timeline-trend-lines'), t(window.LOCALE, 'timeline.trend.about'));
	setup_about_button(qs('.timeline-filtered-geographies'), t(window.LOCALE, 'timeline.filtered_geographies.about'));

	// Hydrate the persisted "don't show again" flag before subscribing, so
	// a dismissed modal never flashes on the first activation.
	if (localStorage.getItem('timeline-modal-dismissed') === '1')
		actions.hydrateModal(cell(), true);

	// EAE-304 trend service: recompute the derived trend slice (series +
	// available dates) when the mode flips or the clicked Filtered geographies
	// location changes. Dataset toggles and CSV loads are handled by
	// recomputeTrend() inside commitSync (called from every COMMIT and from
	// ds.js once a timeline dataset's CSV finishes loading), so those don't
	// need to be in this derive key. The location is stringified in the slice:
	// dropRepeats' same() helper recurses into objects and can't diff null
	// against an object (Object.keys(null) throws, killing the emission for
	// every later subscriber).
	service(
		state => ({
			"active":   state.active,
			"location": state.trendLocation ? JSON.stringify(state.trendLocation) : null,
		}),
		() => { recomputeTrend(); },
	);

	subscribe(state => {
		renderYearControl(state);
		renderTimelineBlankState(state);
		renderFiltersToggle(state);
		renderFiltered(state);

		if (state.active) renderTrendLines(state);

		if (!state.active) {
			modalShown = false;
			return;
		}

		if (state.modal.dismissed || modalShown) return;

		modalShown = true;
		firstAddModal();
	});

	renderYearControl(cell().state);
	renderTimelineBlankState(cell().state);
	renderFiltersToggle(cell().state);

	// Late init (datasets already active): fill the series once, since the
	// service only runs on emissions after registration.
	if (cell().state.active) {
		recomputeTrend();
		renderTrendLines(cell().state);
	}
};

let lastVariant: string | undefined = undefined;

// Re-run after every COMMIT (a.js): an Analysis Area (STATE.variant) switch
// invalidates a clicked trend location, and the filtered widgets rerender.
export function commitSync(): void {
	if (STATE.variant !== lastVariant) {
		lastVariant = STATE.variant;
		if (cell().state.trendLocation) actions.setTrendLocation(cell(), null);
	}

	// Recomputed on every COMMIT so dataset toggles (and the post-CSV-load
	// COMMIT from ds.js) refresh the trend even when `active` never flips.
	recomputeTrend();

	const state = cell().state;

	renderTimelineBlankState(state);
	renderFiltered(state);

	if (state.active) renderTrendLines(state);
};
