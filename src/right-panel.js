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
	layer_data_from_values,
	OUTLINE_TIER,
} from './right-panel-data-tab.js';

import {
	cell as data_tab_cell,
	actions as data_tab_actions,
} from './right-panel-data-state.js';

import {
	analysis_result,
} from './analysis.ts';

import {
	init as prioritization_tab_init,
} from './right-panel-prioritization-tab.js';

import {
	cell as prioritization_cell,
	actions as prioritization_actions,
} from './right-panel-prioritization-state.js';

import {
	clear as poi_clear,
} from './right-panel-poi-card.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import {
	qs,
	tmpl,
} from '../lib/helpers.js';

const user_id = user_extract('id');

export function loading_analysis(loading) {
	qs('#analysis-loading-state').style.display = loading ? 'flex' : 'none';
	qs('#analysis-sections-wrapper').style.display = 'none';
	qs('#analysis-blank-state').style.display = 'none';
	if (loading) {
		data_tab_actions.backToNational(data_tab_cell());
		prioritization_actions.backToNational(prioritization_cell());
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

	data_tab_actions.backToNational(data_tab_cell());
	prioritization_actions.backToNational(prioritization_cell());
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
	// The card aggregates come from the analysis cell (EAE-521) — the fake
	// "area 0" masks and their aggregate_layer_values() calls are gone.
	// OUTLINE_TIER is the Outline pseudo-division: its single area 0 is
	// exactly the analysed-area bucket the old analysis_mask fabricated —
	// only the cells that have a priority score (the cells whose range and
	// class selections the analysis kept), restricted to the geography
	// outline, same rule the export's priority columns use
	// (has_priority_score()) — so result.analysed.values carries the cards'
	// analysed-area figures. result.national.values is the same layers over
	// the whole geography with no analysis mask: the unfiltered figures the
	// Data cards compare the analysed-area values against (EAE-514). Both
	// are computed once in the cell and shared, because summary_analyse()
	// used to derive the very same aggregate for itself.
	let summary;
	try {
		const result = await analysis_result(STATE.index, OUTLINE_TIER);

		const layer_data = layer_data_from_values(result.analysed.values);
		const national_layer_data = layer_data_from_values(result.national.values);

		data_tab_actions.analysisCompleted(data_tab_cell(), layer_data, national_layer_data);

		// The summary keeps the analysis-window mask.
		summary = await summary_analyse(raster, national_layer_data);
	} catch (e) {
		// loading_analysis(true) in ds.js active() must always balance: a
		// rejected analysis must never strand the "Loading data layers"
		// spinner. Hide the loader, then let the error surface.
		update_analysis(false);
		throw e;
	}

	// The blank state follows the analysis, not the cards. Since EAE-502 the
	// summary covers the whole outline, so its area and population totals are
	// non-zero with no layer added — gating on them left the share cards on
	// screen for an analysis with nothing to prioritise. The analysis raster
	// still answers the question the blank state asks: run() leaves it at -1
	// wherever no layer feeds the index (and returns an all -1 raster for a
	// filters-only analysis, deliberately).
	update_analysis(raster.some(v => v !== -1));

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
	prioritization_tab_init();
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
