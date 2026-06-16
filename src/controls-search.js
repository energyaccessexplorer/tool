import DS from './ds.js';

import {
	elem_collapse,
} from './utils.js';

import { t } from './translate.js';

import {
	ce,
	maybe,
	qs,
	qsa,
} from '../lib/helpers.js';

const contents_el = qs('#controls-contents');

const tabs_el = qs('#controls-tabs');

let input;

function openall() {
	input.dispatchEvent(new Event('input'));

	select_tab(qs('#controls-tab-all'), "all");
	for (const container of qsa('.controls-container')) {
		const subbranch = container.closest('.controls-subbranch');
		if (subbranch) {
			elem_collapse(container, subbranch, "open");
		}
	}
};

function sort_datasets() {
	const sort_datasets = GEOGRAPHY.configuration.sort_datasets || GEOGRAPHY.parent_sort_datasets;
	const sort_branches = GEOGRAPHY.configuration.sort_branches || GEOGRAPHY.parent_sort_branches;
	const sort_subbranches = GEOGRAPHY.configuration.sort_subbranches || GEOGRAPHY.parent_sort_subbranches;

	const controls_elements = qsa('ds-controls', contents_el);

	if (maybe(sort_datasets, 'length'))
		for (const id of sort_datasets.slice(0).reverse()) {
			for (const el of controls_elements) {
				if (el.ds.id === id)
					el.closest('.controls-container').prepend(el);
			}
		}

	const subbranches_elements = qsa('.controls-subbranch', contents_el);

	if (maybe(sort_subbranches, 'length'))
		for (const subbranch of sort_subbranches.slice(0).reverse()) {
			for (const el of subbranches_elements) {
				if (el.id === 'controls-subbranch-' + subbranch) el.closest('.controls-branch').prepend(el);
			}
		}

	const branches_elements = qsa('.controls-branch', contents_el);

	if (maybe(sort_branches, 'length'))
		for (const branch of sort_branches.slice(0).reverse()) {
			for (const el of branches_elements) {
				if (el.id === 'controls-branch-' + branch) {
					qs('#controls-contents').prepend(el);

					const t = qs('#controls-tab-' + branch);
					if (t) qs('#controls-tabs').prepend(t);
					else console.warn("nope...");
				}
			}
		}
};

export function select_tab(tab, name) {
	for (const e of qsa('.controls-branch-tab', tabs_el))
		e.classList.remove('active');

	for (const e of qsa('.controls-branch', contents_el))
		e.style.display = name === 'all' ? '' : 'none';

	if (tab) tab.classList.add('active');
	else console.error("select_tab: could not find tab named", name);

	const b = qs('#controls-branch-' + name, contents_el);
	if (b) b.style.display = 'block';
};

async function trigger(filterRegex) {
	const { translateDatasetName } = await import('./translate.js');
	const subbranches = qsa('.controls-subbranch');

	// Show all subbranches initially
	for (const sb of subbranches) {
		qs('.controls-subbranch-title', sb).style.display = '';
	}

	// Filter datasets by translated name or id
	const filtered = DS.array.filter(d => {
		if (d.disabled) return false;
		const translatedName = translateDatasetName(window.LOCALE, d);
		const searchText = d.id + ";" + translatedName;
		return searchText.match(filterRegex);
	});

	// Hide/show dataset controls based on filter
	DS.array
		.filter(d => d.controls)
		.forEach(d => d.controls.style.display = filtered.indexOf(d) > -1 ? '' : 'none');

	// Hide subbranches if all their datasets are hidden
	for (const sb of subbranches) {
		const container = qs('.controls-container', sb);
		if (Array.from(qsa('ds-controls', container)).every(d => d.style.display === 'none')) {
			qs('.controls-subbranch-title', sb).style.display = 'none';
		}
	}
};

export function init() {
	const panel = qs('#controls.search-panel');
	input = ce('input', null, { "id": 'controls-search', "autocomplete": 'off', "class": 'search-input' });
	input.setAttribute('placeholder', t(window.LOCALE, 'left_panel.controls_search.placeholder'));
	input.dataset.tPlaceholder = 'left_panel.controls_search.placeholder';

	panel.prepend(input);

	input.onfocus = function(_) {
		openall();
	};

	input.oninput = function(_) {
		const r = new RegExp(this.value, 'i');
		trigger(r);
	};

	input.onkeypress = function(e) {
		if (e.key !== 'Enter') return;

		const c = Array.from(qsa('ds-controls', contents_el)).find(d => d.style.display !== 'none');

		if (c) c.ds.turn();
	};

	const tab_all = ce('div', t(window.LOCALE, 'controls.path.tab.all'), { "id": 'controls-tab-all', "class": 'controls-branch-tab up-title' });

	tabs_el.append(tab_all);

	tab_all.onclick = function() {
		for (const e of qsa('.controls-branch-tab', tabs_el))
			e.classList.remove('active');

		for (const e of qsa('.controls-branch', contents_el))
			e.style.display = '';

		tab_all.classList.add('active');
	};

	sort_datasets(GEOGRAPHY.configuration);

	const first = qs('.controls-branch-tab', tabs_el);
	select_tab(first, first.id.replace('controls-tab-', ''));
};
