import {
	download_high_priority_areas,
} from './export.js';

import {
	prepare_data,
	generate_rows,
	sort_results,
} from './area-analysis.js';

import modal from '../lib/modal.js';

import {
	qs,
	tmpl,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

export function show(results) {
	const data = prepare_data(results);
	if (!data) return;

	const { headers, is_raster, "area_type": area_type_str, analysis_name } = data;

	const selected_indices = new Set();

	const state = {
		"sort_column": headers[0],
		"sort_desc":   true,
		"results":     results,
		"page":        1,
		"per_page":    10,
	};

	function get_icon_class(header) {
		if (state.sort_column !== header) return "bi bi-chevron-expand";
		return state.sort_desc ? "bi bi-caret-down-fill" : "bi bi-caret-up-fill";
	}

	function handle_sort(header) {
		const is_priority = header === headers[0] || header === analysis_name;

		if (state.sort_column === header) {
			state.sort_desc = !state.sort_desc;
		} else {
			state.sort_column = header;
			state.sort_desc = is_priority;
		}

		state.results = sort_results(results, state.sort_column, state.sort_desc, is_raster, analysis_name);
		state.page = 1;
		render_page();
		update_sort_icons();
	}

	const content = tmpl('#high-priority-areas-list-all-template');

	const tbody = qs('tbody', content);
	const selection_overlay = qs('.selection-overlay', content);
	const selection_count = qs('.selection-count', content);
	const select_all_checkbox = qs('.select-all-checkbox', content);
	const page_numbers_container = qs('.page-numbers', content);

	bind(content, {
		"analysis-name": analysis_name,
		"headers":       headers.map(name => ({
			name,
			"on_sort": () => handle_sort(name),
		})),
		"on_prev":           () => go_to_page(state.page - 1),
		"on_next":           () => go_to_page(state.page + 1),
		"download_selected": () => {
			const selected = Array.from(selected_indices).sort((a, b) => a - b).map(i => state.results[i]);
			download_high_priority_areas(selected);
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

	const footer = tmpl('#high-priority-areas-list-all-footer-template');
	bind(footer, {
		"download": () => download_high_priority_areas(results),
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
		document.querySelectorAll('.high-priority-areas-list-all-table th:not(.checkbox-column)').forEach((th, i) => {
			const icon = th.querySelector('.sort-icon i');
			if (icon) icon.className = get_icon_class(headers[i]);
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
				"cells":     headers.map(header => ({ "value": row_data[header] || '' })),
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

	update_sort_icons();
	render_page();

	const header = tmpl('#modal-header-template');
	bind(header, {
		"title":    `High priority areas (${area_type_str})`,
		"subtitle": analysis_name,
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
