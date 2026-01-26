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

	for (const field of fields) {
		if (!field) continue;
		if (field[0].startsWith('_')) continue;
		if (field[0].includes('analysis')) continue;

		const field_name = field[0].toLowerCase();
		if (field_name === 'facility name' || field_name === 'name' || field_name === 'facility_name') continue;

		if (props[field[0]] === undefined || props[field[0]] === null) continue;

		const key = field[0];
		const label = field.hasOwnProperty(1) ? field[1] : key;
		const value = props[key].toString();
		const rawValue = raw.values[key];
		const unit = raw.units[key];
		detailedData.push({ label, value, rawValue, unit });
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

		const layer_data = maybe(GEOGRAPHY, 'divisions', STATE.variant, 'layerData');
		if (layer_data) {
			for (const layer_id in layer_data) {
				const layer = layer_data[layer_id];
				const area_result = maybe(layer, 'areas', item.id, 'result');

				if (!area_result) continue;

				let value, unit;
				if (area_result.type === 'points') {
					value = area_result.count;
					unit = 'count';
				} else {
					value = typeof area_result.average === 'number'
						? parseFloat(area_result.average.toFixed(2))
						: area_result.average;
					unit = layer.unit || '';
				}

				fields.push([layer_id, layer.name]);
				props[layer_id] = value;
				raw.values[layer_id] = value;
				raw.units[layer_id] = unit;
			}
		}
	}

	const { feature, feature_type, detailedData } = area_info(
		fields, props, ll, item.v, analysis_name, null, info, raw,
	);

	const row = {};
	if (ll) {
		row["Longitude"] = ll[0].toFixed(5);
		row["Latitude"] = ll[1].toFixed(5);
	}

	if (feature && feature_type) {
		row[feature_type] = feature;
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

	const selected_indices = new Set();

	const state = {
		"sort_column": headers[0],
		"sort_desc":   true,
		"results":     results,
		"page":        1,
		"per_page":    10,
	};

	function total_pages() {
		return Math.ceil(state.results.length / state.per_page);
	}

	function get_icon_class(header) {
		if (state.sort_column !== header) return "bi bi-chevron-expand";
		return state.sort_desc ? "bi bi-caret-down-fill" : "bi bi-caret-up-fill";
	}

	function handle_sort(header) {
		const is_priority = header === headers[0] || header === analysis_name;

		if (state.sort_column === header) {
			state.sort_desc = !state.sort_desc;
		} else {
			state.sort_column = header;
			state.sort_desc = is_priority;
		}

		state.results = sort_results(results, state.sort_column, state.sort_desc, is_raster, analysis_name);
		state.page = 1;
		render_page();
		update_sort_icons();
	}

	const content = tmpl('#high-priority-areas-list-all-template');

	const tbody = qs('tbody', content);
	const selection_overlay = qs('.selection-overlay', content);
	const selection_count = qs('.selection-count', content);
	const select_all_checkbox = qs('.select-all-checkbox', content);
	const page_numbers_container = qs('.page-numbers', content);

	bind(content, {
		"analysis-name": analysis_name,
		"headers":       headers.map(name => ({
			name,
			"on_sort": () => handle_sort(name),
		})),
		"on_prev":           () => go_to_page(state.page - 1),
		"on_next":           () => go_to_page(state.page + 1),
		"download_selected": (_, event) => {
			const selected = Array.from(selected_indices).sort((a, b) => a - b).map(i => state.results[i]);
			download(selected, event);
		},
		"on_uncheck_all":     () => uncheck_all(),
		"on_per_page_change": function() {
			state.per_page = parseInt(this.value, 10);
			state.page = 1;
			selected_indices.clear();
			update_selection_overlay();
			render_page();
		},
	});

	const footer = tmpl('#high-priority-areas-list-all-footer-template');
	bind(footer, {
		"download": (_, event) => download(results, event),
	});

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

	function get_page_numbers() {
		const total = total_pages();
		const current = state.page;
		const delta = 1;
		const pages = [];
		const middle = Math.ceil(total / 2);

		if (total <= 7) {
			for (let i = 1; i <= total; i++) pages.push(i);
			return pages;
		}

		pages.push(1);

		const range_start = Math.max(2, current - delta);
		const range_end = Math.min(total - 1, current + delta);
		const near_start = current <= delta + 2;
		const near_end = current >= total - delta - 1;

		if (near_start) {
			for (let i = 2; i <= delta + 2; i++) pages.push(i);
			pages.push('...');
			pages.push(middle);
			pages.push('...');
		} else if (near_end) {
			pages.push('...');
			pages.push(middle);
			pages.push('...');
			for (let i = total - delta - 1; i <= total - 1; i++) pages.push(i);
		} else {
			if (range_start > 2) {
				pages.push('...');
			} else if (range_start === 2) {
				pages.push(2);
			}

			for (let i = range_start; i <= range_end; i++) {
				if (i > 1 && i < total && !pages.includes(i)) {
					pages.push(i);
				}
			}

			if (range_end < total - 1) {
				pages.push('...');
			} else if (range_end === total - 1 && !pages.includes(total - 1)) {
				pages.push(total - 1);
			}
		}

		pages.push(total);

		return pages;
	}

	function render_pagination() {
		const pages = get_page_numbers();

		page_numbers_container.innerHTML = '';
		for (const p of pages) {
			if (p === '...') {
				page_numbers_container.append(tmpl('#page-ellipsis-template'));
			} else {
				const item = tmpl('#page-number-template');
				bind(item, {
					"value":    p,
					"on_click": () => go_to_page(p),
				});
				if (p === state.page) item.firstElementChild.classList.add('active');
				page_numbers_container.append(item);
			}
		}
	}

	function render_page() {
		tbody.innerHTML = '';
		const start = (state.page - 1) * state.per_page;

		for (const row_data of generate_rows(state.results, is_raster, analysis_name, start, state.per_page)) {
			const row_index = start + tbody.children.length;
			const row = tmpl('#high-priority-areas-row-template');
			const is_selected = selected_indices.has(row_index);

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

			if (is_selected) {
				row.querySelector('input[type="checkbox"]').checked = true;
			}

			tbody.append(row);
		}

		render_pagination();
	}

	function go_to_page(page) {
		const total = total_pages();
		if (page < 1 || page > total) return;
		state.page = page;
		render_page();
	}

	update_sort_icons();
	render_page();

	const header = tmpl('#modal-header-template');
	bind(header, {
		"title":    `High priority areas (${area_type})`,
		"subtitle": analysis_name,
	});

	const m = new modal({
		"id":      'high-priority-areas-list-all',
		"header":  header,
		"content": content,
		"footer":  footer,
		"destroy": true,
	});

	m.show();
}
