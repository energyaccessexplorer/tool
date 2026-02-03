import {
	svg_pie,
	copy_to_clipboard,
	loading,
	export_filename,
} from './utils.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import summary_analyse, { generate_summary_data } from './summary.js';

import bubblemessage from '../lib/bubblemessage.js';

import {
	init as analysis_locations_panel_init,
	update as analysis_locations_panel_update,
	download_locations_data,
	view_all_locations,
	get_locations_results,
} from './analysis-search.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

import {
	analysis,
	analysis_colorscale,
} from './analysis.js';

import {
	snapshot,
} from  './session.js';

import {
	pptx_blob as report_pptx_blob,
	pptx_download as report_pptx_download,
} from './report.js';

import {
	generate_csv_content as generate_high_priority_csv,
} from './high-priority-areas.js';

import {
	ce,
	delay,
	fake_blob_download,
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

const user_id = user_extract('id');

const PIES = {};

const bubble = (v,e) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

function update_graph_section(section, distribution, total, unit) {
	const labels = ['Low', 'Low - medium', 'Medium', 'Medium - high', 'High'];

	const scale = ce('dl', null, { "class": 'discrete-scale' });

	analysis_colorscale.stops.slice().reverse().map((color, i) => {
		const idx = analysis_colorscale.stops.length - 1 - i;
		const count = Math.round(distribution[idx] * total);
		const value = `${count.toLocaleString()} ${unit}`;

		const item = tmpl('#discrete-scale-item-template');
		bind(item, {
			"color": function(el) { el.style.backgroundColor = color; },
			"label": labels[idx],
			"value": value,
		});

		scale.append(item);
	});

	const scale_container = qs('.index-graphs-scale-container', section);
	scale_container.innerHTML = '';
	scale_container.append(scale);
}

function create_graph_section(title, type, numberId) {
	const section = tmpl('#index-graph-section-template');
	qs('[slot="title"]', section).textContent = title;
	qs('.index-graphs-group', section).id = numberId;
	qs('.index-graphs-group', section).append(PIES[type].svg);
	return section;
}

function setup_about_button(section, about) {
	let bubble = null;
	const aboutButton = qs('.button-about', section);

	aboutButton.onmouseenter = () => {
		bubble = new bubblemessage({
			"message":  about,
			"position": 'W',
			"close":    false,
		}, aboutButton);
	};

	aboutButton.onmouseleave = () => {
		if (bubble) {
			bubble.remove();
			bubble = null;
		}
	};
}

export function show_loading_state() {
	const blankState = qs('#analysis-blank-state');
	const sectionsWrapper = qs('#analysis-sections-wrapper');

	blankState.style.display = 'flex';
	sectionsWrapper.style.display = 'none';
}

export async function graphs(raster) {
	const blankState = qs('#analysis-blank-state');
	const sectionsWrapper = qs('#analysis-sections-wrapper');

	const t = await summary_analyse(raster);

	const e = (1000/GEOGRAPHY.resolution)**2;

	const outline_raster = DST.get('outline').raster;
	const outline_cover = outline_raster.data.filter(x => x != outline_raster.nodata).length;
	const f = GEOGRAPHY.area ? (GEOGRAPHY.area / outline_cover) : (1/e);

	let hasValidData = false;

	let g = maybe(t, 'population-density'); if (g) {
		g['distribution'].forEach((x,i) => PIES['population']['data'][i].push(x));

		PIES['population'].change(1);

		const totalPop = Math.round(g['total'] / e);
		const highPop = Math.round(g['distribution'][4] * totalPop);
		const about = `Showing energy access potential for areas affecting ${totalPop.toLocaleString()} people, of whom ${highPop.toLocaleString()} people are situated in areas of high energy access potential.`;

		const section = qs('#population-number').closest('.index-graphs-section');

		update_graph_section(section, g['distribution'], totalPop, 'people');
		setup_about_button(section, about);

		g['distribution'].forEach((_,i) => PIES['population']['data'][i].shift());

		if (!isNaN(totalPop) && totalPop > 0) hasValidData = true;
	} else {
		const pn = qs('#population-number');
		if (pn) pn.closest('.index-graphs-group').remove();
	}

	g = maybe(t, 'area'); if (g) {
		g['distribution'].forEach((x,i) => PIES['area']['data'][i].push(x));

		PIES['area'].change(1);

		const totalArea = Math.round(g['total'] * f);
		const highArea = Math.round(g['distribution'][4] * totalArea);
		const about = `Showing energy access potential for areas spanning ${totalArea.toLocaleString()} km², of which ${highArea.toLocaleString()} km² has high energy access potential.`;

		const section = qs('#area-number').closest('.index-graphs-section');

		update_graph_section(section, g['distribution'], totalArea, 'km²');
		setup_about_button(section, about);

		g['distribution'].forEach((_,i) => PIES['area']['data'][i].shift());

		if (!isNaN(totalArea) && totalArea > 0) hasValidData = true;
	} else {
		const an = qs('#area-number');
		if (an) an.closest('.index-graphs-group').remove();
	}

	analysis_locations_panel_update();

	const saveButton = qs('#save-snapshot-button');
	const shareButton = qs('#share-snapshot-button');
	const downloadButton = qs('#tiff-download');

	if (hasValidData) {
		blankState.style.display = 'none';
		sectionsWrapper.style.display = 'flex';
		if (saveButton) saveButton.disabled = false;
		if (shareButton) shareButton.disabled = false;
		if (downloadButton) downloadButton.disabled = false;
	} else {
		blankState.style.display = 'flex';
		sectionsWrapper.style.display = 'none';
		if (saveButton) saveButton.disabled = true;
		if (shareButton) shareButton.disabled = true;
		if (downloadButton) downloadButton.disabled = true;
	}
};

export function init() {
	PIES["population"] = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);
	PIES["area"]       = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);

	const snap = qs('#save-snapshot-button');
	snap.onclick = _ => {
		snapshot();
	};

	const share = qs('#share-snapshot-button');
	share.onclick = _ => {
		const u = new URL(location);

		if (u.searchParams.get('snapshot')) {
			share_url();
			return;
		}

		snapshot(share_url);
	};

	const download = qs('#tiff-download');
	download.onclick = _ => {
		if (!user_id) {
			register_login();
			return;
		}

		show_export_modal();
	};

	const areaSection = create_graph_section('Area share', 'area', 'area-number');
	const populationSection = create_graph_section('Population share', 'population', 'population-number');

	qs('#analysis-sections-wrapper').append(areaSection);
	qs('#analysis-sections-wrapper').append(populationSection);

	const analysis_locations = tmpl('#analysis-locations-template');
	bind(analysis_locations, { download_locations_data, view_all_locations });
	qs('#analysis-locations').replaceWith(analysis_locations);

	const panel = qs('#right-panel');
	const header = qs('#right-panel-header');
	const hideButton = qs('#right-panel-hide');
	const showButton = qs('#right-panel-show');

	hideButton.onclick = () => {
		panel.setAttribute('closed', '');
		header.style.display = 'none';
		showButton.style.display = 'flex';
	};

	showButton.onclick = () => {
		panel.removeAttribute('closed');
		header.style.display = 'block';
		showButton.style.display = 'none';
	};

	analysis_locations_panel_init();
};

function share_url() {
	const c = tmpl('#share-link-modal-content');

	const u = new URL(location);
	const id = u.searchParams.get('snapshot');
	const url = `${u.protocol}//${u.hostname}${window.BASE}/tool/p?${id}`;

	bind(c, { url, "copy": function() { copy_to_clipboard(url, this); } });

	new modal({
		"id":      'share-link-modal',
		"header":  "Share link",
		"content": c,
		"destroy": true,
	}).show();
};

function generate_share_csv_content() {
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

function download_share_csv() {
	const csv = generate_share_csv_content();
	const blob = new Blob([csv], { "type": 'text/csv' });
	fake_blob_download(blob, export_filename('population-area-share', 'csv'));
}

async function export_all() {
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

	const [pptx_blob, tiff_blob, high_priority_csv, share_csv] = await Promise.all([
		report_pptx_blob(),
		analysis(type).then(a => a.tiff),
		generate_high_priority_csv(get_locations_results()),
		Promise.resolve(generate_share_csv_content()),
	]);

	if (cancelled) { loading(false); return; }
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

function show_export_modal() {
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
};

export function updated_plot(_type, _index) {
};
