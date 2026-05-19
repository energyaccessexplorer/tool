import {
	area_type,
	resolve_raster_value,
	format_value_unit,
} from './utils.js';

import {
	lowmedhigh_scale,
	priority_scale,
} from './analysis.js';

import {
	maybe,
} from '../lib/helpers.js';

const row_cache = new Map();
let feature_indexes = null;

function item_key(item) {
	return item.i !== undefined ? item.i : item.id;
}

export function clear_row_cache() {
	row_cache.clear();
	feature_indexes = null;
}

function get_feature_indexes() {
	if (feature_indexes) return feature_indexes;

	feature_indexes = STATE.datasets
		.filter(dataset => dataset.vectors && maybe(dataset, 'config', 'attributes_map', 'length'))
		.map(dataset => {
			const map = new Map();
			for (const feature of dataset.vectors.data.features) {
				const ri = feature.properties['__rasterindex'];
				if (ri !== undefined && ri !== null) {
					map.set(ri, feature.properties);
				}

				const ris = feature.properties['__rasterindexes'];
				if (ris) {
					for (const idx of ris) {
						if (idx !== undefined && idx !== null && !map.has(idx)) {
							map.set(idx, feature.properties);
						}
					}
				}
			}
			return { "index": map, dataset };
		});

	return feature_indexes;
}

export function value_tree(raster_index) {
	const indexes_by_id = new Map(
		get_feature_indexes().map(({ index, dataset }) => [dataset.id, index]),
	);

	return STATE.datasets
		.filter(dataset => dataset.category.name !== 'boundaries'
			&& dataset.category.name !== 'outline'
			&& dataset.raster?.data
			&& dataset.raster.data[raster_index] !== dataset.raster.nodata)
		.map(dataset => {
			const raw = resolve_raster_value(dataset, dataset.raster.data[raster_index]);
			const unit = dataset_unit(dataset, raw);
			if (!unit) return null;

			const fi = indexes_by_id.get(dataset.id);
			const props = fi?.get(raster_index);

			return {
				"id":       dataset.id,
				"name":     dataset.name,
				"header":   `${dataset.name} - ${unit}`,
				"value":    raw,
				"children": maybe(dataset, 'config', 'attributes_map', 'length')
					? Object.fromEntries(
						dataset.config.attributes_map.map(attr =>
							[attr.target, props ? (props[attr.dataset] ?? '') : ''],
						),
					)
					: {},
			};
		})
		.filter(Boolean);
}


export function get_admin_area_layer_data(variant, area_id) {
	const fields = [];
	const props = {};
	const raw = { "values": {}, "units": {}, "aggregations": {} };

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
				value = layer.aggregation === 'SUM'
					? Math.round(area_result.value)
					: parseFloat(area_result.value.toFixed(2));
				unit = resolve_unit(layer, DST.get(layer_id), value);
			}

			fields.push([layer_id, layer.name]);
			props[layer_id] = value;
			raw.values[layer_id] = value;
			raw.units[layer_id] = unit;
			raw.aggregations[layer_id] = layer.aggregation;
		}
	}

	return [fields, props, raw];
}

function resolve_feature(fields, props, feature_name, admin_info) {
	if (admin_info) {
		return {
			"feature":      admin_info.name,
			"feature_type": maybe(GEOGRAPHY, 'divisions', admin_info.variant, 'name') || null,
		};
	}

	const feature_entry = fields.find(field => field?.[0]?.startsWith('_') && !field[0].includes('analysis'));
	if (!feature_entry) return { "feature": null, "feature_type": null };

	const dataset = STATE.datasets.find(d => d.id === feature_entry[0].slice(1));
	const category = dataset?.name?.toUpperCase() || '';
	const name_field = fields.find(field => field?.[1] && !field[0]?.startsWith('_') &&
		['name', 'facility name', 'facility_name'].includes(field[1].toLowerCase()));
	const name = props[name_field?.[0]] || feature_name;

	return {
		"feature":      name || null,
		"feature_type": (name && category) ? category : null,
	};
}

function analysis_entries(analysis_value, analysis_name, admin_info) {
	if (!Number.isFinite(analysis_value)) return [];

	const scale = admin_info
		? priority_scale(GEOGRAPHY.divisions[admin_info.variant].priorityData, lowmedhigh_scale.range())
		: lowmedhigh_scale;

	return [
		...(analysis_name ? [{ "label": analysis_name, "value": scale(analysis_value), "raw_value": scale(analysis_value), "has_info_button": true }] : []),
		{ "label": "Priority score", "value": `${(analysis_value * 100).toFixed(1)}%`, "raw_value": analysis_value },
	];
}

function format_coordinates(ll) {
	return maybe(ll, 'length') === 2
		? `[${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}]`
		: null;
}

export function admin_location_name(variant, id) {
	const csv_data = maybe(DST.get('admin-tiers'), 'csv', 'data');
	if (csv_data) {
		const tier_col = `TIER${variant}`;
		 
		const row = csv_data.find(r => r[tier_col] == id);
		if (row) {
			const names = [];
			for (let i = variant; i >= 1; i--) {
				const name = maybe(GEOGRAPHY, 'divisions', i, 'csv', 'table', row[`TIER${i}`]);
				if (name) names.push(name);
			}
			names.push(GEOGRAPHY.name);
			return names.join(', ');
		}
	}
	return [maybe(GEOGRAPHY, 'divisions', variant, 'name'), GEOGRAPHY.name].filter(Boolean).join(', ');
}

function location_entry(fields, props) {
	const division_fields = fields.filter(field => field?.[0]?.startsWith('_') && !field[0].includes('analysis'));
	const values = division_fields
		.map(field => props[field[0]])
		.filter(Boolean);

	if (!values.length) return null;
	values.push(GEOGRAPHY.name);
	return { "label": "Location", "value": values.join(', ') };
}

function format_detail(key, label, value, raw, subordinate) {
	const unit = raw.units[key];
	const display_unit = unit === 'count' ? '' : (unit || '');
	const num = Number(value);
	const formatted = Number.isFinite(num) ? num.toLocaleString() : value;
	return {
		"label":       label || key,
		"value":       format_value_unit(formatted, display_unit),
		"raw_value":    raw.values[key],
		"unit":        unit,
		"aggregation": raw.aggregations?.[key],
		"subordinate": subordinate,
	};
}

function layer_detail_entries(fields, props, raw) {
	const ptree = get_property_tree();
	const subordinate_keys = new Set(ptree.flatMap(node => node.children.map(child => child.key)));
	const clicked_layer_id = fields.find(field => field?.[0]?.startsWith('_') && ptree.some(node => node.id === field[0].slice(1)))?.[0].slice(1);

	const layer_entries = Object.fromEntries(
		fields
			.filter(field => {
				if (!field) return false;
				const [key] = field;
				if (!key || key.startsWith('_') || key.includes('analysis')) return false;
				if (['facility name', 'name', 'facility_name'].includes(key.toLowerCase())) return false;
				if (props[key] == null) return false;
				return !subordinate_keys.has(key);
			})
			.map(([key, label]) => [key, [key, label]]),
	);

	const raster_index = props['__rasterindex'];
	const vtree = (raster_index !== undefined && raster_index !== null)
		? value_tree(raster_index)
		: null;

	return STATE.datasets.flatMap(({ "id": layer_id }) => {
		if (!layer_entries[layer_id]) return [];

		const [key, label] = layer_entries[layer_id];

		if (layer_id !== clicked_layer_id) {
			return [format_detail(key, label, raw.values[key], raw)];
		}

		const node = vtree?.find(n => n.id === layer_id);
		const children = node
			? Object.entries(node.children).map(([target, value]) =>
				format_detail(target, target, value, raw, true),
			)
			: (maybe(STATE.datasets.find(d => d.id === layer_id), 'config', 'attributes_map') || [])
				.map(attr => props[attr.dataset] != null && props[attr.dataset] !== ''
					? format_detail(attr.target, attr.target, props[attr.dataset], raw, true)
					: null)
				.filter(Boolean);

		return [
			{ ...format_detail(key, label, raw.values[key], raw), ...(children.length ? { "has_subordinates": true } : {}) },
			...children,
		];
	});
}

function division_detail_entries(fields, props) {
	return fields
		.filter(field => field?.[0]?.startsWith('_') && !field[0].includes('analysis'))
		.map(field => ({ "label": field[1], "value": props[field[0]], "raw_value": props[field[0]] }))
		.filter(entry => entry.value);
}

export function area_info(fields, props, ll, analysis_value, analysis_name, feature_name, admin_info = null, raw = { "values": {}, "units": {} }) {
	const { feature, feature_type } = resolve_feature(fields, props, feature_name, admin_info);
	const coordinates = format_coordinates(ll);

	const analysis = analysis_entries(analysis_value, analysis_name, admin_info);
	const coord = (!admin_info && coordinates && feature)
		? [{ "label": "Coordinates", "value": coordinates, "raw_value": coordinates }]
		: [];
	const location = admin_info
		? { "label": "Location", "value": admin_location_name(admin_info.variant, admin_info.id) }
		: location_entry(fields, props);

	const basicData = [...analysis, ...coord, ...(location ? [location] : [])];
	const detailedData = [
		...analysis,
		...coord,
		...layer_detail_entries(fields, props, raw),
		...division_detail_entries(fields, props),
	];

	return {
		feature,
		feature_type,
		basicData,
		detailedData,
		"coordinate-title": !feature && coordinates,
		coordinates,
		"has-basic":        basicData.length > 0,
		"has-detailed":     STATE.datasets.length > 0,
	};
}

function get_row(item, is_raster, analysis_name) {
	const key = item_key(item);
	const cached = row_cache.get(key);
	if (cached) return cached;

	const row = is_raster
		? build_raster_row(item, analysis_name)
		: build_admin_row(item, analysis_name);

	row_cache.set(key, row);
	return row;
}


export function dataset_unit(dataset, value) {
	return dataset.category.unit
		|| (Number.isFinite(value) && dataset.vectors ? "km (proximity to)" : null);
}

export function resolve_unit(layer, dataset, value) {
	return layer.unit || dataset_unit(dataset, value) || '';
}

function flatten_value_tree(tree) {
	return Object.fromEntries(
		tree.flatMap(({ name, header, value, children }) => [
			[header, value],
			...Object.entries(children).map(([target, v]) => [`${name}: ${target}`, v]),
		]),
	);
}

function find_tier_row(csv, divisions, raster_index) {
	if (!csv) return null;

	for (const [i, division] of divisions.entries()) {
		const raster_id = maybe(division, 'raster', 'data', raster_index);
		if (raster_id !== undefined) {
			const row = csv.find(r => r[`TIER${i + 1}`] === raster_id);
			if (row) return row;
		}
	}
	return null;
}

export function division_names(raster_index) {
	const divisions = GEOGRAPHY.divisions.slice(1);
	const tier_row = find_tier_row(
		maybe(DST.get('admin-tiers'), 'csv', 'data'),
		divisions,
		raster_index,
	);

	return Object.fromEntries(
		divisions
			.map((division, i) => {
				const raster_id = maybe(division, 'raster', 'data', raster_index);
				const tier_id = raster_id ?? maybe(tier_row, `TIER${i + 1}`);
				return [division.name, maybe(division, 'csv', 'table', tier_id)];
			})
			.filter(([, name]) => name),
	);
}

function priority_entries(item, analysis_name) {
	return Number.isFinite(item.priority)
		? {
			[analysis_name]:    lowmedhigh_scale(item.priority),
			"Priority score": `${(item.priority * 100).toFixed(1)}%`,
		}
		: {};
}

function build_raster_row(item, analysis_name) {
	return {
		"Longitude": item.c[0].toFixed(5),
		"Latitude":  item.c[1].toFixed(5),
		...priority_entries(item, analysis_name),
		...flatten_value_tree(value_tree(item.i)),
		...division_names(item.i),
	};
}

function build_admin_row(item, analysis_name) {
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
				return [header, data.label === "Priority score" ? data.value : data.raw_value];
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

export function get_property_tree() {
	return STATE.datasets
		.filter(dataset => dataset.category.name !== 'boundaries'
			&& dataset.category.name !== 'outline')
		.map(dataset => {
			const unit = dataset_unit(dataset, 1);
			return {
				"id":       dataset.id,
				"header":   unit ? `${dataset.name} - ${unit}` : dataset.name,
				"children": maybe(dataset, 'config', 'attributes_map', 'length')
					? dataset.config.attributes_map.map(attr => ({ "key": attr.dataset, "header": `${dataset.name}: ${attr.target}`, "display": attr.target }))
					: [],
			};
		});
}

export function prepare_tabular_data(results) {
	const is_raster = STATE.variant === 'raster';
	const analysis_name = EAE['indexes'][STATE.index]['name'];

	const row = get_row(results[0], is_raster, analysis_name);
	const fixed_order = ["Priority score", analysis_name, "Latitude", "Longitude"];

	const tree = is_raster ? get_property_tree() : [];
	const sub_targets = new Set(tree.flatMap(n => n.children.map(c => c.header)));
	const sub_display = new Map(tree.flatMap(n => n.children.map(c => [c.header, c.display])));
	const parent_by_target = new Map(tree.flatMap(n => n.children.map(c => [c.header, n.header])));
	const children_of = new Map(tree.map(n => [n.header, n.children.map(c => c.header)]));

	const base_headers = fixed_order
		.filter(h => row.hasOwnProperty(h))
		.concat(Object.keys(row).filter(h => !fixed_order.includes(h) && !sub_targets.has(h)));

	const headers = base_headers.flatMap(h =>
		[h, ...(children_of.get(h) || []).filter(c => row.hasOwnProperty(c))],
	);

	const locked = new Set([
		...fixed_order,
		...GEOGRAPHY.divisions.slice(is_raster ? 1 : 0).filter(d => row.hasOwnProperty(d.name)).map(d => d.name),
	]);

	const column_meta = new Map(headers.map(h => {
		const is_sub = sub_targets.has(h);
		return [h, {
			"visible":     !is_sub,
			"subordinate": is_sub,
			"parent":      is_sub ? parent_by_target.get(h) : null,
			"locked":      locked.has(h),
			"display":     is_sub ? sub_display.get(h) : h,
		}];
	}));

	const selector_groups = headers
		.filter(h => { const m = column_meta.get(h); return !m.locked && !m.subordinate; })
		.map(h => ({ "header": h, "children": (children_of.get(h) || []).filter(c => row.hasOwnProperty(c)) }));

	return { headers, "area_type": area_type(STATE.variant), analysis_name, is_raster, column_meta, selector_groups };
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

