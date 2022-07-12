import DS from './ds.js';

import {
	toggle_ds,
} from './controls.js';

const contents_el = qs('#controls-contents');

const tabs_el = qs('#controls-tabs');

let input;

function openall() {
	input.dispatchEvent(new Event('input'));

	select_tab(qs('#controls-tab-all'), "all");
	for (let sb of qsa('.controls-container')) {
		elem_collapse(sb, sb.previousSibling, "open");
	}
};

function sort_datasets(config) {
	const {sort_datasets, sort_subbranches, sort_branches} = config;

	const controls_elements = qsa('ds-controls', contents_el);

	if (maybe(sort_datasets, 'length'))
		for (let id of sort_datasets.slice(0).reverse()) {
			for (let el of controls_elements) {
				if (el.ds.id === id)
					el.closest('.controls-container').prepend(el);
			}
		}

	const subbranches_elements = qsa('.controls-subbranch', contents_el);

	if (maybe(sort_subbranches, 'length'))
		for (let subbranch of sort_subbranches.slice(0).reverse()) {
			for (let el of subbranches_elements) {
				if (el.id === 'controls-subbranch-' + subbranch) el.closest('.controls-branch').prepend(el);
			}
		}

	const branches_elements = qsa('.controls-branch', contents_el);

	if (maybe(sort_branches, 'length'))
		for (let branch of sort_branches.slice(0).reverse()) {
			for (let el of branches_elements) {
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
	for (let e of qsa('.controls-branch-tab', tabs_el))
		e.classList.remove('active');

	for (let e of qsa('.controls-branch', contents_el)) {
		let all = (name === 'all');
		e.style.display = all ? '' : 'none';
	}

	tab.classList.add('active');

	const b = qs('#controls-branch-' + name, contents_el);
	if (b) b.style.display = 'block';
};

async function trigger(value) {
	const containers = qsa('.controls-container');

	for (let c of containers)
		c.previousSibling.style.display = '';

	const r = DS.array.filter(d => !d.disabled && (d.id + ";" + d.name).match(value));

	DS.array
		.filter(d => d.controls)
		.forEach(d => d.controls.style.display = r.indexOf(d) > -1 ? '' : 'none');

	for (let c of containers) {
		if (Array.from(qsa('ds-controls', c)).every(d => d.style.display === 'none'))
			c.previousSibling.style.display = 'none';
	}
};

export function init() {
	const panel = qs('#controls.search-panel');
	input = ce('input', null, { "id": 'controls-search', "autocomplete": 'off', "class": 'search-input' });
	input.setAttribute('placeholder', 'Filter datasets');

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

		if (c) toggle_ds.call(c.ds);
	};

	const tab_all = ce('div', "all", { "id": 'controls-tab-all', "class": 'controls-branch-tab up-title' });

	tabs_el.append(tab_all);

	tab_all.onclick = function() {
		for (let e of qsa('.controls-branch-tab', tabs_el))
			e.classList.remove('active');

		for (let e of qsa('.controls-branch', contents_el))
			e.style.display = '';

		tab_all.classList.add('active');
	};

	sort_datasets(GEOGRAPHY.configuration);

	const first = qs('.controls-branch-tab', tabs_el);
	select_tab(first, first.id.replace('controls-tab-', ''));
};
