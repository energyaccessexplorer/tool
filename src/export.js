/* global JSZip */

import {
	loading,
} from './utils.js';

import {
	ce,
	delay,
	fake_blob_download,
	tmpl,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import { generate_summary_data } from './summary.js';

import {
	pptx,
} from './report.js';

import {
	analysis,
} from './analysis.js';

import {
	get_locations_results,
} from './right-panel-high-priority-areas.js';

import {
	prepare_data,
	generate_rows,
} from './area-analysis.js';

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
	const levels = ['low', 'low-med', 'medium', 'med-high', 'high'];
	const columns = [];
	const data = [];

	for (const type of ['area', 'population-density']) {
		const label = type === 'area' ? 'km2' : 'people';
		for (const k of Object.keys(SUMMARY)) {
			const name = `${EAE['indexes'][k]['name']} (${label})`;
			columns.push(name);
			data.push(SUMMARY[k][type]['amounts'].map(x => Math.round(x)));
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

export async function export_all() {
	let cancelled = false;

	const update = (progress) => loading("Generating...", {
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
	const index_name = EAE['indexes'][type]['name'].toLowerCase().replace(/\s+/g, '-');

	let pptx_blob, tiff_blob, high_priority_csv, share_csv;
	try {
		[pptx_blob, tiff_blob, high_priority_csv, share_csv] = await Promise.all([
			pptx().then(p => p.write('blob')),
			analysis(type).then(a => a.tiff),
			generate_high_priority_areas_csv(get_locations_results(), {
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
	zip.file(export_filename(`${index_name}-map`, 'tif', { "timestamp": false }), tiff_blob);
	zip.file(export_filename(`${index_name}-high-priority-areas`, 'csv', { "timestamp": false }), high_priority_csv);
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

export function show_export_modal() {
	const content = tmpl('#export-options-modal-content');

	bind(content, {
		"export_ppt": async function() {
			loading("Generating...");

			await delay(0.1);
			await generate_summary_data();
			const p = await pptx();
			p.writeFile({ "filename": export_filename('summary', 'pptx') });

			loading(false);
		},
		"export_tiff": async () => {
			loading("Generating...");
			const type = STATE.index;
			const index_name = EAE['indexes'][type]['name'].toLowerCase().replace(/\s+/g, '-');
			fake_blob_download((await analysis(type)).tiff, export_filename(`${index_name}-map`, 'tif'));
			loading(false);
		},
		"export_csv":       () => download_high_priority_areas(get_locations_results()),
		"export_share_csv": async () => {
			loading("Generating...");
			await generate_summary_data();
			download_share_csv();
			loading(false);
		},
	});

	const footer = tmpl('#export-options-modal-footer');
	bind(footer, {
		"export_all": () => export_all(),
	});

	const header = ce('span', 'Export options', { "class": 'modal-title' });

	new modal({
		"id":      'export-options-modal',
		"header":  header,
		"content": content,
		"footer":  footer,
		"destroy": true,
	}).show();
}

export async function download_high_priority_areas(results) {
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

async function generate_high_priority_areas_csv(results, opts = {}) {
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
