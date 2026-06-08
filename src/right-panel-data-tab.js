import {
	resolve_unit,
} from './area-analysis.js';

import {
	make_title,
} from './right-panel-tabs.js';

import {
	aggregate_layer_values,
} from './analysis.js';

import {
	STANDARD_TABS,
} from './a.js';

import bind from '../lib/bind.js';
import bubblemessage from '../lib/bubblemessage.js';
import { t } from './translate.js';

import {
	ce,
	qs,
} from '../lib/helpers.js';

import {
	svg_pie,
	format_value_unit,
} from './utils.js';

const POINTS_KEYS = {
	'count':           'right_panel.data.descriptions.points.count',
	'distance in km':  'right_panel.data.descriptions.points.distance',
	'proximity in km': 'right_panel.data.descriptions.points.distance',
	'Kwp':             'right_panel.data.descriptions.points.kwp',
	'kVA':             'right_panel.data.descriptions.points.kva',
	'km':              'right_panel.data.descriptions.points.km',
};

const RASTER_SUM_KEYS = {
	'count':         'right_panel.data.descriptions.raster_sum.count',
	'people':        'right_panel.data.descriptions.raster_sum.people',
	'households':    'right_panel.data.descriptions.raster_sum.households',
	'MW':            'right_panel.data.descriptions.raster_sum.mw',
	'GWh':           'right_panel.data.descriptions.raster_sum.gwh',
	'Metric Tonnes': 'right_panel.data.descriptions.raster_sum.metric_tonnes',
	'tCO2eq':        'right_panel.data.descriptions.raster_sum.tco2eq',
	'USD':           'right_panel.data.descriptions.raster_sum.usd',
	'm³/yr':         'right_panel.data.descriptions.raster_sum.m3yr',
};

const RASTER_KEYS = {
	'count':                      'right_panel.data.descriptions.raster.count',
	'km (proximity to)':          'right_panel.data.descriptions.raster.km_proximity',
	'kWh/m²':                     'right_panel.data.descriptions.raster.kwh_m2',
	'ppl/km²':                    'right_panel.data.descriptions.raster.ppl_km2',
	'people':                     'right_panel.data.descriptions.raster.people',
	'households':                 'right_panel.data.descriptions.raster.households',
	'%':                          'right_panel.data.descriptions.raster.pct',
	'Coverage (%) per km²':       'right_panel.data.descriptions.raster.coverage_pct',
	'MW':                         'right_panel.data.descriptions.raster.mw',
	'GWh':                        'right_panel.data.descriptions.raster.gwh',
	'kWh/ha/year':                'right_panel.data.descriptions.raster.kwh_ha_year',
	'minutes':                    'right_panel.data.descriptions.raster.minutes',
	'hours':                      'right_panel.data.descriptions.raster.hours',
	'hours/hh.day':               'right_panel.data.descriptions.raster.hours_hh_day',
	'm/s':                        'right_panel.data.descriptions.raster.m_s',
	'degree':                     'right_panel.data.descriptions.raster.degree',
	'degree celcius':             'right_panel.data.descriptions.raster.degree_celcius',
	'mm':                         'right_panel.data.descriptions.raster.mm',
	'm³/yr':                      'right_panel.data.descriptions.raster.m3yr',
	'metre':                      'right_panel.data.descriptions.raster.metre',
	'kg/ha':                      'right_panel.data.descriptions.raster.kg_ha',
	'Metric Tonnes':              'right_panel.data.descriptions.raster.metric_tonnes',
	'Gigajoule per sq km':        'right_panel.data.descriptions.raster.gigajoule',
	'USD':                        'right_panel.data.descriptions.raster.usd',
	'USD/household':              'right_panel.data.descriptions.raster.usd_household',
	'bldgs/km²':                  'right_panel.data.descriptions.raster.bldgs_km2',
	'tCO2eq':                     'right_panel.data.descriptions.raster.tco2eq',
	'tier':                       'right_panel.data.descriptions.raster.tier',
	'year':                       'right_panel.data.descriptions.raster.year',
	'< 2USD/day':                 'right_panel.data.descriptions.raster.lt2usd',
	'RWI':                        'right_panel.data.descriptions.raster.rwi',
	'Aridity Index':              'right_panel.data.descriptions.raster.aridity',
	'calibrated radiance':        'right_panel.data.descriptions.raster.nighttime',
	'People per 100k population': 'right_panel.data.descriptions.raster.per100k',
};

function describe(datatype, unit, name, value, aggregation) {
	const locale = window.LOCALE;
	const vars = { "name": name.toLowerCase(), value };

	if (datatype === 'points') {
		const key = POINTS_KEYS[unit] ?? POINTS_KEYS['count'];
		return t(locale, key, vars);
	}

	if (datatype === 'lines')
		return t(locale, 'right_panel.data.descriptions.lines', vars);

	if (datatype?.startsWith('raster')) {
		const key = (aggregation === 'SUM' ? RASTER_SUM_KEYS[unit] : null)
			?? RASTER_KEYS[unit]
			?? (aggregation === 'SUM' ? 'right_panel.data.descriptions.raster_sum.default' : 'right_panel.data.descriptions.raster.default');
		return t(locale, key, vars);
	}

	if (datatype?.startsWith('polygons')) {
		const key = unit
			? 'right_panel.data.descriptions.polygons_sum'
			: 'right_panel.data.descriptions.polygons_count';
		return t(locale, key, vars);
	}

	const key = (aggregation === 'SUM' ? RASTER_SUM_KEYS[unit] : null)
		?? RASTER_KEYS[unit]
		?? (aggregation === 'SUM' ? 'right_panel.data.descriptions.raster_sum.default' : 'right_panel.data.descriptions.raster.default');
	return t(locale, key, vars);
}

const cache = {
	"geo_dist":            new Map(),
	"national_layer_data": null,
};

// Set by right-panel.js after each analysis run. Contains layer aggregates computed from
// the analysis raster mask, so values are clipped to the active geography + active layers.
let analysis_layer_data = null;

export function set_analysis_layer_data(data) {
	analysis_layer_data = data;
}

function count_pixels(raster_data, nodata, mask_data, mask_nodata, mask_id, counts) {
	let total = 0;
	for (let i = 0; i < raster_data.length; i++) {
		if (mask_data[i] === mask_nodata || (mask_id !== undefined && mask_data[i] !== mask_id)) continue;
		const pv = raster_data[i];
		if (pv === nodata) continue;
		if (counts.has(pv)) { counts.set(pv, counts.get(pv) + 1); total++; }
	}
	return total;
}

function compute_distribution(ds, admin_info) {
	if (!ds.csv?.data || !ds.raster?.data) return null;

	const categories = ds.csv.data.map(x => ({
		"value": +x[ds.csv.key],
		"name":  x[ds.csv.column],
		"color": `rgba(${ds.colorscale.fn(+x[ds.csv.key])})`,
	}));

	let mask_data, mask_nodata, mask_id, cache_key;

	if (admin_info) {
		cache_key   = `${ds.id}:${+admin_info.id}`;
		if (cache.geo_dist.has(cache_key)) return cache.geo_dist.get(cache_key);
		const div = GEOGRAPHY.divisions?.[admin_info.variant];
		if (!div?.raster?.data) return null;
		mask_data   = div.raster.data;
		mask_nodata = div.raster.nodata;
		mask_id     = +admin_info.id;
	} else {
		cache_key = ds.id;
		if (cache.geo_dist.has(cache_key)) return cache.geo_dist.get(cache_key);
		const outline = OUTLINE?.raster;
		if (!outline?.data) return null;
		mask_data   = outline.data;
		mask_nodata = outline.nodata;
	}

	const counts = new Map(categories.map(c => [c.value, 0]));
	const total  = count_pixels(ds.raster.data, ds.raster.nodata, mask_data, mask_nodata, mask_id, counts);
	if (total === 0) return null;

	const result = categories
		.map(c => ({ ...c, "percentage": (counts.get(c.value) || 0) / total * 100 }))
		.filter(c => c.percentage > 0);

	cache.geo_dist.set(cache_key, result);
	return result;
}

function make_donut_chart(distribution, active_name) {
	const wrap = ce('div', null, { "class": 'data-card-donut' });

	const legend = ce('div', null, { "class": 'data-card-donut-legend' });
	for (const c of distribution) {
		const active = active_name && c.name === active_name;
		const item   = ce('div', null, { "class": `data-card-legend-item${active ? ' active' : ''}` });
		const dot    = ce('span', null, { "class": 'data-card-legend-dot' });
		dot.style.background = c.color;
		const name   = ce('span', c.name, { "class": 'data-card-legend-name' });
		item.append(dot, name);
		legend.append(item);
	}

	const bubble = (v, e) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

	const chart = svg_pie(
		distribution.map(c => [c.percentage]),
		66,
		33,
		distribution.map(c => c.color),
		x => x.toFixed(2),
		bubble,
	);

	wrap.append(legend, chart.svg);
	return wrap;
}

function make_bar_chart(distribution, active_name) {
	const sorted  = [...distribution].sort((a, b) => b.percentage - a.percentage);
	const max_pct = sorted[0]?.percentage || 1;

	const wrap = ce('div', null, { "class": 'data-card-bars' });
	for (const c of sorted) {
		const active  = active_name && c.name === active_name;
		const row     = ce('div', null, { "class": `data-card-bar-row${active ? ' active' : ''}` });
		const content = ce('div', null, { "class": 'data-card-bar-content' });
		const copy    = ce('div', null, { "class": 'data-card-bar-copy' });
		const label   = ce('span', c.name, { "class": 'data-card-bar-label' });
		const value   = ce('span', `${c.percentage.toFixed(1)}%`, { "class": 'data-card-bar-value' });
		copy.append(label, value);

		const track = ce('div', null, { "class": 'data-card-bar-track' });
		const fill  = ce('div', null, { "class": 'data-card-bar-fill' });
		fill.style.width = `${(c.percentage / max_pct) * 100}%`;
		track.append(fill);

		content.append(copy, track);
		row.append(content);
		wrap.append(row);
	}
	return wrap;
}

function make_card(ds, entry, admin_info) {
	const card = ce('div', null, { "class": 'data-card' });

	const header = ce('div', null, { "class": 'data-card-header' });
	const path0  = ds.category?.controls?.path?.[0];
	const tab_el = path0 && !STANDARD_TABS.has(path0) ? qs('#controls-tab-' + path0) : null;
	const tab_label = tab_el?.textContent?.trim();
	const title     = ce('span', tab_label ? `${tab_label} - ${ds.name}` : ds.name, { "class": 'data-card-title' });
	const about  = ce('button', null, { "class": 'button-icon button-info button-about' });
	about.innerHTML = `<span>${t(window.LOCALE, 'left_panel.cards.card.about_button')}</span><i class="bi bi-info-circle"></i>`;
	header.append(title, about);

	const body = ce('div', null, { "class": 'data-card-body' });

	const is_categorical = ds.type === 'raster-valued' || ds.type === 'raster-valued-mutant';
	if (is_categorical) {
		const distribution = compute_distribution(ds, admin_info);
		if (distribution) {
			const n           = ds.csv.data.length;
			const active_name = typeof entry.raw_value === 'string' ? entry.raw_value : null;
			const dist_desc = ce('p', null, { "class": 'data-card-description' });
			dist_desc.innerHTML = t(window.LOCALE, 'right_panel.data.categorical_desc', { "name": ds.name });
			body.append(dist_desc, n <= 5
				? make_donut_chart(distribution, active_name)
				: make_bar_chart(distribution, active_name));
			about.onclick = () => ds.info_modal();
			card.append(header, body);
			return card;
		}
	}

	const desc = ce('p', null, { "class": 'data-card-description' });
	if (entry.value != null) {
		desc.innerHTML = describe(ds.category.datatype, entry.unit || ds.category.unit, ds.name, entry.value, entry.aggregation ?? ds.category.analysis?.aggregation);
	} else {
		desc.innerHTML = t(window.LOCALE, 'right_panel.data.no_data', { "name": ds.name });
	}
	body.append(desc);

	about.onclick = () => ds.info_modal();

	card.append(header, body);

	return card;
}

function set_blank_state(visible) {
	const blank = qs('#data-blank-state');
	if (!blank) return;

	if (visible) bind(blank, {
		"title":    t(window.LOCALE, 'right_panel.prioritization.blank_state.title'),
		"subtitle": t(window.LOCALE, 'right_panel.prioritization.blank_state.subtitle'),
	}, { "final": false });

	blank.style.display = visible ? 'flex' : 'none';
}

function resolve_admin_info(admin_info, raster_index) {
	if (admin_info) return admin_info;
	if (raster_index == null || STATE.variant === 'raster') return null;
	const div = GEOGRAPHY.divisions?.[STATE.variant];
	if (!div?.raster?.data) return null;
	const area_id = div.raster.data[raster_index];
	if (area_id == null || area_id === div.raster.nodata) return null;
	return { "variant": STATE.variant, "id": area_id };
}

async function update_top_level_geography() {
	const active = STATE.datasets.filter(
		ds => ds.on && ds.category.name !== 'boundaries' && ds.category.name !== 'outline',
	);

	if (!active.length) {
		set_blank_state(true);
		return;
	}

	// Prefer analysis-filtered data (set by graphs() after each analysis run).
	// Falls back to the full outline when no analysis has run yet.
	let national_layer_data = analysis_layer_data;
	if (!national_layer_data) {
		if (!cache.national_layer_data) {
			if (!OUTLINE?.raster?.data) { set_blank_state(true); return; }
			const national_raster = OUTLINE.raster.data.map(v => v === OUTLINE.raster.nodata ? -1 : 0);
			cache.national_layer_data = await aggregate_layer_values({ "raster": { "data": national_raster } });
		}
		national_layer_data = cache.national_layer_data;
	}

	if (!national_layer_data) { set_blank_state(true); return; }

	const detailedData = [];
	for (const [id, layer] of Object.entries(national_layer_data)) {
		const area_result = layer.areas?.[0]?.result;
		if (!area_result) continue;

		let value, unit;
		if (area_result.type === 'points') {
			value = area_result.value;
			unit = 'count';
		} else {
			value = layer.aggregation === 'SUM'
				? Math.round(area_result.value)
				: parseFloat(area_result.value.toFixed(2));
			unit = resolve_unit(layer, DST.get(id), value);
		}

		const num = Number(value);
		const formatted = Number.isFinite(num) ? num.toLocaleString() : String(value);
		const display_unit = unit === 'count' ? '' : unit;

		detailedData.push({
			"label":       layer.name,
			"value":       format_value_unit(formatted, display_unit),
			"raw_value":   value,
			"unit":        unit,
			"aggregation": layer.aggregation,
		});
	}

	update(detailedData);
}

export function update(detailedData, admin_info = null, raster_index = null) {
	const container = qs('#data-cards-container');
	if (!container) return;
	container.innerHTML = '';

	const effective_admin_info = resolve_admin_info(admin_info, raster_index);

	const by_label = new Map(
		detailedData
			.filter(d => !d.subordinate && d.raw_value != null && d.raw_value !== 'Not aggregated')
			.map(d => [d.label, d]),
	);

	const cards = STATE.datasets
		.filter(ds => ds.category.name !== 'boundaries' && ds.category.name !== 'outline')
		.filter(ds => ds.on);

	if (cards.length) {
		set_blank_state(false);
		container.append(make_title(effective_admin_info, raster_index));
		cards.forEach(ds => {
			const entry = by_label.get(ds.name) ?? { "raw_value": null, "value": null, "label": ds.name };
			container.append(make_card(ds, entry, effective_admin_info));
		});
	} else {
		set_blank_state(true);
	}
}

export function init() {
	set_blank_state(true);
}

export function clear() {
	const container = qs('#data-cards-container');
	if (container) container.innerHTML = '';
	cache.geo_dist.clear();
	cache.national_layer_data = null;
	update_top_level_geography();
}
