import {
	area_type,
	coordinates_to_raster_pixel,
} from './utils.js';

import {
	context,
} from './complicated.js';

import {
	lowmedhigh_scale,
	priority_scale,
} from './analysis.js';

import {
	maybe,
} from '../lib/helpers.js';

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

export function sort_results(results, column, desc, is_raster, analysis_name) {
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

