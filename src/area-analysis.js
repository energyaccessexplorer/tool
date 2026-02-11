import {
	area_type,
	coordinates_to_raster_pixel,
	loading,
} from './utils.js';

import {
	export_filename,
} from './export.js';

import {
	context,
} from './complicated.js';

import {
	lowmedhigh_scale,
	priority_scale,
} from './analysis.js';

import {
	fake_blob_download,
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

export function get_admin_area_item(variant, featureId) {
	const division = GEOGRAPHY.divisions[variant];
	if (!division || !division.priorityData || !division.vectors) return null;

	const features = division.vectors.data.features;
	const priorityData = division.priorityData;
	const nameTable = maybe(division, 'csv', 'table') || {};

	const id = featureId;
	const feature = features.find(f => f.id === +id);
	if (!feature || !priorityData[id]) return null;

	return {
		"id":       +id,
		"priority": priorityData[id].average,
		"name":     nameTable[id] || `Area ${id}`,
		"feature":  feature,
	};
}

export function get_admin_area_layer_data(variant, area_id) {
	const fields = [];
	const props = {};
	const raw = { "values": {}, "units": {} };

	const layer_data = maybe(GEOGRAPHY, 'divisions', variant, 'layerData');
	if (layer_data) {
		for (const layer_id in layer_data) {
			const layer = layer_data[layer_id];
			const area_result = maybe(layer, 'areas', area_id, 'result');

			if (!area_result) continue;

			let value, unit;
			if (area_result.type === 'points') {
				value = area_result.value;
				unit = 'count';
			} else {
				value = parseFloat(area_result.value.toFixed(2));
				unit = layer.unit || '';
			}

			fields.push([layer_id, layer.name]);
			props[layer_id] = value;
			raw.values[layer_id] = value;
			raw.units[layer_id] = unit;
		}
	}

	return [fields, props, raw];
}

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
			const nameFromProps = Object.entries(props).find(([k]) => {
				const lk = k.toLowerCase();
				return lk === 'facility name' || lk === 'name' || lk === 'facility_name';
			})?.[1];
			const name = feature_name || nameFromProps;

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
			const scale = is_admin_area
				? priority_scale(GEOGRAPHY.divisions[area_info.variant].priorityData, lowmedhigh_scale.range())
				: lowmedhigh_scale;
			const analysisData = { "label": analysis_name, "value": scale(analysis_value) };
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
	const allDivisionFields = fields.filter(d => d && d[0] && d[0].startsWith('_') && !d[0].includes('analysis'));
	const divisionFieldsForBasic = allDivisionFields.filter(d => d !== feature_entry);

	const divisionValues = divisionFieldsForBasic.map(d => props[d[0]]).filter(v => v);

	if (divisionValues.length) {
		basicData.push({ "label": "Location", "value": divisionValues.join(', ') });
	}

	const datasetIds = new Set(STATE.datasets.map(d => d.id));
	const clickedLayerId = fields.find(d => d?.[0]?.startsWith('_') && datasetIds.has(d[0].slice(1)))?.[0].slice(1);
	const layerEntries = {};
	const subordinateEntries = {};

	for (const field of fields) {
		if (!field) continue;
		const [key, label] = field;
		if (!key || key.startsWith('_') || key.includes('analysis')) continue;
		if (['facility name', 'name', 'facility_name'].includes(key.toLowerCase())) continue;
		if (props[key] == null) continue;

		(datasetIds.has(key) ? layerEntries : subordinateEntries)[key] = [key, label];
	}

	function pushDetail(key, label, value, subordinate) {
		const unit = raw.units[key];
		const displayUnit = unit === 'count' ? '' : (unit || '');
		const v = Number(value);
		const formatted = Number.isFinite(v) ? v.toLocaleString() : value;
		detailedData.push({
			"label":       label || key,
			"value":       `${formatted} ${displayUnit}`.trim(),
			"rawValue":    raw.values[key],
			"unit":        unit,
			"subordinate": subordinate,
		});
	}

	for (const { "id": layerId } of STATE.datasets) {
		if (!layerEntries[layerId]) continue;

		const [key, label] = layerEntries[layerId];
		const parentIndex = detailedData.length;
		pushDetail(key, label, raw.values[key]);

		if (layerId === clickedLayerId) {
			for (const subKey in subordinateEntries) {
				const [, subLabel] = subordinateEntries[subKey];
				pushDetail(subKey, subLabel || subKey, props[subKey], true);
			}
			if (detailedData.length > parentIndex + 1) {
				detailedData[parentIndex].has_subordinates = true;
			}
		}
	}

	for (const field of allDivisionFields) {
		const value = props[field[0]];
		if (value) {
			detailedData.push({ "label": field[1], "value": value });
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
		const raster_pixel = coordinates_to_raster_pixel(ll, OUTLINE.raster);
		[fields, props, raw] = context(raster_pixel);
	} else {
		info = { "variant": STATE.variant, "name": item.name };
		[fields, props, raw] = get_admin_area_layer_data(STATE.variant, item.id);
	}

	const { feature, feature_type, detailedData } = area_info(
		fields, props, ll, item.priority, analysis_name, null, info, raw,
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
	if (column === "Priority score" || column === analysis_name) return item.priority;
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
	const area_type_str = area_type(STATE.variant);

	const row = get_row(results[0], is_raster, analysis_name);
	const fixedOrder = ["Priority score", analysis_name, "Latitude", "Longitude"];
	const remaining = Object.keys(row).filter(h => !fixedOrder.includes(h));
	const headers = fixedOrder.filter(h => row.hasOwnProperty(h)).concat(remaining);

	return { headers, "area_type": area_type_str, analysis_name, is_raster };
}

function* generate_rows(results, is_raster, analysis_name, start = 0, count = results.length - start) {
	for (const item of results.slice(start, start + count)) {
		yield get_row(item, is_raster, analysis_name);
	}
}

export async function download(results) {
	const data = prepare_data(results);
	const { headers, is_raster, analysis_name } = data;

	let cancelled = false;

	loading("Generating...", {
		"progress": 0,
		"cancel":   () => { cancelled = true; },
	});

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

	const total = results.length;
	const rows = [];
	let i = 0;
	for (const row_data of generate_rows(results, is_raster, analysis_name)) {
		if (cancelled) break;

		rows.push(headers.map(h => escape_csv(row_data[h])).join(','));
		if (++i % 100 === 0) {
			loading("Generating...", {
				"progress": (i / total) * 100,
				"cancel":   () => { cancelled = true; },
			});
			await new Promise(resolve => setTimeout(resolve, 0));
		}
	}

	window.removeEventListener('beforeunload', warn_before_unload);
	loading(false);

	if (!cancelled) {
		const csv_content = [headers.join(','), ...rows].join('\n');
		const filename = export_filename(`${analysis_name.toLowerCase().replace(/\s+/g, '-')}-high-priority-areas`, 'csv');
		fake_blob_download(csv_content, filename, 'text/csv;charset=utf-8');
	}
}

export async function generate_csv_content(results, opts = {}) {
	if (!results || results.length === 0) return '';

	const { onProgress, isCancelled } = opts;
	const data = prepare_data(results);
	const { headers, is_raster, analysis_name } = data;

	const escape_csv = (val) => {
		if (!val) return '';
		const str = String(val);
		if (str.includes(',') || str.includes('"') || str.includes('\n')) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	};

	const total = results.length;
	const rows = [];
	let i = 0;
	for (const row_data of generate_rows(results, is_raster, analysis_name)) {
		if (isCancelled && isCancelled()) return null;

		rows.push(headers.map(h => escape_csv(row_data[h])).join(','));
		if (++i % 100 === 0) {
			if (onProgress) onProgress(i / total);
			await new Promise(resolve => setTimeout(resolve, 0));
		}
	}

	if (onProgress) onProgress(1);
	return [headers.join(','), ...rows].join('\n');
}

export function view_all(results) {
	const data = prepare_data(results);
	if (!data) return;

	const { headers, is_raster, "area_type": area_type_str, analysis_name } = data;

	const selected_indices = new Set();

	const state = {
		"sort_column": headers[0],
		"sort_desc":   true,
		"results":     results,
		"page":        1,
		"per_page":    10,
	};

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
		"download_selected": () => {
			const selected = Array.from(selected_indices).sort((a, b) => a - b).map(i => state.results[i]);
			download(selected);
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
		"download": () => download(results),
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
		const total = Math.ceil(state.results.length / state.per_page);
		const current = state.page;
		const delta = 1;
		const pages = [];
		const middle = Math.ceil(total / 2);

		if (total <= 7) {
			return Array.from({ "length": total }, (_, i) => i + 1);
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
		const total = Math.ceil(state.results.length / state.per_page);
		if (page < 1 || page > total) return;
		state.page = page;
		render_page();
	}

	update_sort_icons();
	render_page();

	const header = tmpl('#modal-header-template');
	bind(header, {
		"title":    `High priority areas (${area_type_str})`,
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
