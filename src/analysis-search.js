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

let ul, resultscontainer, resultsinfo, section, paginationContainer;

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

	const pn = ce('span');

	const el = ce('li', [
		ce('code', 	"[" + pi3.join(", ") + "]", { "style": "font-size: 0.9em" } ),
		pn,
	]);

	const t = (p.v ? Math.round((p.v).toFixed(2) * 100) : "");

	el.setAttribute('group', t);

	el.onmouseenter = pointto.bind(null, p);

	el.onclick = zoom.bind(null, p, pointto.bind(null, p, true));

	mapbox_coords_search_pois({ "coords": p.c, "limit": 1 })
		.then(r => pn.append(ce('span', maybe(r, 0, 'name'), { "class": "context" })));

	return el;
};


function render_pagination() {
	if (!paginationContainer) return;

	paginationContainer.replaceChildren();

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
	ul.replaceChildren();

	const totalCount = paginationState.allResults.length;
	const startIdx = (page - 1) * paginationState.itemsPerPage;
	const endIdx = Math.min(startIdx + paginationState.itemsPerPage, totalCount);

	const pageResults = paginationState.allResults.slice(startIdx, endIdx);

	resultsinfo.innerHTML = `Searching <b>analysis coordinates</b>:`;

	const list = pageResults.map(t => li(t));

	const groups = {};
	list.forEach(i => {
		const a = i.getAttribute('group');
		if (!groups[a]) groups[a] = [];

		groups[a].push(i);
	});

	ul.append(...list);

	for (const g in groups) {
		const el = ul.querySelector(`[group='${g}']`);
		const h = ce('h5', g + "%");

		ul.insertBefore(h, el);

		h.style = `
font-size: 0.9em;
background-color: rgba(${analysis_colorscale.fn(g/100.0)});
padding: 0.5em;
padding-left: 1em;
margin: 0.5em auto;
margin-left: 0;
width: calc(${g}% - 1.5em);
`;
	}

	render_pagination();
}

async function trigger() {
	ul.replaceChildren();
	if (paginationContainer) paginationContainer.replaceChildren();

	const results = await getallpoints();

	paginationState.allResults = results.sort((a,b) => a.v > b.v ? -1 : 1);
	paginationState.currentPage = 1;

	const count = paginationState.allResults.length;

	if (count === 0) {
		resultsinfo.innerHTML = `Searching <b>analysis coordinates</b>. Top 0 results:`;
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
	resultscontainer = qs('.search-results', section);

	ul = ce('ul');
	resultscontainer.append(ul);

	paginationContainer = ce('div', null, { "class": 'pagination-container' });
	resultscontainer.append(paginationContainer);

	resultsinfo = ce('div', ce('b', "Analysis coordinates"), { "class": 'search-results-info' });
	resultscontainer.prepend(resultsinfo);
};
