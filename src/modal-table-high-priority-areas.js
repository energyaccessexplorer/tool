import {
	download_high_priority_areas,
} from './export.js';

import {
	prepare_tabular_data,
	generate_rows,
	sort_results,
} from './area-analysis.js';

import modal from '../lib/modal.js';

import {
	qs,
	tmpl,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

export function show(results, opts = {}) {
	const data = prepare_tabular_data(results);
	if (!data) return;

	const { headers, is_raster, analysis_name, column_meta, selector_groups } = data;

	const selected_indices = new Set();

	function get_visible_headers() {
		return headers.filter(h => column_meta.get(h).visible);
	}

	function get_selected() {
		return selected_indices.size
			&& Array.from(selected_indices).map(i => state.results[i]);
	}

	const state = {
		"sort_column": headers[0],
		"sort_desc":   true,
		"results":     results,
		"page":        1,
		"per_page":    10,
		"sorting":     false,
	};

	function get_icon_class(header) {
		if (state.sort_column !== header) return "bi bi-chevron-expand";
		return state.sort_desc ? "bi bi-caret-down-fill" : "bi bi-caret-up-fill";
	}

	async function handle_sort(header) {
		if (state.sorting) return;
		state.sorting = true;

		const is_priority = header === headers[0] || header === analysis_name;

		if (state.sort_column === header) {
			state.sort_desc = !state.sort_desc;
		} else {
			state.sort_column = header;
			state.sort_desc = is_priority;
		}

		update_sort_icons();
		tbody.style.opacity = '0.5';
		tbody.style.pointerEvents = 'none';

		state.results = await sort_results(results, state.sort_column, state.sort_desc, is_raster, analysis_name);
		state.page = 1;

		tbody.style.opacity = '';
		tbody.style.pointerEvents = '';
		state.sorting = false;
		render_page();
	}

	const content = tmpl('#high-priority-areas-list-all-template');

	const tbody = qs('tbody', content);
	const selection_overlay = qs('.selection-overlay', content);
	const selection_count = qs('.selection-count', content);
	const select_all_checkbox = qs('.select-all-checkbox', content);
	const page_numbers_container = qs('.page-numbers', content);

	function render_headers() {
		const tr = tbody.closest('table').querySelector('thead tr');
		tr.querySelectorAll('th:not(.checkbox-column)').forEach(th => th.remove());

		for (const name of get_visible_headers()) {
			const th = tmpl('#column-header-template');
			bind(th, {
				"name":       name,
				"icon_class": get_icon_class(name),
				"on_sort":    () => handle_sort(name),
			});
			tr.append(th);
		}
	}

	function column_selector_grid() {
		const grid = document.createElement('div');
		grid.className = 'column-selector-columns';

		function make_item(header) {
			const meta = column_meta.get(header);
			const item = tmpl('#column-selector-item-template');
			bind(item, {
				"label":     meta.display || header,
				"checked":   meta.visible ? '' : false,
				"css_class": meta.subordinate ? 'column-selector-item subordinate' : 'column-selector-item',
				"on_toggle": function() {
					meta.visible = this.checked;
					render_headers();
					render_page();
				},
			});
			return item;
		}

		for (const group of selector_groups) {
			const wrapper = document.createElement('div');
			wrapper.className = group.children.length ? 'column-group has-children' : 'column-group';
			wrapper.append(make_item(group.header));
			for (const child of group.children) {
				wrapper.append(make_item(child));
			}
			grid.append(wrapper);
		}

		return grid;
	}

	bind(content, {
		"analysis-name":          analysis_name,
		"toggle_column_selector": function() {
			this.closest('.high-priority-areas-list-all-content').querySelector('.column-selector-panel').classList.toggle('hidden');
		},
		"on_prev":                () => go_to_page(state.page - 1),
		"on_next":                () => go_to_page(state.page + 1),
		"download_selected":      () => {
			const selected = Array.from(selected_indices).sort((a, b) => a - b).map(i => state.results[i]);
			download_high_priority_areas(selected, { "visible_headers": get_visible_headers() });
		},
		"on_uncheck_all":     () => uncheck_all(),
		"on_per_page_change": function() {
			state.per_page = parseInt(this.value, 10);
			state.page = 1;
			selected_indices.clear();
			update_selection_overlay();
			render_page();
		},
	});

	qs('.column-selector-panel', content).append(column_selector_grid());
	render_headers();

	const footer = tmpl('#high-priority-areas-list-all-footer-template');
	bind(footer, {
		"label":    opts.action_label,
		"download": () => opts.on_download(get_selected() || state.results, get_visible_headers()),
	});

	function update_selection_overlay() {
		const count = selected_indices.size;
		if (count > 0) {
			selection_overlay.classList.remove('hidden');
			select_all_checkbox.classList.remove('hidden');
			selection_count.textContent = `${count} row${count > 1 ? 's' : ''} currently selected.`;
		} else {
			selection_overlay.classList.add('hidden');
			select_all_checkbox.classList.add('hidden');
		}
	}

	function uncheck_all() {
		selected_indices.clear();
		tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
		select_all_checkbox.checked = false;
		update_selection_overlay();
	}

	function update_sort_icons() {
		const visible = get_visible_headers();
		document.querySelectorAll('.high-priority-areas-list-all-table th:not(.checkbox-column)').forEach((th, i) => {
			const icon = th.querySelector('.sort-icon i');
			if (icon) icon.className = get_icon_class(visible[i]);
		});
	}

	function get_page_numbers() {
		const total = Math.ceil(state.results.length / state.per_page);
		const current = state.page;
		const delta = 1;
		const pages = [];
		const middle = Math.ceil(total / 2);

		if (total <= 7) {
			return Array.from({ "length": total }, (_, i) => i + 1);
		}

		pages.push(1);

		const range_start = Math.max(2, current - delta);
		const range_end = Math.min(total - 1, current + delta);
		const near_start = current <= delta + 2;
		const near_end = current >= total - delta - 1;

		if (near_start) {
			for (let i = 2; i <= delta + 2; i++) pages.push(i);
			pages.push('...');
			pages.push(middle);
			pages.push('...');
		} else if (near_end) {
			pages.push('...');
			pages.push(middle);
			pages.push('...');
			for (let i = total - delta - 1; i <= total - 1; i++) pages.push(i);
		} else {
			if (range_start > 2) {
				pages.push('...');
			} else if (range_start === 2) {
				pages.push(2);
			}

			for (let i = range_start; i <= range_end; i++) {
				if (i > 1 && i < total && !pages.includes(i)) {
					pages.push(i);
				}
			}

			if (range_end < total - 1) {
				pages.push('...');
			} else if (range_end === total - 1 && !pages.includes(total - 1)) {
				pages.push(total - 1);
			}
		}

		pages.push(total);

		return pages;
	}

	function render_pagination() {
		const pages = get_page_numbers();

		page_numbers_container.innerHTML = '';
		for (const p of pages) {
			if (p === '...') {
				page_numbers_container.append(tmpl('#page-ellipsis-template'));
			} else {
				const item = tmpl('#page-number-template');
				bind(item, {
					"value":    p,
					"on_click": () => go_to_page(p),
				});
				if (p === state.page) item.firstElementChild.classList.add('active');
				page_numbers_container.append(item);
			}
		}
	}

	function render_page() {
		tbody.innerHTML = '';
		const start = (state.page - 1) * state.per_page;

		for (const row_data of generate_rows(state.results, is_raster, analysis_name, start, state.per_page)) {
			const row_index = start + tbody.children.length;
			const row = tmpl('#high-priority-areas-row-template');
			const is_selected = selected_indices.has(row_index);

			bind(row, {
				"cells":     get_visible_headers().map(header => {
					const raw = row_data[header];
					const value = typeof raw === 'number' ? raw.toLocaleString() : (raw || '');
					return { value };
				}),
				"on_select": function() {
					if (this.checked) {
						selected_indices.add(row_index);
					} else {
						selected_indices.delete(row_index);
					}
					update_selection_overlay();
				},
			});

			if (is_selected) {
				row.querySelector('input[type="checkbox"]').checked = true;
			}

			tbody.append(row);
		}

		render_pagination();
	}

	function go_to_page(page) {
		const total = Math.ceil(state.results.length / state.per_page);
		if (page < 1 || page > total) return;
		state.page = page;
		render_page();
	}

	render_page();

	const header = tmpl('#modal-header-template');
	bind(header, {
		"title":    opts.title,
		"subtitle": opts.subtitle,
	});

	const m = new modal({
		"id":      'high-priority-areas-list-all',
		"header":  header,
		"content": content,
		"footer":  footer,
		"destroy": true,
	});

	m.show();
}
