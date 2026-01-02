import {
	coords_search_pois as mapbox_coords_search_pois,
} from './mapbox.js';

import {
	getallpoints,
	analysis_colorscale,
	lowmedhigh_scale,
} from './analysis.js';

import {
	pointto as search_pointto,
	zoom,
} from './search.js';

import {
	ce,
	maybe,
	qs,
} from '../lib/helpers.js';

let ul, resultscontainer, section, paginationContainer;

const paginationState = {
	"allResults":   [],
	"currentPage":  1,
	"itemsPerPage": 10,
};

function pointto(p, a = false) {
	const dict = [[ "v", EAE['indexes'][STATE.index]['name'] ]];
	const props = { "v": lowmedhigh_scale(p.v) };

	search_pointto(p.c, dict, props, a);
};

function li(p) {
	const pi3 = (p.c).map(c => +c.toFixed(3));
	const score = (p.v ? Math.round((p.v).toFixed(2) * 100) : "");

	const targetIcon = ce('i', null, { "class": "bi bi-crosshair location-target-icon" });

	const locationName = ce('div', null, { "class": "location-name" });
	const coordinates = ce('div', `[${pi3.join(", ")}]`, { "class": "location-coordinates" });

	const locationInfo = ce('div', [locationName, coordinates], { "class": "location-info" });

	const chevron = ce('i', null, { "class": "bi bi-chevron-right location-chevron" });

	const content = ce('div', [targetIcon, locationInfo, chevron], { "class": "location-item-content" });
	const el = ce('li', [content], { "class": "location-item" });

	el.setAttribute('data-score', score);
	el.onmouseenter = pointto.bind(null, p);
	el.onclick = zoom.bind(null, p, pointto.bind(null, p, true));

	mapbox_coords_search_pois({ "coords": p.c, "limit": 1 })
		.then(r => locationName.textContent = maybe(r, 0, 'name') || 'Unknown location');

	return el;
};


function render_pagination() {
	if (!paginationContainer) {
		paginationContainer = ce('div', null, { "class": 'pagination-container' });
		resultscontainer.append(paginationContainer);
	} else {
		paginationContainer.replaceChildren();
	}

	const totalPages = Math.ceil(paginationState.allResults.length / paginationState.itemsPerPage);
	const totalCount = paginationState.allResults.length;
	const startIdx = (paginationState.currentPage - 1) * paginationState.itemsPerPage;
	const endIdx = Math.min(startIdx + paginationState.itemsPerPage, totalCount);

	if (totalPages <= 1 && totalCount > 0) {
		const infoText = ce('div', `Showing ${totalCount.toLocaleString()} result${totalCount !== 1 ? 's' : ''}`, { "class": 'pagination-info' });
		paginationContainer.append(infoText);
		return;
	}

	if (totalCount === 0) return;

	const infoText = ce('div', `Showing ${(startIdx + 1).toLocaleString()}-${endIdx.toLocaleString()} of ${totalCount.toLocaleString()}`, { "class": 'pagination-info' });
	paginationContainer.append(infoText);

	const paginationDiv = ce('div', null, { "class": 'pagination' });

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

	paginationContainer.append(paginationDiv);
}

function render_page(page) {
	if (!ul) {
		ul = ce('ul', null, { "class": 'locations-list' });
		resultscontainer.append(ul);
	} else {
		ul.replaceChildren();
	}

	const totalCount = paginationState.allResults.length;
	const startIdx = (page - 1) * paginationState.itemsPerPage;
	const endIdx = Math.min(startIdx + paginationState.itemsPerPage, totalCount);

	const pageResults = paginationState.allResults.slice(startIdx, endIdx);

	const scoreCounts = {};
	paginationState.allResults.forEach(item => {
		const score = item.v ? Math.round((item.v).toFixed(2) * 100) : "";
		scoreCounts[score] = (scoreCounts[score] || 0) + 1;
	});

	let currentScore = null;
	let currentGroup = null;

	let currentGroupList = null;

	pageResults.forEach(item => {
		const score = item.v ? Math.round((item.v).toFixed(2) * 100) : "";
		const groupCount = scoreCounts[score];

		if (score !== currentScore) {
			currentScore = score;
			currentGroup = ce('li', null, { "class": "location-group" });
			currentGroup.setAttribute('data-score', score);

			const scoreText = ce('span', `${score}% priority score`);
			const areaCount = groupCount === 1 ? '1 area' : `${groupCount} areas`;
			const areaBadge = ce('span', areaCount, { "class": "location-area-badge" });
			const groupHeader = ce('div', [scoreText, areaBadge], { "class": "location-group-header" });

			currentGroupList = ce('ul', null, { "class": "location-group-list" });

			currentGroup.append(groupHeader, currentGroupList);
			ul.append(currentGroup);
		}

		const listItem = li(item);
		currentGroupList.append(listItem);
	});

	render_pagination();
}

async function trigger() {
	if (ul) ul.replaceChildren();
	if (paginationContainer) paginationContainer.replaceChildren();

	const results = await getallpoints();

	paginationState.allResults = results.sort((a,b) => a.v > b.v ? -1 : 1);
	paginationState.currentPage = 1;

	const count = paginationState.allResults.length;

	if (count === 0) {
		if (section) section.setAttribute('collapsed', '');
		return;
	}

	render_page(paginationState.currentPage);
};

export function update() {
	trigger();
};

export function init() {
	section = qs('#right-panel #analysis-locations-section');
	resultscontainer = qs('.locations-paginated-list', section);
};
