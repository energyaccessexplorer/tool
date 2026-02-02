import {
	svg_pie,
} from './utils.js';

import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import summary_analyse from './summary.js';

import bubblemessage from '../lib/bubblemessage.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

import {
	analysis,
	analysis_colorscale,
	analysis_colorscale_svg,
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

export async function graphs(raster) {
	const t = await summary_analyse(raster);

	const e = (1000/GEOGRAPHY.resolution)**2;

	const outline_raster = DST.get('outline').raster;
	const outline_cover = outline_raster.data.filter(x => x != outline_raster.nodata).length;
	const f = GEOGRAPHY.area ? (GEOGRAPHY.area / outline_cover) : (1/e);

	let g = maybe(t, 'population-density'); if (g) {
		g['distribution'].forEach((x,i) => PIES['population']['data'][i].push(x));

		PIES['population'].change(1);

		qs('#population-number').innerHTML = Math.round(g['total']).toLocaleString() + "&nbsp;" + "people";

		g['distribution'].forEach((x,i) => PIES['population']['data'][i].shift());
	} else {
		const pn = qs('#population-number');
		if (pn) pn.closest('.index-graphs-group').remove();
	}

	g = maybe(t, 'area'); if (g) {
		g['distribution'].forEach((x,i) => PIES['area']['data'][i].push(x));

		PIES['area'].change(1);

		qs('#area-number').innerHTML = Math.round(g['total'] * f).toLocaleString() + "&nbsp;" + "km<sup>2</sup>";

		g['distribution'].forEach((x,i) => PIES['area']['data'][i].shift());
	} else {
		const an = qs('#area-number');
		if (an) an.closest('.index-graphs-group').remove();
	}
};

export function init() {
	PIES["population"] = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);
	PIES["area"]       = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);

	const user_id = user_extract('id');

	const r = bind(tmpl('#ramp'), {
		"left":   "Low",
		"middle": "Medium",
		"right":  "High",
	});

	const scale = ce('div', null, { "class": 'index-graphs-scale' });
	scale.append(analysis_colorscale_svg.cloneNode(true), r);

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

	const graphs = tmpl('#index-graphs-container-template');

	qs('.index-graphs-group #area-number', graphs).parentElement.append(PIES['area'].svg);
	qs('.index-graphs-group #population-number', graphs).parentElement.append(PIES['population'].svg);

	qs('#index-graphs').append(graphs, scale);

	const collapse = qs('#right-panel-collapse');
	collapse.onclick = toggle.bind(qs('#right-panel'));
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
	const caret = this.querySelector('#right-panel-collapse span');

	if (this.getAttribute('closed') === '') {
		this.removeAttribute('closed');
		caret.className = 'bi-caret-up-fill';
	} else {
		this.setAttribute('closed', '');
		caret.className = 'bi-caret-down-fill';
	}
};
