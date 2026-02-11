import { copy_to_clipboard } from './utils.js';
import { show_export_modal } from './export.js';

import {
	init as graphs_init,
	graphs as render_graphs,
} from './right-panel-graphs.js';

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
	snapshot,
} from  './session.js';

import summary_analyse from './summary.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import {
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

const user_id = user_extract('id');

export function update_analysis(hasData) {
	const saveButton = qs('#save-snapshot-button');
	const shareButton = qs('#share-snapshot-button');
	const downloadButton = qs('#tiff-download');

	if (saveButton) saveButton.disabled = !hasData;
	if (shareButton) shareButton.disabled = !hasData;
	if (downloadButton) downloadButton.disabled = !hasData;

	const blankState = qs('#analysis-blank-state');
	const sectionsWrapper = qs('#analysis-sections-wrapper');

	blankState.style.display = hasData ? 'none' : 'flex';
	sectionsWrapper.style.display = hasData ? 'flex' : 'none';
}

export async function graphs(raster) {
	const summary = await summary_analyse(raster);

	const has_population = maybe(summary, 'population-density', 'total') > 0;
	const has_area = maybe(summary, 'area', 'total') > 0;
	update_analysis(has_population || has_area);

	render_graphs(summary);
	analysis_locations_panel_update();
};

export function init() {
	const snap = qs('#save-snapshot-button');
	snap.onclick = _ => { snapshot(); };

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

	graphs_init();

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
