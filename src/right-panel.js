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

import {
	start as pulse_start,
	stop as pulse_stop,
} from './map-pulse.js';

import {
	busy as loading_busy,
	cell as loading_cell,
	subscribe as loading_subscribe,
} from './loading-state.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import {
	qs,
	tmpl,
} from '../lib/helpers.js';

const user_id = user_extract('id');

let has_data = false;
let was_busy = false;

// The panel's whole visible state is a function of (busy, has_data, active
// tab, active layers); nothing else may toggle these elements.
function render() {
	const busy = loading_busy(loading_cell().state);

	if (busy && !was_busy) reset_selection();
	was_busy = busy;

	// The outline alone leaves the analysis nothing to sweep over.
	if (busy && STATE.datasets.some(d => d !== OUTLINE)) pulse_start();
	else pulse_stop();

	const idle_with_data = !busy && has_data;

	// While a recompute runs, results already on screen stay, dimmed and
	// inert, instead of giving way to the spinner.
	const stale = busy && has_data;

	for (const id of ['#save-snapshot-button', '#share-snapshot-button', '#export-button']) {
		const button = qs(id);
		if (button) button.disabled = !idle_with_data;
	}

	qs('#right-panel-content').classList.toggle('stale', stale);

	qs('#analysis-loading-state').style.display = (busy && !has_data) ? 'flex' : 'none';
	qs('#analysis-blank-state').style.display = (!busy && !has_data) ? 'flex' : 'none';
	qs('#analysis-sections-wrapper').style.display = has_data ? 'flex' : 'none';

	const active_tab = qs('#right-panel-tabs .right-panel-tab.active');
	const shown = ((!busy || has_data) && active_tab) ? `right-panel-tab-${active_tab.dataset.tab}` : null;

	document.querySelectorAll('.right-panel-tab-panel').forEach(p => { p.hidden = p.id !== shown; });
}

function reset_selection() {
	data_tab_actions.backToNational(data_tab_cell());
	prioritization_actions.backToNational(prioritization_cell());
	poi_clear();
}

export function update_analysis(data) {
	has_data = data;

	reset_selection();
	render();
}

export async function graphs(raster) {
	// The outline alone gives the panel nothing but its blank state, and the
	// summary would download the population raster to fill hidden cards.
	if (STATE.datasets.every(d => d === OUTLINE)) {
		data_tab_actions.analysisCompleted(data_tab_cell(), {}, {});
		update_analysis(false);
		return;
	}

	// Card aggregates come from the analysis cell: OUTLINE_TIER's area 0 is the
	// has_priority_score() analysed-area bucket, result.national.values the same
	// layers over the whole geography with no analysis mask.
	let summary;
	try {
		const result = await analysis_result(STATE.index, OUTLINE_TIER);

		const layer_data = layer_data_from_values(result.analysed.values);
		const national_layer_data = layer_data_from_values(result.national.values);

		data_tab_actions.analysisCompleted(data_tab_cell(), layer_data, national_layer_data);

		// The summary keeps the analysis-window mask.
		summary = await summary_analyse(raster, national_layer_data);
	} catch (e) {
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

			render();
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

	loading_subscribe(render);
	render();
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
