import {
	coords_search_pois as mapbox_coords_search_pois,
	fit as mapbox_fit,
	get_admin_area_item,
	get_map_position,
	show_admin_area_info,
	show_location_info,
} from './mapbox.js';

import {
	plot_active,
} from './analysis.js';

import {
	zoom,
} from './search.js';

import {
	download_high_priority_areas,
} from './export.js';

import {
	show as show_modal_table,
} from './modal-table-high-priority-areas.js';

import {
	precompute_rows,
	clear_row_cache,
} from './area-analysis.js';

import {
	setup_about_button,
} from './right-panel-graphs.js';

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
import { translateNode, t } from './translate.js';

function view_all_locations() {
	const area_type_str = area_type(STATE.variant);
	const analysis_name = EAE['indexes'][STATE.index]['name'];
	const results = paginationState.allResults;

	show_modal_table(results, {
		"title":              `${t(window.LOCALE, 'modal.export.high_priority.title')} (${area_type_str})`,
		"subtitle":           analysis_name,
		"action_label":       t(window.LOCALE, 'modal.export.download_csv'),
		"column_toggle_hint": t(window.LOCALE, 'modal.export.csv_hint'),
		on_download(results, visible_headers) {
			download_high_priority_areas(results, { visible_headers });
		},
	});
}


function format_area_type(variant) {
	const type = area_type(variant);
	if (variant === 'raster') {
		return t(window.LOCALE, 'right_panel.high_priority.raster_areas', { "area": type });
	} else {
		return type.toLowerCase();
	}
}

let _precompute_controller = null;  

const paginationState = {
	"allResults":   [],
	"currentPage":  1,
	"itemsPerPage": 10,
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
	el.onclick = zoom.bind(null, p, () => show_location_info(p.c, get_map_position(p.c), true));

	const locationName = qs('.location-name', el);
	mapbox_coords_search_pois({ "coords": p.c, "limit": 1 })
		.then(r => locationName.textContent = maybe(r, 0, 'name') || t(window.LOCALE, 'right_panel.high_priority.unknown_location'));

	return template;
};

function get_admin_area_position(item) {
	const bounds = geojsonExtent(item.feature);
	const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
	return get_map_position(center);
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
		el.onclick = () => show_admin_info_on_click(item);
	}

	return template;
};

function get_division_results(variant) {
	const division = GEOGRAPHY.divisions[variant];
	if (!division || !division.priorityData) return [];

	return Object.keys(division.priorityData)
		.filter(id => division.priorityData[id].average > 0)
		.map(id => get_admin_area_item(variant, id))
		.filter(item => item !== null)
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
		paginationInfo.textContent = t(window.LOCALE, totalCount === 1 ? 'right_panel.high_priority.showing_count_one' : 'right_panel.high_priority.showing_count_other', { "count": totalCount.toLocaleString(window.LOCALE) });
		return;
	}

	if (totalCount === 0) return;

	paginationInfo.textContent = t(window.LOCALE, 'right_panel.high_priority.showing_range', { "start": (startIdx + 1).toLocaleString(window.LOCALE), "end": endIdx.toLocaleString(window.LOCALE), "total": totalCount.toLocaleString(window.LOCALE) });

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
		const score_of = item => item.priority ? Math.round((item.priority).toFixed(2) * 100) : "";

		const scoreCounts = {};
		paginationState.allResults.forEach(item => {
			const score = score_of(item);
			scoreCounts[score] = (scoreCounts[score] || 0) + 1;
		});

		const groups = pageResults.reduce((acc, item) => {
			const score = score_of(item);
			(acc[score] ??= []).push(item);
			return acc;
		}, {});

		Object.entries(groups).sort(([a], [b]) => Number(b) - Number(a)).forEach(([score, items]) => {
			const template = tmpl('#location-group-template');
			const group = template.firstElementChild;
			group.setAttribute('data-score', score);

			const areaCount = t(window.LOCALE, scoreCounts[score] === 1 ? 'right_panel.high_priority.area_count_one' : 'right_panel.high_priority.area_count_other', { "count": scoreCounts[score] });
			bind(template, {
				"score-text": t(window.LOCALE, 'right_panel.high_priority.priority_score', { score }),
				"area-count": areaCount,
			});

			const groupList = qs('.location-group-list', group);
			items.forEach(item => groupList.append(raster_item(item)));

			ul.append(template);
		});
	} else {
		pageResults.forEach((item, i) => ul.append(admin_area_item(item, startIdx + i + 1)));
	}

	render_pagination();
}

export async function update() {
	if (_precompute_controller) _precompute_controller.abort();
	clear_row_cache();

	const section = qs('#right-panel #analysis-locations-section');
	if (!section) return;

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

	_precompute_controller = new AbortController();
	const analysis_name = EAE['indexes'][STATE.index]['name'];
	precompute_rows(paginationState.allResults, isRaster, analysis_name, _precompute_controller.signal);
};

export function get_locations_results() {
	return paginationState.allResults;
}

export function init() {
	const analysis_locations = tmpl('#analysis-locations-template');
	bind(analysis_locations, { view_all_locations });
	qs('#analysis-locations').replaceWith(analysis_locations);

	const section = qs('#right-panel #analysis-locations-section');
	translateNode(window.LOCALE, section);
	setup_about_button(section, () => t(window.LOCALE, 'right_panel.high_priority.about', { "area": format_area_type(STATE.variant) }));

};

async function all_points() {
	const a = await plot_active(STATE.index);

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
