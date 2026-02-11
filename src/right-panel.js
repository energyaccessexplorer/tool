import {
	svg_pie,
	copy_to_clipboard,
} from './utils.js';

import {
	show_export_modal,
} from './export.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import summary_analyse from './summary.js';

import bubblemessage from '../lib/bubblemessage.js';

import {
	init as analysis_locations_panel_init,
	update as analysis_locations_panel_update,
	download_locations_data,
	view_all_locations,
} from './right-panel-high-priority-areas.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

import {
	analysis_colorscale,
} from './analysis.js';

import {
	snapshot,
} from  './session.js';

import {
	ce,
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

const user_id = user_extract('id');

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

export function update_analysis_buttons(hasData) {
	const saveButton = qs('#save-snapshot-button');
	const shareButton = qs('#share-snapshot-button');
	const downloadButton = qs('#tiff-download');

	if (saveButton) saveButton.disabled = !hasData;
	if (shareButton) shareButton.disabled = !hasData;
	if (downloadButton) downloadButton.disabled = !hasData;
}

export function update_analysis_state(hasValidGraphs) {
	const blankState = qs('#analysis-blank-state');
	const sectionsWrapper = qs('#analysis-sections-wrapper');

	blankState.style.display = hasValidGraphs ? 'none' : 'flex';
	sectionsWrapper.style.display = hasValidGraphs ? 'flex' : 'none';
}


export async function graphs(raster) {
	const t = await summary_analyse(raster);
	const e = (1000/GEOGRAPHY.resolution)**2;
	const indexName = EAE['indexes'][STATE.index]['name'].toLowerCase();

	const hasPopulation = process_graph(t, {
		"dataKey":     'population-density',
		"pieKey":      'population',
		"selector":    '#population-number',
		"unit":        'people',
		"calcTotal":   (data) => Math.round(data['total'] / e),
		"description": (total, high) => [
			`Showing ${indexName} for areas affecting `,
			ce('strong', total.toLocaleString() + ' people'),
			', of whom ',
			ce('strong', high.toLocaleString() + ' people'),
			` are situated in areas of high ${indexName}.`,
		],
	});

	const hasArea = process_graph(t, {
		"dataKey":     'area',
		"pieKey":      'area',
		"selector":    '#area-number',
		"unit":        'km²',
		"calcTotal":   (data) => Math.round(data['total'] * e),
		"description": (total, high) => [
			`Showing ${indexName} for areas spanning `,
			ce('strong', total.toLocaleString() + ' km²'),
			', of which ',
			ce('strong', high.toLocaleString() + ' km²'),
			` has high ${indexName}.`,
		],
	});

	const hasValidData = hasPopulation || hasArea;
	update_analysis_state(hasValidData);
	update_analysis_buttons(hasValidData);

	analysis_locations_panel_update();
};

function process_graph(analysis_summary, config) {
	const data = maybe(analysis_summary, config.dataKey);

	if (!data) {
		const el = qs(config.selector);
		if (el) el.closest('.index-graphs-group').remove();
		return false;
	}

	const total = config.calcTotal(data);
	if (isNaN(total) || total <= 0) return false;

	data['distribution'].forEach((x, i) => PIES[config.pieKey]['data'][i].push(x));
	PIES[config.pieKey].change(1);

	const high = Math.round(data['distribution'][4] * total);

	const description = document.createDocumentFragment();
	description.append(...config.description(total, high));

	const section = qs(config.selector).closest('.index-graphs-section');
	update_graph_section(section, data['distribution'], total, config.unit, description);

	data['distribution'].forEach((_, i) => PIES[config.pieKey]['data'][i].shift());

	return true;
}

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

	const area_section = create_graph_section('Area share', 'area', 'area-number', 'area-description');
	const population_section = create_graph_section('Population share', 'population', 'population-number', 'population-description');

	setup_about_button(area_section, "Shows the 'Prioritization Index' results as area shares, based on your analysis criteria.");
	setup_about_button(population_section, "Shows the 'Prioritization Index' results as population shares, based on your analysis criteria.");

	qs('#analysis-sections-wrapper').append(area_section);
	qs('#analysis-sections-wrapper').append(population_section);

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


export function updated_plot(_type, _index) {
};
