import {
	coordinates_to_raster_pixel,
} from './utils.js';

import {
	context,
} from './complicated.js';

import {
	lowmedhigh_scale,
} from './analysis.js';

import {
	fake_blob_download,
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

export function area_info(fields, props, ll, analysis_value, analysis_name, feature_name, area_info = null, raw = { "values": {}, "units": {} }) {
	const is_admin_area = area_info !== null;

	let feature = null;
	let feature_type = null;
	const basicData = [];
	const detailedData = [];

	if (is_admin_area) {
		feature = area_info.name;
		const division_name = maybe(GEOGRAPHY, 'divisions', area_info.variant, 'name');
		if (division_name) {
			feature_type = division_name;
		}
	} else {
		const feature_entry = fields.find(d => d && d[0] && d[0].startsWith('_') && !d[0].includes('analysis'));

		if (feature_entry) {
			const category_html = feature_entry[1];
			const category = category_html.match(/<strong[^>]*>(.*?)<\/strong>/)?.[1] || '';
			const name = feature_name || props['Facility Name'] || props['name'];

			if (name) {
				feature = name;
				if (category) {
					feature_type = category;
				}
			}
		}
	}

	if (Number.isFinite(analysis_value)) {
		if (analysis_name) {
			const analysisData = { "label": analysis_name, "value": lowmedhigh_scale(analysis_value) };
			basicData.push(analysisData);
			detailedData.push(analysisData);
		}
		const percentage = (analysis_value * 100).toFixed(1);
		const priorityData = { "label": "Priority score", "value": `${percentage}%` };
		basicData.push(priorityData);
		detailedData.push(priorityData);
	}

	if (!is_admin_area && maybe(ll, 'length') === 2 && feature) {
		const coordData = { "label": "Coordinates", "value": `[${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}]` };
		basicData.push(coordData);
		detailedData.push(coordData);
	}

	const feature_entry = fields.find(d => d && d[0] && d[0].startsWith('_') && !d[0].includes('analysis'));
	const divisions = fields
		.filter(d => d && d[0] && d[0].startsWith('_') && !d[0].includes('analysis'))
		.filter(d => d !== feature_entry)
		.map(d => props[d[0]])
		.filter(v => v);

	if (divisions.length) {
		const locationData = { "label": "Location", "value": divisions.join(', ') };
		basicData.push(locationData);
		detailedData.push(locationData);
	}

	if (!is_admin_area) {
		for (const field of fields) {
			if (!field) continue;
			if (field[0].startsWith('_')) continue;
			if (field[0].includes('analysis')) continue;

			const field_name = field[0].toLowerCase();
			if (field_name === 'facility name' || field_name === 'name' || field_name === 'facility_name') continue;

			if (!props[field[0]]) continue;

			const key = field[0];
			const label = field.hasOwnProperty(1) ? field[1] : key;
			const value = props[key].toString();
			const rawValue = raw.values[key];
			const unit = raw.units[key];
			detailedData.push({ label, value, rawValue, unit });
		}
	}

	const hasLayerData = STATE.datasets.length > 0;

	const coordinates = maybe(ll, 'length') === 2 ? `[${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}]` : null;

	return {
		feature,
		feature_type,
		basicData,
		detailedData,
		"coordinate-title": !feature && coordinates,
		coordinates,
		"has-basic":        basicData.length > 0,
		"has-detailed":     hasLayerData,
	};
}

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

function get_row(item, is_raster, analysis_name) {
	let fields = [];
	let props = {};
	let raw = { "values": {}, "units": {} };
	let ll = null;
	let info = null;

	if (is_raster) {
		ll = item.c;
		const rc = coordinates_to_raster_pixel(ll, OUTLINE.raster);
		[fields, props, raw] = context(rc, null);
	} else {
		info = { "variant": STATE.variant, "name": item.name };
	}

	const { detailedData } = area_info(
		fields, props, ll, item.v, analysis_name, null, info, raw,
	);

	const row = {};
	if (ll) {
		row["Longitude"] = ll[0].toFixed(5);
		row["Latitude"] = ll[1].toFixed(5);
	}

	for (const data of detailedData) {
		const header = data.unit ? `${data.label} - ${data.unit}` : data.label;
		let value = data.rawValue !== undefined ? data.rawValue : data.value;
		if (value === "< 1") value = 1;
		row[header] = value;
	}

	return row;
}

function get_sort_value(item, column, is_raster, analysis_name) {
	if (column === "Priority score" || column === analysis_name) return item.v;
	if (column === "Longitude" && item.c) return item.c[0];
	if (column === "Latitude" && item.c) return item.c[1];

	const row = get_row(item, is_raster, analysis_name);
	const value = row[column];
	return value && parseFloat(value) || value;
}

function sort_results(results, column, desc, is_raster, analysis_name) {
	const sorted = [...results];
	const mult = desc ? -1 : 1;

	sorted.sort((a, b) => {
		const valA = get_sort_value(a, column, is_raster, analysis_name);
		const valB = get_sort_value(b, column, is_raster, analysis_name);

		if (valA == null && valB == null) return 0;
		if (valA == null) return 1;
		if (valB == null) return -1;

		if (typeof valA === 'number' && typeof valB === 'number') {
			return (valA - valB) * mult;
		}

		return String(valA).localeCompare(String(valB)) * mult;
	});

	return sorted;
}

function prepare_data(results) {
	const is_raster = STATE.variant === 'raster';
	const analysis_name = EAE['indexes'][STATE.index]['name'];

	const headers = ["Priority score", ...Object.keys(get_row(results[0], is_raster, analysis_name)).filter(h => h !== "Priority score")];
	const area_type = is_raster ? '1km²' : (GEOGRAPHY.divisions[STATE.variant]?.name || 'areas');

	return { headers, area_type, analysis_name, is_raster };
}

function* generate_rows(results, is_raster, analysis_name, start = 0, count = results.length - start) {
	const end = Math.min(start + count, results.length);
	for (let i = start; i < end; i++) {
		yield get_row(results[i], is_raster, analysis_name);
	}
}

export async function download(results, event) {
	const data = prepare_data(results);
	const { headers, is_raster, analysis_name } = data;
	const button = event.currentTarget;

	button.disabled = true;
	button.querySelector('span').textContent = 'Generating...';

	const warn_before_unload = (e) => {
		e.preventDefault();
		e.returnValue = '';
	};
	window.addEventListener('beforeunload', warn_before_unload);

	const escape_csv = (val) => {
		if (val === null || val === undefined) return '';
		const str = String(val);
		if (str.includes(',') || str.includes('"') || str.includes('\n')) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	};

	const rows = [];
	let i = 0;
	for (const row_data of generate_rows(results, is_raster, analysis_name)) {
		rows.push(headers.map(h => escape_csv(row_data[h])).join(','));
		if (++i % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
	}

	const csv_content = [headers.join(','), ...rows].join('\n');
	const now = new Date();
	const date_str = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, '0'),
		String(now.getDate()).padStart(2, '0'),
	].join('');
	const time_str = [
		String(now.getHours()).padStart(2, '0'),
		String(now.getMinutes()).padStart(2, '0'),
	].join('');
	const filename = `${date_str}${time_str}-eae-${analysis_name.toLowerCase().replace(/\s+/g, '-')}.csv`;

	fake_blob_download(csv_content, filename, 'text/csv;charset=utf-8');

	window.removeEventListener('beforeunload', warn_before_unload);
	button.disabled = false;
	button.querySelector('span').textContent = 'Download data';
}

export function view_all(results) {
	const data = prepare_data(results);
	if (!data) return;

	const { headers, is_raster, area_type, analysis_name } = data;

	const BATCH_SIZE = 50;
	let loaded_count = 0;
	let observer = null;
	const selected_indices = new Set();

	const sort = {
		"column":  headers[0],
		"desc":    true,
		"results": results,
	};

	function get_icon_class(header) {
		if (sort.column !== header) return "bi bi-chevron-expand";
		return sort.desc ? "bi bi-caret-down-fill" : "bi bi-caret-up-fill";
	}

	function handle_sort(header) {
		const is_priority = header === headers[0] || header === analysis_name;

		if (sort.column === header) {
			sort.desc = !sort.desc;
		} else {
			sort.column = header;
			sort.desc = is_priority;
		}

		refresh_table();
	}

	const content = tmpl('#high-priority-areas-list-all-template');
	bind(content, {
		"analysis-name": analysis_name,
		"headers":       headers.map(name => ({
			name,
			"on_sort": () => handle_sort(name),
		})),
	});

	const footer = tmpl('#high-priority-areas-list-all-footer-template');
	bind(footer, {
		"download": (_, event) => download(results, event),
	});

	const table_container = qs('.high-priority-areas-list-all-table-container', content);
	const tbody = qs('tbody', content);
	const selection_overlay = qs('.selection-overlay', content);
	const selection_count = qs('.selection-count', content);
	const select_all_checkbox = qs('.select-all-checkbox', content);
	const download_selected_button = qs('.download-selected-button', content);

	const scroll_trigger = document.createElement('tr');
	scroll_trigger.className = 'scroll_trigger-row';
	scroll_trigger.innerHTML = `<td colspan="${headers.length + 1}"></td>`;

	function update_selection_overlay() {
		const count = selected_indices.size;
		if (count > 0) {
			selection_overlay.classList.remove('hidden');
			select_all_checkbox.classList.remove('hidden');
			selection_count.textContent = `${count} row${count > 1 ? 's' : ''} currently selected.`;
		} else {
			selection_overlay.classList.add('hidden');
			select_all_checkbox.classList.add('hidden');
		}
	}

	function uncheck_all() {
		selected_indices.clear();
		tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
		select_all_checkbox.checked = false;
		update_selection_overlay();
	}

	function update_sort_icons() {
		document.querySelectorAll('.high-priority-areas-list-all-table th:not(.checkbox-column)').forEach((th, i) => {
			const icon = th.querySelector('.sort-icon i');
			if (icon) icon.className = get_icon_class(headers[i]);
		});
	}

	function refresh_table() {
		sort.results = sort_results(results, sort.column, sort.desc, is_raster, analysis_name);
		tbody.innerHTML = '';
		loaded_count = 0;
		selected_indices.clear();
		update_selection_overlay();
		update_sort_icons();
		load_batch();

		if (observer && loaded_count < sort.results.length) {
			observer.observe(scroll_trigger);
		}
	}

	select_all_checkbox.addEventListener('change', uncheck_all);

	download_selected_button.addEventListener('click', (event) => {
		const selected = Array.from(selected_indices).sort((a, b) => a - b).map(i => sort.results[i]);
		download(selected, event);
	});

	function load_batch() {
		for (const row_data of generate_rows(sort.results, is_raster, analysis_name, loaded_count, BATCH_SIZE)) {
			const row_index = loaded_count;
			const row = tmpl('#high-priority-areas-row-template');
			bind(row, {
				"cells":     headers.map(header => ({ "value": row_data[header] || '' })),
				"on_select": function() {
					if (this.checked) {
						selected_indices.add(row_index);
					} else {
						selected_indices.delete(row_index);
					}
					update_selection_overlay();
				},
			});
			tbody.append(row);
			loaded_count++;
		}

		if (loaded_count < sort.results.length) {
			tbody.append(scroll_trigger);
		} else if (observer) {
			observer.disconnect();
		}
	}

	update_sort_icons();
	load_batch();

	const m = new modal({
		"id":      'high-priority-areas-list-all',
		"header":  `High priority areas (${area_type})`,
		"content": content,
		"footer":  footer,
		"destroy": true,
	});

	m.show(() => {
		observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting && loaded_count < sort.results.length) {
					scroll_trigger.remove();
					load_batch();
				}
			});
		}, {
			"root":       table_container,
			"rootMargin": '100px',
			"threshold":  0,
		});

		if (loaded_count < sort.results.length) {
			observer.observe(scroll_trigger);
		}
	});
}
