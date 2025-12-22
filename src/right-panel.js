import {
	svg_pie,
} from './utils.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import summary_analyse from './summary.js';

import bubblemessage from '../lib/bubblemessage.js';

import {
	init as analysis_locations_panel_init,
	update as analysis_locations_panel_update,
} from './analysis-search.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

import {
	analysis,
	analysis_colorscale,
} from './analysis.js';

import {
	snapshot,
} from  './session.js';

import {
	and,
	ce,
	fake_blob_download,
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

const PIES = {};

const bubble = (v,e) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

function update_graph_section(section, distribution, total, unit, description) {
	const labels = ['Low', 'Low - medium', 'Medium', 'Medium - high', 'High'];

	const scale = ce('dl', null, { "class": 'discrete-scale' });

	analysis_colorscale.stops.slice().reverse().map((color, i) => {
		const idx = analysis_colorscale.stops.length - 1 - i;
		const count = Math.round(distribution[idx] * total);
		const value = `${count.toLocaleString()} ${unit}`;

		const circle = ce('span', null, { "class": 'scale-circle' });
		circle.style.backgroundColor = color;

		const dt = ce('dt', null, { "class": 'scale-item' });
		dt.append(circle, ce('strong', labels[idx]));

		const dd = ce('dd', value);

		scale.append(dt, dd);
	});

	const scale_container = qs('.index-graphs-scale-container', section);
	scale_container.innerHTML = '';
	scale_container.append(scale);

	qs('.indexes-pie-label', section).innerHTML = total.toLocaleString() + "&nbsp;" + unit;
	qs('.section-description', section).innerHTML = description;
}

function create_graph_section(title, type, numberId, descId) {
	const section = tmpl('#index-graph-section-template');
	qs('.section-title', section).textContent = title;
	qs('.indexes-pie-label', section).id = numberId;
	qs('.section-description', section).id = descId;
	qs('.index-graphs-group', section).append(PIES[type].svg);
	return section;
}

export async function graphs(raster) {
	const t = await summary_analyse(raster);

	const e = (1000/GEOGRAPHY.resolution)**2;

	const outline_raster = DST.get('outline').raster;
	const outline_cover = outline_raster.data.filter(x => x != outline_raster.nodata).length;
	const f = GEOGRAPHY.area ? (GEOGRAPHY.area / outline_cover) : (1/e);

	let hasValidData = false;

	let g = maybe(t, 'population-density'); if (g) {
		g['distribution'].forEach((x,i) => PIES['population']['data'][i].push(x));

		PIES['population'].change(1);

		const totalPop = Math.round(g['total'] / e);
		const highPop = Math.round(g['distribution'][4] / e);
		const description = `Showing energy access potential for areas affecting
			${totalPop.toLocaleString()} people, of whom ${highPop.toLocaleString()} people
			are situated in areas of high energy access potential.`;
		const section = qs('#population-number').closest('.index-graphs-section');

		update_graph_section(section, g['distribution'], totalPop, 'people', description);

		g['distribution'].forEach((x,i) => PIES['population']['data'][i].shift());

		if (!isNaN(totalPop) && totalPop > 0) hasValidData = true;
	} else {
		const pn = qs('#population-number');
		if (pn) pn.closest('.index-graphs-group').remove();
	}

	g = maybe(t, 'area'); if (g) {
		g['distribution'].forEach((x,i) => PIES['area']['data'][i].push(x));

		PIES['area'].change(1);

		const totalArea = Math.round(g['total'] * f);
		const highArea = Math.round(g['distribution'][4] * f);
		const description = `Showing energy access potential for areas spanning
			${totalArea.toLocaleString()} km², of which ${highArea.toLocaleString()} km² has
			high energy access potential.`;
		const section = qs('#area-number').closest('.index-graphs-section');

		update_graph_section(section, g['distribution'], totalArea, 'km²', description);

		g['distribution'].forEach((x,i) => PIES['area']['data'][i].shift());

		if (!isNaN(totalArea) && totalArea > 0) hasValidData = true;
	} else {
		const an = qs('#area-number');
		if (an) an.closest('.index-graphs-group').remove();
	}

	analysis_locations_panel_update();

	const blankState = qs('#analysis-blank-state');
	const sectionsWrapper = qs('#analysis-sections-wrapper');

	if (hasValidData) {
		blankState.style.display = 'none';
		sectionsWrapper.style.display = 'block';
	} else {
		blankState.style.display = 'flex';
		sectionsWrapper.style.display = 'none';
	}
};

export function init() {
	PIES["population"] = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);
	PIES["area"]       = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);

	const user_id = user_extract('id');

	const snap = qs('#save-snapshot-button');
	snap.onclick = _ => {
		if (snapshot())
			qs('span', snap).innerText = "Update Analysis";
	};

	const suid = maybe(SNAPSHOT, 'user_id');

	if (and(suid, suid !== SELF.id))
		qs('span', snap).innerText = "Duplicate Analysis";
	else if (and(suid, suid === SELF.id))
		qs('span', snap).innerText = "Update Analysis";

	const share = qs('#share-snapshot-button');
	share.onclick = _ => {
		const u = new URL(location);

		if (u.searchParams.get('snapshot')) {
			share_url();
			return;

		}
		if (snapshot(share_url))
			qs('span', snap).innerText = "Update Analysis";
	};

	const download = qs('#tiff-download');
	download.onclick = async _ => {
		if (!user_id) {
			register_login();
			return;
		}

		const type = STATE.index;
		fake_blob_download((await analysis(type)).tiff, `energyaccessexplorer-${type}.tif`);
	};

	const container = ce('div');
	container.append(create_graph_section('Area share', 'area', 'area-number', 'area-description'));
	container.append(create_graph_section('Population share', 'population', 'population-number', 'population-description'));

	qs('#index-graphs').append(container);

	const analysis_locations = tmpl('#analysis-locations-template');
	qs('#analysis-locations').replaceWith(analysis_locations);

	const collapse = qs('#right-panel-collapse');
	collapse.onclick = toggle.bind(qs('#right-panel'));

	analysis_locations_panel_init();
};

function share_url() {
	const c = tmpl('#share-link-modal-content');

	const u = new URL(location);
	const id = u.searchParams.get('snapshot');
	const url = `${u.protocol}//${u.hostname}${window.BASE}/tool/p?${id}`;

	function copy() {
		if (!navigator.clipboard) {
			FLASH.push({
				"type":    'error',
				"timeout": 2000,
				"title":   "Clipboard functionality not available",
			});

			this.closest('button').remove();

			return;
		}

		navigator.clipboard.writeText(url)
			.then(_ => {
				FLASH.push({
					"type":    'success',
					"timeout": 2000,
					"title":   "Link copied!",
				});
			});
	};

	bind(c, { url, copy });

	new modal({
		"id":      'share-link-modal',
		"header":  "Share link",
		"content": c,
		"destroy": true,
	}).show();
};

export function updated_plot(type, index) {
	qs('#index-graphs-title').innerText = index['name'];
	qs('#index-graphs-subtext').innerText = index['subtext'];
};

function toggle() {
	const button = qs('#right-panel-collapse', this);
	const icon = qs('i', button);
	const text = qs('span', button);

	if (this.getAttribute('closed') === '') {
		this.removeAttribute('closed');
		icon.className = 'bi bi-eye-slash';
		text.textContent = 'Hide';
	} else {
		this.setAttribute('closed', '');
		icon.className = 'bi bi-eye';
		text.textContent = 'Show';
	}
};
