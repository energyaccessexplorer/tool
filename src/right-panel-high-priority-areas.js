import {
	coords_search_pois as mapbox_coords_search_pois,
	fit as mapbox_fit,
	show_admin_area_info,
	show_location_info,
} from './mapbox.js';

import {
	lowmedhigh_scale,
	plot_active,
} from './analysis.js';


import {
	pointto as search_pointto,
	zoom,
} from './search.js';

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
	area_type,
	raster_pixel_to_coordinates,
} from './utils.js';

import {
	ce,
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

import bubblemessage from '../lib/bubblemessage.js';

function format_area_type(variant) {
	const type = area_type(variant);
	if (variant === 'raster') {
		return `areas (${type})`;
	} else {
		return type.toLowerCase();
	}
}

const paginationState = {
	"allResults":   [],
	"currentPage":  1,
	"itemsPerPage": 10,
};

function pointto(p, centerPointer = false) {
	const dict = [[ "priority", EAE['indexes'][STATE.index]['name'] ]];
	const props = { "priority": lowmedhigh_scale(p.priority) };

	search_pointto(p.c, dict, props, centerPointer);
};

function show_info_on_hover(p) {
	const maparea = qs('#maparea');
	const {x, y} = MAPBOX.project(p.c);
	const box = maparea.getBoundingClientRect();

	const position = {
		"x":      box.x + x,
		"y":      box.y + y,
		"lngLat": {"lng": p.c[0], "lat": p.c[1]},
	};

	show_location_info(p.c, position, false);
};

function raster_item(p) {
	const pi3 = (p.c).map(c => +c.toFixed(3));
	const score = (p.priority ? Math.round((p.priority).toFixed(2) * 100) : "");

	const template = tmpl('#location-item-template');
	const el = template.firstElementChild;

	bind(template, {
		"location-name": "",
		"coordinates":   `[${pi3.join(", ")}]`,
	});

	el.setAttribute('data-score', score);
	el.onmouseenter = show_info_on_hover.bind(null, p);
	el.onclick = zoom.bind(null, p, pointto.bind(null, p, true));

	const locationName = qs('.location-name', el);
	mapbox_coords_search_pois({ "coords": p.c, "limit": 1 })
		.then(r => locationName.textContent = maybe(r, 0, 'name') || 'Unknown location');

	return template;
};

function get_admin_area_position(item) {
	const bounds = geojsonExtent(item.feature);
	const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];

	const maparea = qs('#maparea');
	const { x, y } = MAPBOX.project(center);
	const box = maparea.getBoundingClientRect();

	return {
		"x":      box.x + x,
		"y":      box.y + y,
		"lngLat": { "lng": center[0], "lat": center[1] },
	};
}

function show_admin_info_on_hover(item) {
	if (!item.feature) return;
	show_admin_area_info(item, get_admin_area_position(item), false);
}

function show_admin_info_on_click(item) {
	if (!item.feature) return;

	mapbox_fit(geojsonExtent(item.feature), true);

	MAPBOX.once('moveend', () => {
		show_admin_area_info(item, get_admin_area_position(item), true);
	});
}

function admin_area_item(item, rank) {
	const template = tmpl('#admin-area-item-template');
	const el = template.firstElementChild;

	bind(template, {
		"rank":          rank,
		"location-name": item.name,
	});

	if (item.feature) {
		el.onmouseenter = () => show_admin_info_on_hover(item);
		el.onclick = () => show_admin_info_on_click(item);
	}

	return template;
};

function get_division_results(variant) {
	const division = GEOGRAPHY.divisions[variant];
	if (!division || !division.priorityData || !division.vectors) return [];

	const features = division.vectors.data.features;
	const priorityData = division.priorityData;
	const nameTable = maybe(division, 'csv', 'table') || {};

	return Object.keys(priorityData)
		.filter(id => priorityData[id].average > 0)
		.map(id => {
			const feature = features.find(f => f.id === +id);
			const name = nameTable[id] || `Area ${id}`;

			return {
				"id":       +id,
				"priority": priorityData[id].average,
				"name":     name,
				"feature":  feature,
			};
		})
		.sort((a, b) => a.priority > b.priority ? -1 : 1);
};

function render_pagination() {
	const section = qs('#right-panel #analysis-locations-section');
	const resultscontainer = qs('.locations-paginated-list', section);
	let paginationContainer = qs('.pagination-container', resultscontainer);

	if (!paginationContainer) {
		const template = tmpl('#pagination-template');
		resultscontainer.append(template);
		paginationContainer = qs('.pagination-container', resultscontainer);
	}

	const paginationInfo = qs('.pagination-info', paginationContainer);
	const paginationDiv = qs('.pagination', paginationContainer);

	if (paginationInfo) paginationInfo.textContent = '';
	if (paginationDiv) paginationDiv.replaceChildren();

	const totalPages = Math.ceil(paginationState.allResults.length / paginationState.itemsPerPage);
	const totalCount = paginationState.allResults.length;
	const startIdx = (paginationState.currentPage - 1) * paginationState.itemsPerPage;
	const endIdx = Math.min(startIdx + paginationState.itemsPerPage, totalCount);

	if (!paginationInfo || !paginationDiv) return;

	if (totalPages <= 1 && totalCount > 0) {
		paginationInfo.textContent = `Showing ${totalCount.toLocaleString()} result${totalCount !== 1 ? 's' : ''}`;
		return;
	}

	if (totalCount === 0) return;

	paginationInfo.textContent = `Showing ${(startIdx + 1).toLocaleString()}-${endIdx.toLocaleString()} of ${totalCount.toLocaleString()}`;

	const prevBtn = ce('button', null, { "class": 'pagination-btn chevron' });
	prevBtn.innerHTML = '<i class="bi bi-chevron-left"></i>';
	prevBtn.disabled = paginationState.currentPage === 1;
	prevBtn.onclick = () => {
		if (paginationState.currentPage > 1) {
			paginationState.currentPage--;
			render_page(paginationState.currentPage);
		}
	};
	paginationDiv.append(prevBtn);

	let startPage = Math.max(1, paginationState.currentPage - 1);
	const endPage = Math.min(totalPages, startPage + 2);

	if (endPage - startPage < 2) {
		startPage = Math.max(1, endPage - 2);
	}

	for (let i = startPage; i <= endPage; i++) {
		const pageBtn = ce('button', String(i), { "class": 'pagination-btn page-number' });
		if (i === paginationState.currentPage) {
			pageBtn.classList.add('active');
		}
		pageBtn.onclick = () => {
			paginationState.currentPage = i;
			render_page(paginationState.currentPage);
		};
		paginationDiv.append(pageBtn);
	}

	const nextBtn = ce('button', null, { "class": 'pagination-btn chevron' });
	nextBtn.innerHTML = '<i class="bi bi-chevron-right"></i>';
	nextBtn.disabled = paginationState.currentPage === totalPages;
	nextBtn.onclick = () => {
		if (paginationState.currentPage < totalPages) {
			paginationState.currentPage++;
			render_page(paginationState.currentPage);
		}
	};
	paginationDiv.append(nextBtn);
}

function render_page(page) {
	const section = qs('#right-panel #analysis-locations-section');
	const resultscontainer = qs('.locations-paginated-list', section);
	let ul = qs('.locations-list', resultscontainer);

	if (!ul) {
		ul = ce('ul', null, { "class": 'locations-list' });
		resultscontainer.append(ul);
	} else {
		ul.replaceChildren();
	}

	const isRaster = STATE.variant === 'raster';
	const totalCount = paginationState.allResults.length;
	const startIdx = (page - 1) * paginationState.itemsPerPage;
	const endIdx = Math.min(startIdx + paginationState.itemsPerPage, totalCount);

	const pageResults = paginationState.allResults.slice(startIdx, endIdx);

	if (isRaster) {
		const scoreCounts = {};
		paginationState.allResults.forEach(item => {
			const score = item.priority ? Math.round((item.priority).toFixed(2) * 100) : "";
			scoreCounts[score] = (scoreCounts[score] || 0) + 1;
		});

		let currentScore = null;
		let currentGroupList = null;

		pageResults.forEach(item => {
			const score = item.priority ? Math.round((item.priority).toFixed(2) * 100) : "";
			const groupCount = scoreCounts[score];

			if (score !== currentScore) {
				currentScore = score;
				const template = tmpl('#location-group-template');
				const currentGroup = template.firstElementChild;

				currentGroup.setAttribute('data-score', score);

				const areaCount = groupCount === 1 ? '1 area' : `${groupCount} areas`;

				bind(template, {
					"score-text": `${score}% priority score`,
					"area-count": areaCount,
				});

				currentGroupList = qs('.location-group-list', currentGroup);

				ul.append(template);
			}

			currentGroupList.append(raster_item(item));
		});
	} else {
		pageResults.forEach((item, i) => ul.append(admin_area_item(item, startIdx + i + 1)));
	}

	render_pagination();
}

export async function update() {
	const section = qs('#right-panel #analysis-locations-section');
	const resultscontainer = qs('.locations-paginated-list', section);

	const ul = qs('.locations-list', resultscontainer);
	if (ul) ul.replaceChildren();

	const paginationContainer = qs('.pagination-container', resultscontainer);
	if (paginationContainer) paginationContainer.remove();

	const isRaster = STATE.variant === 'raster';
	const results = isRaster ? await all_points() : get_division_results(STATE.variant);

	paginationState.allResults = results.sort((a, b) => a.priority > b.priority ? -1 : 1);
	paginationState.currentPage = 1;

	const count = paginationState.allResults.length;

	if (count === 0) {
		section.setAttribute('collapsed', '');
		return;
	}

	render_page(paginationState.currentPage);
};

export function download_locations_data() {
	download_high_priority_areas(paginationState.allResults);
}

export function view_all_locations() {
	const results = paginationState.allResults;
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

export function get_locations_results() {
	return paginationState.allResults;
}

export function init() {
	const section = qs('#right-panel #analysis-locations-section');
	const aboutButton = qs('.button-about', section);

	let bubble = null;
	aboutButton.onmouseenter = () => {
		bubble = new bubblemessage({
			"message":  `Showing ${format_area_type(STATE.variant)} with the highest prioritization scores based on your analysis criteria.`,
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

};

async function all_points() {
	const a = await plot_active(STATE.index, false);

	const points = a.raster.reduce((t,v,i) => {
		if (v > 0) {
			t.push({i,v});
		}

		return t;
	}, []);

	return points
		.sort((a,b) => a.v > b.v ? -1 : 1)
		.map(t => ({ "priority": t.v, "i": t.i, "c": raster_pixel_to_coordinates(t.i) }));
};
