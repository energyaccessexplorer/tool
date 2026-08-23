/* global JSZip */

import {
	area_type,
	loading,
} from './utils.js';

import {
	delay,
	fake_blob_download,
	tmpl,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import { t, translateNode, translateIndexName, translateDivisionName, getScaleLabels } from './translate.js';

import { generate_summary_data, compute_share_amounts } from './summary.js';

import {
	pptx,
	PPT_MAX_COLUMNS,
} from './report.js';

import {
	analysis,
} from './analysis.js';

import {
	get_locations_results,
} from './right-panel-high-priority-areas.js';

import {
	show as show_modal_table,
} from './modal-table-high-priority-areas.js';

import {
	prepare_tabular_data,
	generate_rows,
} from './area-analysis.js';

const slugify = (s) => s.toLowerCase().replace(/\s+/g, '-');

function escape_csv(val) {
	if (val === null || val === undefined) return '';
	const str = String(val);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

async function build_csv_rows(results, { headers, is_raster, analysis_name, onProgress, isCancelled }) {
	const total = results.length;
	const rows = [];
	let last_yield = performance.now();
	let i = 0;
	for (const row_data of generate_rows(results, is_raster, analysis_name)) {
		if (isCancelled && isCancelled()) return null;

		rows.push(headers.map(h => escape_csv(row_data[h])).join(','));
		i++;
		if (performance.now() - last_yield > 16) {
			if (onProgress) onProgress(i / total);
			await new Promise(resolve => setTimeout(resolve, 0));
			last_yield = performance.now();
		}
	}
	if (onProgress) onProgress(1);
	return rows;
}

export function export_filename(name, extension, { timestamp = true } = {}) {
	if (!timestamp) return `eae-${name}.${extension}`;

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
	return `${date_str}${time_str}-eae-${name}.${extension}`;
}

export function generate_share_csv_content() {
	const levels = getScaleLabels(window.LOCALE).map(l => l.toLowerCase());
	const columns = [];
	const data = [];

	for (const type of ['area', 'population-density']) {
		const label = type === 'area' ? area_type('raster') : 'people';
		for (const k of Object.keys(SUMMARY)) {
			const name = `${translateIndexName(window.LOCALE, k)} (${label})`;
			columns.push(name);
			data.push(compute_share_amounts(SUMMARY[k][type]).amounts);
		}
	}

	const indexCount = Object.keys(SUMMARY).length;
	const areaShareCells = ['Area share', ...Array(indexCount - 1).fill('')];
	const populationShareCells = ['Population share', ...Array(indexCount - 1).fill('')];
	const categoryRow = ['', ...areaShareCells, ...populationShareCells];

	const headers = ['Level', ...columns];
	const rows = [
		categoryRow.join(','),
		headers.join(','),
		...levels.map((level, i) => [level, ...data.map(col => col[i])].join(',')),
	];

	return rows.join('\n');
}

export function download_share_csv() {
	const csv = generate_share_csv_content();
	const blob = new Blob([csv], { "type": 'text/csv' });
	fake_blob_download(blob, export_filename('population-area-share', 'csv'));
}

async function export_all(results, visible_headers) {
	let cancelled = false;

	const update = (progress) => loading(t(window.LOCALE, 'modal.export.generating'), {
		"progress": progress,
		"cancel":   () => { cancelled = true; },
	});

	update(0);
	await delay(0.1);
	await generate_summary_data();

	if (cancelled) { loading(false); return; }
	update(20);

	const zip = new JSZip();
	const type = STATE.index;
	const index_slug = slugify(EAE['indexes'][type]['name']);

	let pptx_blob, tiff_blob, high_priority_csv, share_csv;
	try {
		[pptx_blob, tiff_blob, high_priority_csv, share_csv] = await Promise.all([
			pptx({ results, visible_headers }).then(p => p.write('blob')),
			analysis(type).then(a => a.tiff),
			generate_high_priority_areas_csv(results, {
				visible_headers,
				"onProgress":  (p) => update(20 + (p * 50)),
				"isCancelled": () => cancelled,
			}),
			Promise.resolve(generate_share_csv_content()),
		]);
	} catch (e) {
		console.error('Export failed:', e);
		loading(false);
		return;
	}

	if (cancelled || high_priority_csv === null) { loading(false); return; }
	update(70);

	zip.file(export_filename('summary', 'pptx', { "timestamp": false }), pptx_blob);
	zip.file(export_filename(`${index_slug}-map`, 'tif', { "timestamp": false }), tiff_blob);
	zip.file(export_filename(`${index_slug}-high-priority-areas`, 'csv', { "timestamp": false }), high_priority_csv);
	zip.file(export_filename('population-area-share', 'csv', { "timestamp": false }), share_csv);

	const zip_blob = await zip.generateAsync({
		"type": 'blob',
	}, (metadata) => {
		if (cancelled) return;
		update(70 + (metadata.percent * 0.3));
	});

	loading(false);

	if (!cancelled) {
		fake_blob_download(zip_blob, export_filename('export', 'zip'));
	}
}

function location_columns() {
	if (STATE.variant === 'raster') return new Set(["Latitude", "Longitude"]);
	return new Set([translateDivisionName(window.LOCALE, GEOGRAPHY.divisions[STATE.variant].name)]);
}

function ppt_enabled_columns(total) {
	const location = location_columns();
	const results = get_locations_results();
	if (!results?.length) return location;

	const { headers, column_meta, selector_groups } = prepare_tabular_data(results);
	const location_group = selector_groups.find(g => g.synthetic);
	const all_location = new Set(location_group ? location_group.children : []);

	const dataset_cols = headers.filter(h => {
		const m = column_meta.get(h);
		return m && !m.locked && !m.subordinate && !all_location.has(h);
	});

	const fixed_count = headers.filter(h => column_meta.get(h)?.locked).length;
	return new Set([...location, ...dataset_cols].slice(0, total - fixed_count));
}

export function show_export_modal() {
	const content = tmpl('#export-options-modal-content');
	translateNode(window.LOCALE, content);

	bind(content, {
		"area_type":  area_type(STATE.variant).toLowerCase(),
		"export_ppt": () => {
			document.querySelector('#export-options-modal')?.remove();
			show_modal_table(get_locations_results(), {
				"title":              t(window.LOCALE, 'modal.export.ppt_title'),
				"subtitle":           t(window.LOCALE, 'modal.export.select_subtitle'),
				"action_label":       t(window.LOCALE, 'modal.export.download_ppt'),
				"column_toggle_hint": t(window.LOCALE, 'modal.export.ppt_hint'),
				"enabled_columns":    ppt_enabled_columns(PPT_MAX_COLUMNS),
				"max_columns":        PPT_MAX_COLUMNS,
				async on_download(results, visible_headers) {
					loading(t(window.LOCALE, 'modal.export.generating'));
					await delay(0.1);
					await generate_summary_data();
					const p = await pptx({ results, visible_headers });
					p.writeFile({ "filename": export_filename('summary', 'pptx') });
					loading(false);
				},
			});
		},
		"export_tiff": async () => {
			loading(t(window.LOCALE, 'modal.export.generating'));
			const type = STATE.index;
			const index_slug = slugify(EAE['indexes'][type]['name']);
			fake_blob_download((await analysis(type)).tiff, export_filename(`${index_slug}-map`, 'tif'));
			loading(false);
		},
		"export_csv":       () => {
			const area_type_str = area_type(STATE.variant);
			const analysis_name = translateIndexName(window.LOCALE, STATE.index);
			const results = get_locations_results();

			document.querySelector('#export-options-modal')?.remove();
			show_modal_table(results, {
				"title":              `${t(window.LOCALE, 'modal.export.high_priority.title')} (${area_type_str})`,
				"subtitle":           analysis_name,
				"action_label":       t(window.LOCALE, 'modal.export.download_csv'),
				"column_toggle_hint": t(window.LOCALE, 'modal.export.csv_hint'),
				"enabled_columns":    new Set(),
				on_download(results, visible_headers) {
					download_high_priority_areas(results, { visible_headers });
				},
			});
		},
		"export_share_csv": async () => {
			loading(t(window.LOCALE, 'modal.export.generating'));
			await generate_summary_data();
			download_share_csv();
			loading(false);
		},
	});

	const footer = tmpl('#export-options-modal-footer');
	translateNode(window.LOCALE, footer);
	bind(footer, {
		"export_all": () => {
			document.querySelector('#export-options-modal')?.remove();
			show_modal_table(get_locations_results(), {
				"title":              t(window.LOCALE, 'modal.export.download_all'),
				"subtitle":           t(window.LOCALE, 'modal.export.select_subtitle'),
				"action_label":       t(window.LOCALE, 'modal.export.download_zip'),
				"column_toggle_hint": t(window.LOCALE, 'modal.export.zip_hint'),
				"enabled_columns":    ppt_enabled_columns(PPT_MAX_COLUMNS),
				"max_columns":        PPT_MAX_COLUMNS,
				on_download(results, visible_headers) {
					export_all(results, visible_headers);
				},
			});
		},
	});

	const header = tmpl('#export-options-modal-header');
	translateNode(window.LOCALE, header);

	new modal({
		"id":      'export-options-modal',
		"header":  header,
		"content": content,
		"footer":  footer,
		"destroy": true,
	}).show();
}

export async function download_high_priority_areas(results, opts = {}) {
	const { headers, is_raster, analysis_name } = prepare_tabular_data(results);
	const csv_headers = opts.visible_headers || headers;

	let cancelled = false;

	loading(t(window.LOCALE, 'modal.export.generating'), {
		"progress": 0,
		"cancel":   () => { cancelled = true; },
	});

	const warn_before_unload = (e) => {
		e.preventDefault();
		e.returnValue = '';
	};
	window.addEventListener('beforeunload', warn_before_unload);

	const rows = await build_csv_rows(results, {
		"headers":    csv_headers, is_raster, analysis_name,
		"onProgress":  (p) => loading(t(window.LOCALE, 'modal.export.generating'), {
			"progress": p * 100,
			"cancel":   () => { cancelled = true; },
		}),
		"isCancelled": () => cancelled,
	});

	window.removeEventListener('beforeunload', warn_before_unload);
	loading(false);

	if (rows) {
		const csv_content = [csv_headers.join(','), ...rows].join('\n');
		const filename = export_filename(`${slugify(analysis_name)}-high-priority-areas`, 'csv');
		fake_blob_download(csv_content, filename, 'text/csv;charset=utf-8');
	}
}

async function generate_high_priority_areas_csv(results, opts = {}) {
	if (!results || results.length === 0) return '';

	const { visible_headers, onProgress, isCancelled } = opts;
	const { headers, is_raster, analysis_name } = prepare_tabular_data(results);
	const csv_headers = visible_headers || headers;

	const rows = await build_csv_rows(results, {
		"headers": csv_headers, is_raster, analysis_name, onProgress, isCancelled,
	});

	if (rows === null) return null;
	return [csv_headers.join(','), ...rows].join('\n');
}
