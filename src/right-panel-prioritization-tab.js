import analysis_run, {
	division_averages,
	lowmedhigh_scale,
	priority_scale,
} from './analysis.js';

import {
	setup_about_button,
} from './right-panel-graphs.js';

import {
	ce,
	tmpl,
	qs,
} from '../lib/helpers.js';

function has_datasets_for(key) {
	const compound = EAE['indexes'][key].compound;
	return STATE.datasets.some(d => compound.includes(d.index));
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

export async function update(raster_index, admin_info, analysis_value) {
	const container = qs('#index-priority-container');
	if (!container) return;

	container.innerHTML = '';

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

	setup_about_button(card, EAE['indexes']['eai']['explain']);

	container.append(card);
}

function make_row(key, entry, subordinate = false) {
	const index = EAE['indexes'][key];
	const formatted = (entry?.value != null && entry?.scale) ? entry.scale(entry.value) : '—';

	const row = ce('div', null, { 'class': subordinate ? 'index-priority-row subordinate' : 'index-priority-row' });
	const name = ce('span', null, { 'class': 'index-priority-name' });
	name.textContent = index.name;
	const val = ce('span', null, { 'class': 'index-priority-value' });
	val.textContent = formatted;
	row.append(name, val);
	return row;
}

export function clear() {
	const container = qs('#index-priority-container');
	if (container) container.innerHTML = '';
}
