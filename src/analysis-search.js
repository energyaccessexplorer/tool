import {
	coords_search_pois as mapbox_coords_search_pois,
	fit as mapbox_fit,
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
	coordinates_to_raster_pixel,
} from './utils.js';

import {
	context,
} from './complicated.js';

import {
	extract_map_info_data,
} from './map-info.js';

import {
	ce,
	fake_blob_download,
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

function admin_area_item(item, rank) {
	const template = tmpl('#admin-area-item-template');
	const el = template.firstElementChild;

	bind(template, {
		"rank":          rank,
		"location-name": item.name,
	});

	if (item.feature) {
		el.onclick = () => mapbox_fit(geojsonExtent(item.feature), true);
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

function get_point_data(item, area_info = null) {
	const is_admin_area = area_info !== null;
	const analysis_name = EAE['indexes'][STATE.index]['name'];

	let fields = [];
	let props = {};
	let ll = null;

	if (!is_admin_area) {
		ll = item.c;
		const rc = coordinates_to_raster_pixel(ll, OUTLINE.raster);
		[fields, props] = context(rc, null);
	}

	const analysis_value = item.v;

	const { detailedData } = extract_map_info_data(
		fields, props, ll, analysis_value, analysis_name, null, area_info,
	);

	const row = {};
	if (ll) {
		row["Longitude"] = ll[0].toFixed(5);
		row["Latitude"] = ll[1].toFixed(5);
	}

	for (const data of detailedData) {
		const clean_value = data.value.replace(/<[^>]*>/g, '').trim();
		row[data.label] = clean_value;
	}

	return row;
}

export async function download_locations_data(_, event) {
	if (!paginationState.allResults.length) return;

	const button = event.currentTarget;
	button.disabled = true;
	button.querySelector('span').textContent = 'Generating...';

	const warn_before_unload = (e) => {
		e.preventDefault();
		e.returnValue = '';
	};
	window.addEventListener('beforeunload', warn_before_unload);

	const is_raster = STATE.variant === 'raster';
	const rows = [];
	let headers = [];

	const escape_csv = (val) => {
		if (val === null || val === undefined) return '';
		const str = String(val);
		if (str.includes(',') || str.includes('"') || str.includes('\n')) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	};

	const items = paginationState.allResults;

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const area_info = is_raster ? null : { "variant": STATE.variant, "name": item.name };
		const row_data = get_point_data(item, area_info);

		if (headers.length === 0) {
			headers = Object.keys(row_data);
		}
		rows.push(headers.map(h => escape_csv(row_data[h])).join(','));

		if (i % 100 === 0 && i > 0) {
			await new Promise(resolve => setTimeout(resolve, 0));
		}
	}

	const csv_content = [headers.join(','), ...rows].join('\n');

	const timestamp = new Date().getTime();
	const analysis_name = EAE['indexes'][STATE.index]['name'].toLowerCase().replace(/\s+/g, '-');
	const filename = `energyaccessexplorer-${analysis_name}-high-priority-areas-${timestamp}.csv`;

	fake_blob_download(csv_content, filename, 'text/csv;charset=utf-8');

	window.removeEventListener('beforeunload', warn_before_unload);
	button.disabled = false;
	button.querySelector('span').textContent = 'Download data';
}

export function init() {
	section = qs('#right-panel #analysis-locations-section');
	resultscontainer = qs('.locations-paginated-list', section);
	descriptionEl = qs('[slot="description"]', section);
};
