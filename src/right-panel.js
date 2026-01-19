import {
	svg_pie,
	copy_to_clipboard,
} from './utils.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import summary_analyse from './summary.js';

import bubblemessage from '../lib/bubblemessage.js';

import {
	init as analysis_locations_panel_init,
	update as analysis_locations_panel_update,
	download_locations_data,
	view_all_locations,
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
	ce,
	fake_blob_download,
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

const PIES = {};

const bubble = (v,e) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

function update_graph_section(section, distribution, total, unit, description) {
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

	const descEl = qs('.section-description', section);
	descEl.innerHTML = '';
	descEl.append(description);
}

function create_graph_section(title, type, numberId, descId) {
	const section = tmpl('#index-graph-section-template');
	qs('[slot="title"]', section).textContent = title;
	qs('.index-graphs-group', section).id = numberId;
	qs('.section-description', section).id = descId;
	qs('.index-graphs-group', section).append(PIES[type].svg);
	return section;
}

export async function graphs(raster) {
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

		const description = document.createDocumentFragment();
		description.append(
			'Showing energy access potential for areas affecting ',
			ce('strong', totalPop.toLocaleString() + ' people'),
			', of whom ',
			ce('strong', highPop.toLocaleString() + ' people'),
			' are situated in areas of high energy access potential.',
		);

		const section = qs('#population-number').closest('.index-graphs-section');

		update_graph_section(section, g['distribution'], totalPop, 'people', description);

		g['distribution'].forEach((x,i) => PIES['population']['data'][i].shift());

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

		const description = document.createDocumentFragment();
		description.append(
			'Showing energy access potential for areas spanning ',
			ce('strong', totalArea.toLocaleString() + ' km²'),
			', of which ',
			ce('strong', highArea.toLocaleString() + ' km²'),
			' has high energy access potential.',
		);

		const section = qs('#area-number').closest('.index-graphs-section');

		update_graph_section(section, g['distribution'], totalArea, 'km²', description);

		g['distribution'].forEach((x,i) => PIES['area']['data'][i].shift());

		if (!isNaN(totalArea) && totalArea > 0) hasValidData = true;
	} else {
		const an = qs('#area-number');
		if (an) an.closest('.index-graphs-group').remove();
	}

	analysis_locations_panel_update();

	const blankState = qs('#analysis-blank-state');
	const sectionsWrapper = qs('#analysis-sections-wrapper');
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

	const user_id = user_extract('id');

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
	download.onclick = async _ => {
		if (!user_id) {
			register_login();
			return;
		}

		const type = STATE.index;
		fake_blob_download((await analysis(type)).tiff, `energyaccessexplorer-${type}.tif`);
	};

	const areaSection = create_graph_section('Area share', 'area', 'area-number', 'area-description');
	const populationSection = create_graph_section('Population share', 'population', 'population-number', 'population-description');

	qs('#analysis-sections-wrapper').append(areaSection);
	qs('#analysis-sections-wrapper').append(populationSection);

	const analysis_locations = tmpl('#analysis-locations-template');
	bind(analysis_locations, { download_locations_data, view_all_locations });
	qs('#analysis-locations').replaceWith(analysis_locations);

	const panel = qs('#right-panel');
	const hideButton = qs('#right-panel-hide');
	const showButton = qs('#right-panel-show');

	hideButton.onclick = () => hide(panel, hideButton, showButton);
	showButton.onclick = () => show(panel, hideButton, showButton);

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

export function updated_plot(_type, _index) {
};

function hide(panel, hideButton, showButton) {
	panel.setAttribute('closed', '');
	const header = qs('#right-panel-header');
	header.style.display = 'none';
	showButton.style.display = 'flex';
}

function show(panel, hideButton, showButton) {
	panel.removeAttribute('closed');
	const header = qs('#right-panel-header');
	header.style.display = 'block';
	showButton.style.display = 'none';
};
