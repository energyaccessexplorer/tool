import {
	admin_location_name,
	resolve_unit,
} from './area-analysis.js';

import {
	aggregate_layer_values,
} from './analysis.js';

import {
	STANDARD_TABS,
} from './a.js';

import bind from '../lib/bind.js';
import bubblemessage from '../lib/bubblemessage.js';

import {
	ce,
	qs,
} from '../lib/helpers.js';

import {
	svg_pie,
} from './utils.js';

const POINTS_DESCRIPTIONS = {
	'count':             'There are <strong>{value}</strong> {name} in the selected area.',
	'distance in km':   'The nearest {name} is <strong>{value}</strong> from this area.',
	'proximity in km':  'The nearest {name} is <strong>{value}</strong> from this area.',
	'Kwp':              'The total installed capacity of {name} in this area is <strong>{value}</strong>.',
	'kVA':              'The total capacity of {name} in this area is <strong>{value}</strong>.',
	'km':               'The total distance covered by {name} in this area is <strong>{value}</strong>.',
};

const RASTER_DESCRIPTIONS_SUM = {
	'count':         'The total {name} count in this area is <strong>{value}</strong>.',
	'people':        'The total population in this area is <strong>{value}</strong>.',
	'households':    'There are <strong>{value}</strong> households in this area.',
	'MW':            'The total energy demand in this area is <strong>{value}</strong>.',
	'GWh':           'The total energy in this area is <strong>{value}</strong>.',
	'Metric Tonnes': 'The total crop production in this area is <strong>{value}</strong>.',
	'tCO2eq':        'The total emissions in this area are <strong>{value}</strong>.',
	'USD':           'The total cost for {name} in this area is <strong>{value}</strong>.',
	'm³/yr':         'The total water availability in this area is <strong>{value}</strong>.',
};

const RASTER_DESCRIPTIONS = {
	'count':                      'The average {name} count in this area is <strong>{value}</strong>.',
	'km (proximity to)':          'The average distance to {name} in this area is <strong>{value}</strong>.',
	'kWh/m²':                     'The average {name} is <strong>{value}</strong> in this area.',
	'ppl/km²':                    'The population density in this area is <strong>{value}</strong>.',
	'people':                     'The estimated population in this area is <strong>{value}</strong>.',
	'households':                 'There are approximately <strong>{value}</strong> households in this area.',
	'%':                          '<strong>{value}</strong> of this area has {name}.',
	'Coverage (%) per km²':       '<strong>{value}</strong> of this area is covered by {name}.',
	'MW':                         'The estimated energy demand in this area is <strong>{value}</strong>.',
	'GWh':                        'The estimated energy in this area is <strong>{value}</strong>.',
	'kWh/ha/year':                'The estimated yield for {name} in this area is <strong>{value}</strong>.',
	'minutes':                    'The average travel time to {name} is <strong>{value}</strong> in this area.',
	'hours':                      'The average {name} in this area is <strong>{value}</strong>.',
	'hours/hh.day':               'Households in this area spend on average <strong>{value}</strong> on {name}.',
	'm/s':                        'The average wind speed in this area is <strong>{value}</strong>.',
	'degree':                     'The average temperature in this area is <strong>{value}</strong>.',
	'degree celcius':             'The average temperature in this area is <strong>{value}</strong>.',
	'mm':                         'The average annual rainfall in this area is <strong>{value}</strong>.',
	'm³/yr':                      'The estimated water availability in this area is <strong>{value}</strong>.',
	'metre':                      'The average elevation in this area is <strong>{value}</strong>.',
	'kg/ha':                      'The estimated agricultural yield in this area is <strong>{value}</strong>.',
	'Metric Tonnes':              'The estimated crop production in this area is <strong>{value}</strong>.',
	'Gigajoule per sq km':        'The bioenergy potential in this area is <strong>{value}</strong>.',
	'USD':                        'The estimated cost for {name} in this area is <strong>{value}</strong>.',
	'USD/household':              'The estimated cost per household for {name} is <strong>{value}</strong>.',
	'bldgs/km²':                  'The building density in this area is <strong>{value}</strong>.',
	'tCO2eq':                     'The estimated emissions in this area are <strong>{value}</strong>.',
	'tier':                       'The average electrification tier in this area is <strong>{value}</strong>.',
	'year':                       'The estimated electrification year for this area is <strong>{value}</strong>.',
	'< 2USD/day':                 '<strong>{value}</strong> of the population in this area lives on less than $2/day.',
	'RWI':                        'The Relative Wealth Index for this area is <strong>{value}</strong>.',
	'Aridity Index':              'The aridity index for this area is <strong>{value}</strong>.',
	'calibrated radiance':        'The nighttime light intensity in this area is <strong>{value}</strong>.',
	'People per 100k population': 'There are <strong>{value}</strong> per 100k population affected by {name} in this area.',
};

function title_p(area) {
	const p = ce('p', null, { "class": 'data-tab-title' });
	p.innerHTML = `Analysing selected datasets in <strong>${area}</strong>.`;
	return p;
}

function make_title(admin_info, raster_index) {
	const variant = qs('select#output-variant-select')?.value;
	const location_selected = admin_info || raster_index != null;

	if (!location_selected) {
		const subtitle = ce('p', null, { "class": 'data-tab-subtitle' });
		subtitle.textContent = 'Click anywhere on the map to see data for that location.';
		const fragment = document.createDocumentFragment();
		fragment.append(title_p(GEOGRAPHY.name), subtitle);
		return fragment;
	} else if (admin_info && variant && variant !== 'raster') {
		return title_p(admin_location_name(admin_info.variant, admin_info.id));
	} else if ((GEOGRAPHY.resolution % 1000) === 0) {
		return title_p(`${GEOGRAPHY.name} at ${GEOGRAPHY.resolution / 1000}km²`);
	} else {
		return title_p(`${GEOGRAPHY.name} at ${GEOGRAPHY.resolution}m²`);
	}
}

function fill(template, name, value) {
	return template.replaceAll('{name}', name.toLowerCase()).replaceAll('{value}', value);
}

function describe(datatype, unit, name, value, aggregation) {
	if (datatype === 'points') {
		const key = unit || 'count';
		const tmpl = POINTS_DESCRIPTIONS[key] ?? POINTS_DESCRIPTIONS['count'];
		return fill(tmpl, name, value);
	}

	if (datatype === 'lines')
		return fill('The total length of {name} in this region is <strong>{value}</strong>.', name, value);

	if (datatype?.startsWith('raster')) {
		const tmpl = (aggregation === 'SUM' ? RASTER_DESCRIPTIONS_SUM[unit] : null)
			?? RASTER_DESCRIPTIONS[unit]
			?? (aggregation === 'SUM' ? 'The total {name} in this area is <strong>{value}</strong>.' : 'The average {name} in this area is <strong>{value}</strong>.');
		return fill(tmpl, name, value);
	}

	if (datatype?.startsWith('polygons')) {
		const tmpl = unit
			? 'The total {name} in this area is <strong>{value}</strong>.'
			: 'There are <strong>{value}</strong> {name} in the selected area.';
		return fill(tmpl, name, value);
	}

	const tmpl = (aggregation === 'SUM' ? RASTER_DESCRIPTIONS_SUM[unit] : null)
		?? RASTER_DESCRIPTIONS[unit]
		?? (aggregation === 'SUM' ? 'The total {name} in this area is <strong>{value}</strong>.' : 'The average {name} in this area is <strong>{value}</strong>.');
	return fill(tmpl, name, value);
}

const cache = {
	"geo_dist":            new Map(),
	"national_layer_data": null,
};

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
	about.innerHTML = '<span>About</span><i class="bi bi-info-circle"></i>';
	header.append(title, about);

	const body = ce('div', null, { "class": 'data-card-body' });

	const is_categorical = ds.type === 'raster-valued' || ds.type === 'raster-valued-mutant';
	if (is_categorical) {
		const distribution = compute_distribution(ds, admin_info);
		if (distribution) {
			const n           = ds.csv.data.length;
			const active_name = typeof entry.raw_value === 'string' ? entry.raw_value : null;
			const dist_desc = ce('p', null, { "class": 'data-card-description' });
			dist_desc.append('Showing the percentage distribution of ', ce('strong', null, { "bind": "name" }), ' categories in the selected area.');
			bind(dist_desc, { "name": ds.name });
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
		desc.append('Data about ', ce('strong', null, { "bind": "name" }), ' in this area.');
		bind(desc, { "name": ds.name });
	}
	body.append(desc);

	about.onclick = () => ds.info_modal();

	card.append(header, body);

	return card;
}

const BLANK_NO_LAYERS = {
	"title":    'Add data to prioritize analysis',
	"subtitle": 'Select a dataset from the left panel to add it to the map and start your prioritization analysis.',
};

function set_blank_state(visible) {
	const blank = qs('#data-blank-state');
	if (!blank) return;

	if (visible) bind(blank, BLANK_NO_LAYERS, { "final": false });

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

	if (!cache.national_layer_data) {
		if (!OUTLINE?.raster?.data) { set_blank_state(true); return; }
		const national_raster = OUTLINE.raster.data.map(v => v === OUTLINE.raster.nodata ? -1 : 0);
		cache.national_layer_data = await aggregate_layer_values({ "raster": { "data": national_raster } });
	}

	const detailedData = [];
	for (const [id, layer] of Object.entries(cache.national_layer_data)) {
		const area_result = layer.areas?.[0]?.result;
		if (!area_result) continue;

		let value, unit;
		if (area_result.type === 'points') {
			value = DST.get(id)?.vectors?.data?.features?.length ?? area_result.value;
			unit = 'count';
		} else {
			value = parseFloat(area_result.value.toFixed(2));
			unit = resolve_unit(layer, DST.get(id), value);
		}

		const num = Number(value);
		const formatted = Number.isFinite(num) ? num.toLocaleString() : String(value);
		const display_unit = unit === 'count' ? '' : unit;

		detailedData.push({
			"label":       layer.name,
			"value":       display_unit ? `${formatted} ${display_unit}` : formatted,
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
