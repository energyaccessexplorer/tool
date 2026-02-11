import {
	coords_search_pois as mapbox_coords_search_pois,
	fit as mapbox_fit,
	get_admin_area_item,
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

function view_all_locations() {
	show_modal_table(paginationState.allResults);
}

function download_locations_data() {
	download_high_priority_areas(paginationState.allResults);
}

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

function get_map_position(coords) {
	const maparea = qs('#maparea');
	const {x, y} = MAPBOX.project(coords);
	const box = maparea.getBoundingClientRect();

	return {
		"x":      box.x + x,
		"y":      box.y + y,
		"lngLat": {"lng": coords[0], "lat": coords[1]},
	};
}

function show_info_on_hover(p) {
	show_location_info(p.c, get_map_position(p.c), false);
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
	el.onclick = zoom.bind(null, p, () => show_location_info(p.c, get_map_position(p.c), true));

	const locationName = qs('.location-name', el);
	mapbox_coords_search_pois({ "coords": p.c, "limit": 1 })
		.then(r => locationName.textContent = maybe(r, 0, 'name') || 'Unknown location');

	return template;
};

function get_admin_area_position(item) {
	const bounds = geojsonExtent(item.feature);
	const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
	return get_map_position(center);
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

export function get_locations_results() {
	return paginationState.allResults;
}

export function init() {
	const analysis_locations = tmpl('#analysis-locations-template');
	bind(analysis_locations, { download_locations_data, view_all_locations });
	qs('#analysis-locations').replaceWith(analysis_locations);

	const section = qs('#right-panel #analysis-locations-section');
	setup_about_button(section, `Showing ${format_area_type(STATE.variant)} with the highest prioritization scores based on your analysis criteria.`);

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
