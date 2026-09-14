import { copy_to_clipboard } from './utils.js';
import { show_export_modal } from './export.js';
import { t, translateNode } from './translate.js';

import {
	init as graphs_init,
	graphs as render_graphs,
} from './right-panel-graphs.js';

import {
	init as analysis_locations_panel_init,
	update as analysis_locations_panel_update,
} from './right-panel-high-priority-areas.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

import {
	snapshot,
} from  './session.js';

import summary_analyse from './summary.js';

import {
	init as data_tab_init,
	clear as data_tab_clear,
	set_analysis_layer_data,
} from './right-panel-data-tab.js';

import {
	aggregate_layer_values,
} from './analysis.js';

import {
	clear as prioritization_tab_clear,
	clear_location_summary,
} from './right-panel-prioritization-tab.js';

import {
	clear as poi_clear,
} from './right-panel-poi-card.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import {
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

const user_id = user_extract('id');

export function loading_analysis(loading) {
	qs('#analysis-loading-state').style.display = loading ? 'flex' : 'none';
	qs('#analysis-sections-wrapper').style.display = 'none';
	qs('#analysis-blank-state').style.display = 'none';
	if (loading) {
		data_tab_clear();
		prioritization_tab_clear();
		clear_location_summary();
		poi_clear();
		document.querySelectorAll('.right-panel-tab-panel').forEach(p => { p.hidden = true; });
	}
}

export function update_analysis(has_data) {
	const save_button = qs('#save-snapshot-button');
	const share_button = qs('#share-snapshot-button');
	const download_button = qs('#export-button');

	if (save_button) save_button.disabled = !has_data;
	if (share_button) share_button.disabled = !has_data;
	if (download_button) download_button.disabled = !has_data;

	qs('#analysis-loading-state').style.display = 'none';

	const blank_state = qs('#analysis-blank-state');
	const sections_wrapper = qs('#analysis-sections-wrapper');

	data_tab_clear();
	prioritization_tab_clear();
	clear_location_summary();
	poi_clear();
	blank_state.style.display = has_data ? 'none' : 'flex';
	sections_wrapper.style.display = has_data ? 'flex' : 'none';

	document.querySelectorAll('.right-panel-tab-panel').forEach(p => { p.hidden = true; });

	const active_tab = qs('#right-panel-tabs .right-panel-tab.active');
	if (active_tab) {
		const target = qs(`#right-panel-tab-${active_tab.dataset.tab}`);
		if (target) target.hidden = false;
	}
}

export async function graphs(raster) {
	// Cards aggregate every valid pixel of the geography outline — the same
	// per-pixel definition a selected-area card uses at any level.
	const outline_mask = { "raster": { "data": OUTLINE.raster.data.map(v => v === OUTLINE.raster.nodata ? -1 : 0) } };
	set_analysis_layer_data(await aggregate_layer_values(outline_mask));

	// The summary keeps the analysis-window mask.
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

	const download = qs('#export-button');
	download.onclick = _ => {
		if (!user_id) {
			register_login();
			return;
		}

		show_export_modal();
	};

	graphs_init();

	const tabs = document.querySelectorAll('#right-panel-tabs .right-panel-tab');
	tabs.forEach(tab => {
		tab.onclick = () => {
			tabs.forEach(t => {
				t.classList.remove('active');
				t.setAttribute('aria-selected', 'false');
			});
			tab.classList.add('active');
			tab.setAttribute('aria-selected', 'true');

			document.querySelectorAll('.right-panel-tab-panel').forEach(panel => {
				panel.hidden = true;
			});
			const target = qs(`#right-panel-tab-${tab.dataset.tab}`);
			if (target) target.hidden = false;
		};
	});

	const panel = qs('#right-panel');
	const header = qs('#right-panel-header');
	const hide_button = qs('#right-panel-hide');
	const show_button = qs('#right-panel-show');

	hide_button.onclick = () => {
		panel.setAttribute('closed', '');
		header.style.display = 'none';
		show_button.style.display = 'flex';
	};

	show_button.onclick = () => {
		panel.removeAttribute('closed');
		header.style.display = 'block';
		show_button.style.display = 'none';
	};

	analysis_locations_panel_init();
	data_tab_init();
};

function share_url() {
	const c = tmpl('#share-link-modal-content');
	translateNode(window.LOCALE, c);

	const u = new URL(location);
	const id = u.searchParams.get('snapshot');
	const url = `${u.protocol}//${u.hostname}${window.BASE}/tool/p?${id}`;

	bind(c, { url, "copy": function() { copy_to_clipboard(url, this); } });

	new modal({
		"id":      'share-link-modal',
		"header":  t(window.LOCALE, 'right_panel.share_link.header'),
		"content": c,
		"destroy": true,
	}).show();
};
