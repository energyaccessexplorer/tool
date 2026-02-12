import {
	area_type,
} from './utils.js';

import {
	lowmedhigh_scale,
	priority_scale,
} from './analysis.js';

import {
	maybe,
} from '../lib/helpers.js';

const _row_cache = new Map();

function _item_key(item) {
	return item.i !== undefined ? item.i : item.id;
}

export function clear_row_cache() {
	_row_cache.clear();
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

function get_row(item, is_raster, analysis_name) {
	const key = _item_key(item);
	const cached = _row_cache.get(key);
	if (cached) return cached;

	const row = is_raster
		? _build_raster_row(item, analysis_name)
		: _build_admin_row(item, analysis_name);

	_row_cache.set(key, row);
	return row;
}

function _resolve_raster_value(d, raw) {
	const rounded = String(raw).match(/[0-9]\.[0-9]{3}/) ? parseFloat(raw.toFixed(2)) : raw;
	return maybe(d, 'csv', 'key') ? d.csv.table[rounded] : rounded;
}

function _dataset_unit(d, value) {
	return d.category.unit
		|| (Number.isFinite(value) && d.vectors ? "km (proximity to)" : null);
}

function _raster_dataset_entries(x) {
	return Object.fromEntries(
		STATE.datasets
			.filter(d => d.category.name !== 'boundaries'
				&& d.category.name !== 'outline'
				&& d.raster?.data
				&& d.raster.data[x] !== d.raster.nodata)
			.map(d => {
				const value = _resolve_raster_value(d, d.raster.data[x]);
				const unit = _dataset_unit(d, value);
				const adjusted = (value === 0 && unit === "km (proximity to)") ? 1 : value;
				return unit ? [`${d.name} - ${unit}`, adjusted] : null;
			})
			.filter(Boolean),
	);
}

function _find_tier_row(csv, divisions, x) {
	if (!csv) return null;

	for (const [i, d] of divisions.entries()) {
		const raster_id = maybe(d, 'raster', 'data', x);
		if (raster_id !== undefined) {
			const row = csv.find(r => r[`TIER${i + 1}`] === raster_id);
			if (row) return row;
		}
	}
	return null;
}

function _division_names(x) {
	const divisions = GEOGRAPHY.divisions.slice(1);
	const tier_row = _find_tier_row(
		maybe(DST.get('admin-tiers'), 'csv', 'data'),
		divisions,
		x,
	);

	return Object.fromEntries(
		divisions
			.map((d, i) => {
				const raster_id = maybe(d, 'raster', 'data', x);
				const tier_id = raster_id ?? maybe(tier_row, `TIER${i + 1}`);
				return [d.name, maybe(d, 'csv', 'table', tier_id)];
			})
			.filter(([, name]) => name),
	);
}

function _priority_entries(item, analysis_name) {
	return Number.isFinite(item.priority)
		? {
			[analysis_name]:    lowmedhigh_scale(item.priority),
			"Priority score": `${(item.priority * 100).toFixed(1)}%`,
		}
		: {};
}

function _build_raster_row(item, analysis_name) {
	return {
		"Longitude": item.c[0].toFixed(5),
		"Latitude":  item.c[1].toFixed(5),
		..._priority_entries(item, analysis_name),
		..._raster_dataset_entries(item.i),
		..._division_names(item.i),
	};
}

function _admin_detail_value(data) {
	const raw = data.rawValue !== undefined ? data.rawValue : data.value;
	return raw === "< 1" ? 1 : raw;
}

function _build_admin_row(item, analysis_name) {
	const info = { "variant": STATE.variant, "name": item.name };
	const [fields, props, raw] = get_admin_area_layer_data(STATE.variant, item.id);

	const { feature, feature_type, detailedData } = area_info(
		fields, props, null, item.priority, analysis_name, null, info, raw,
	);

	return {
		...(feature && feature_type ? { [feature_type]: feature } : {}),
		...Object.fromEntries(
			detailedData.map(data => {
				const header = data.unit ? `${data.label} - ${data.unit}` : data.label;
				return [header, _admin_detail_value(data)];
			}),
		),
	};
}

function get_sort_value(item, column, is_raster, analysis_name) {
	if (column === "Priority score" || column === analysis_name) return item.priority;
	if (column === "Longitude" && item.c) return item.c[0];
	if (column === "Latitude" && item.c) return item.c[1];

	const row = get_row(item, is_raster, analysis_name);
	const value = row[column];
	return value && parseFloat(value) || value;
}

export async function sort_results(results, column, desc, is_raster, analysis_name) {
	const mult = desc ? -1 : 1;
	const n = results.length;
	const decorated = new Array(n);

	let last_yield = performance.now();
	for (let i = 0; i < n; i++) {
		decorated[i] = [get_sort_value(results[i], column, is_raster, analysis_name), i];
		if (performance.now() - last_yield > 16) {
			await new Promise(r => setTimeout(r, 0));
			last_yield = performance.now();
		}
	}

	decorated.sort(([valA], [valB]) => {
		if (valA == null && valB == null) return 0;
		if (valA == null) return 1;
		if (valB == null) return -1;
		if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * mult;
		return String(valA).localeCompare(String(valB)) * mult;
	});

	return decorated.map(([, i]) => results[i]);
}

export function prepare_data(results) {
	const is_raster = STATE.variant === 'raster';
	const analysis_name = EAE['indexes'][STATE.index]['name'];
	const area_type_str = area_type(STATE.variant);

	const row = get_row(results[0], is_raster, analysis_name);
	const fixedOrder = ["Priority score", analysis_name, "Latitude", "Longitude"];
	const remaining = Object.keys(row).filter(h => !fixedOrder.includes(h));
	const headers = fixedOrder.filter(h => row.hasOwnProperty(h)).concat(remaining);

	return { headers, "area_type": area_type_str, analysis_name, is_raster };
}

export function* generate_rows(results, is_raster, analysis_name, start = 0, count = results.length - start) {
	for (const item of results.slice(start, start + count)) {
		yield get_row(item, is_raster, analysis_name);
	}
}

export async function precompute_rows(results, is_raster, analysis_name, signal) {
	let last_yield = performance.now();
	for (const item of results) {
		if (signal?.aborted) return;
		get_row(item, is_raster, analysis_name);
		if (performance.now() - last_yield > 16) {
			await new Promise(r => setTimeout(r, 0));
			last_yield = performance.now();
		}
	}
}

