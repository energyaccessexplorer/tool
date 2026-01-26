import {
	coords_search_pois as mapbox_coords_search_pois,
	fit as mapbox_fit,
	show_admin_area_info,
	show_location_info,
} from './mapbox.js';

import {
	getallpoints,
	lowmedhigh_scale,
} from './analysis.js';

import {
	pointto as search_pointto,
	zoom,
} from './search.js';

import {
	download as high_priority_areas_download,
	view_all as high_priority_areas_view_all,
} from './high-priority-areas.js';

import {
	ce,
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

let ul, resultscontainer, section, paginationContainer, descriptionEl;

const paginationState = {
	"allResults":   [],
	"currentPage":  1,
	"itemsPerPage": 10,
};

function pointto(p, centerPointer = false) {
	const dict = [[ "v", EAE['indexes'][STATE.index]['name'] ]];
	const props = { "v": lowmedhigh_scale(p.v) };

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
	const score = (p.v ? Math.round((p.v).toFixed(2) * 100) : "");

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
				"id":      +id,
				"v":       priorityData[id].average,
				"name":    name,
				"feature": feature,
			};
		})
		.sort((a, b) => a.v > b.v ? -1 : 1);
};

function render_pagination() {
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
			const score = item.v ? Math.round((item.v).toFixed(2) * 100) : "";
			scoreCounts[score] = (scoreCounts[score] || 0) + 1;
		});

		let currentScore = null;
		let currentGroupList = null;

		pageResults.forEach(item => {
			const score = item.v ? Math.round((item.v).toFixed(2) * 100) : "";
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

async function trigger() {
	if (ul) ul.replaceChildren();
	if (paginationContainer) {
		paginationContainer.remove();
		paginationContainer = null;
	}

	const isRaster = STATE.variant === 'raster';
	const results = isRaster ? await getallpoints() : get_division_results(STATE.variant);

	paginationState.allResults = results.sort((a,b) => a.v > b.v ? -1 : 1);
	paginationState.currentPage = 1;

	const count = paginationState.allResults.length;

	if (count === 0) {
		if (section) section.setAttribute('collapsed', '');
		return;
	}

	if (descriptionEl) {
		const areaType = isRaster ? 'areas (1km²)' : (GEOGRAPHY.divisions[STATE.variant]?.name || 'areas');
		descriptionEl.textContent = `Showing ${areaType} with the highest prioritization scores based on your analysis criteria.`;
	}

	render_page(paginationState.currentPage);
};

export function update() {
	trigger();
};

export function download_locations_data(_, event) {
	high_priority_areas_download(paginationState.allResults, event);
}

export function view_all_locations() {
	high_priority_areas_view_all(paginationState.allResults);
}

export function get_locations_results() {
	return paginationState.allResults;
}

export function init() {
	section = qs('#right-panel #analysis-locations-section');
	resultscontainer = qs('.locations-paginated-list', section);
	descriptionEl = qs('[slot="description"]', section);
};
