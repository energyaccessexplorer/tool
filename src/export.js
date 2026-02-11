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
	pptx_blob as report_pptx_blob,
	pptx_download as report_pptx_download,
} from './report.js';

import {
	analysis,
} from './analysis.js';

import {
	download_locations_data,
	get_locations_results,
} from './analysis-search.js';

import {
	generate_csv_content as generate_high_priority_csv,
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
			report_pptx_blob(),
			analysis(type).then(a => a.tiff),
			generate_high_priority_csv(get_locations_results(), {
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
			await report_pptx_download();

			loading(false);
		},
		"export_tiff": async () => {
			loading("Generating...");
			const type = STATE.index;
			const index_name = EAE['indexes'][type]['name'].toLowerCase().replace(/\s+/g, '-');
			fake_blob_download((await analysis(type)).tiff, export_filename(`${index_name}-map`, 'tif'));
			loading(false);
		},
		"export_csv":       () => download_locations_data(),
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
