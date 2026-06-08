import analysis_run, {
	dataset_feeds_index,
	division_averages,
	lowmedhigh_scale,
	priority_scale,
} from './analysis.js';

import {
	setup_about_button,
} from './right-panel-graphs.js';

import {
	area_type,
} from './utils.js';

import { translateNode, t, translateIndexName, getScaleLabels } from './translate.js';

import {
	make_title,
} from './right-panel-tabs.js';

import {
	ce,
	tmpl,
	qs,
} from '../lib/helpers.js';

function has_datasets_for(key) {
	const compound = EAE['indexes'][key].compound;
	return STATE.datasets.some(d =>
		dataset_feeds_index(d, key) || compound.some(c => dataset_feeds_index(d, c)));
}

function pixel_result(raster, raster_index) {
	const v = raster[raster_index];
	return { "value": v !== -1 ? v : null, "scale": lowmedhigh_scale };
}

function admin_area_result(raster, admin_info) {
	const division = GEOGRAPHY.divisions[admin_info.variant];
	if (!division?.raster?.data) return { "value": null, "scale": null };
	const areas = division_averages(raster, division.raster.data);
	return {
		"value": areas[admin_info.id]?.average ?? null,
		"scale": priority_scale(areas, lowmedhigh_scale.range()),
	};
}

function render_title(admin_info = null, raster_index = null) {
	const el = qs('#tab-title');
	if (!el) return;

	const active = STATE.datasets.some(d => d.on && d.category.name !== 'boundaries' && d.category.name !== 'outline');

	el.replaceChildren(...(active ? [make_title(admin_info, raster_index)] : []));
}

export async function update(raster_index, admin_info, analysis_value) {
	const container = qs('#index-priority-container');
	if (!container) return;

	container.innerHTML = '';
	render_title(admin_info, raster_index);

	if (raster_index == null && !admin_info) return;

	const other_keys = Object.keys(EAE['indexes'])
		.filter(k => k !== STATE.index && has_datasets_for(k));

	const results = await Promise.all(other_keys.map(key => analysis_run(key)));

	const extract = admin_info
		? raster => admin_area_result(raster, admin_info)
		: raster => pixel_result(raster, raster_index);

	const current_scale = admin_info
		? priority_scale(GEOGRAPHY.divisions[admin_info.variant].priorityData, lowmedhigh_scale.range())
		: lowmedhigh_scale;

	const entries = {
		[STATE.index]: has_datasets_for(STATE.index) ? { "value": analysis_value, "scale": current_scale } : { "value": null, "scale": null },
		...Object.fromEntries(other_keys.map((key, i) => [key, extract(results[i].raster)])),
	};

	if (!Object.values(entries).some(e => e.value !== null)) return;

	const card = tmpl('#index-priority-card-template');
	const body = qs('.index-priority-values', card);

	body.append(make_row('eai', entries['eai']));
	body.append(make_row('demand', entries['demand'], true));
	body.append(make_row('supply', entries['supply'], true));
	body.append(make_row('ani', entries['ani']));

	setup_about_button(card, t(window.LOCALE, 'modal.eae_info.index.eai.explain'));
	translateNode(window.LOCALE, card);

	container.append(card);
}

function make_row(key, entry, subordinate = false) {
	const raw = (entry?.value != null && entry?.scale) ? entry.scale(entry.value) : null;
	const raw_index = raw != null ? lowmedhigh_scale.range().indexOf(raw) : -1;
	const formatted = raw_index !== -1 ? getScaleLabels(window.LOCALE)[raw_index] : (raw ?? '—');

	const row = ce('div', null, { 'class': subordinate ? 'index-priority-row subordinate' : 'index-priority-row' });
	const name = ce('span', null, { 'class': 'index-priority-name' });
	name.textContent = translateIndexName(window.LOCALE, key);
	const val = ce('span', null, { 'class': 'index-priority-value' });
	val.textContent = formatted;
	row.append(name, val);
	return row;
}

export function clear() {
	const container = qs('#index-priority-container');
	if (container) container.innerHTML = '';
	render_title();
}

export function update_location_summary(data, admin_info) {
	const container = qs('#location-summary');
	if (!container) return;

	const score_entry = data?.basicData?.find(e => e.key === 'Priority score');
	if (!score_entry) return;

	const area_label = admin_info
		? area_type(admin_info.variant)
		: t(window.LOCALE, 'right_panel.prioritization.priority_areas', { "area": area_type('raster') });

	const location_entry = data.basicData.find(e => e.key === 'Location');

	const coords_el = qs('.location-coordinates', container);
	coords_el.textContent = data.coordinates ?? '';
	coords_el.style.display = data.coordinates ? '' : 'none';

	qs('.location-priority-badge', container).textContent = t(window.LOCALE, 'right_panel.prioritization.priority_score_badge', { "score": score_entry.value });

	qs('.location-area-type span', container).textContent = area_label;

	const loc_row = qs('.location-name', container);
	qs('span', loc_row).textContent = location_entry?.value ?? '';
	loc_row.style.display = location_entry ? '' : 'none';

	container.style.display = '';
}

export function clear_location_summary() {
	const container = qs('#location-summary');
	if (container) container.style.display = 'none';
}
