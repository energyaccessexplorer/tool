import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import bubblemessage from '../lib/bubblemessage.js';

import analysis_run, {
	analysis_colorscale,
	analysis_colorscale_svg,
} from './analysis.js';

import {
	default_colorscale,
} from './ds.js';

import {
	svg_pie,
	loading,
} from './utils.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

import {
	outputcanvas as plot_outputcanvas,
} from './plot.js';

import {
	pptx as report_pptx,
} from './report.js';

import {
	ce,
	delay,
	qs,
	tmpl,
} from '../lib/helpers.js';

async function summary() {
	const pop = DST.get('population-density');
	await pop.load('raster');

	const content = ce('div');

	const graphs = ce('div', null, { "id": "summary-graphs" });
	const graphs_tab = ce('div', graphs, { "class": 'tab' });

	const r = bind(tmpl('#ramp'), {
		"left":   "Low",
		"middle": "Medium",
		"right":  "High",
	});

	SUMMARY = {};

	const scale = ce('div');
	scale.append(analysis_colorscale_svg.cloneNode(true), r);

	const bubble = (v,e) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

	async function get_summaries(idxn) {
		const raster = (await analysis_run(idxn)).raster;

		SUMMARY[idxn] = await analyse(raster);
		SUMMARY[idxn]['raw_raster'] = raster;

		const ppie = svg_pie(SUMMARY[idxn]['population-density']['distribution'].map(x => [x]), 75, 0, analysis_colorscale.stops, null, null, bubble);
		const apie = svg_pie(SUMMARY[idxn]['area']['distribution'].map(x => [x]), 75, 0, analysis_colorscale.stops, null, null, bubble);

		const container = tmpl('#index-graphs-container-template');
		qs('.index-graphs-group #area-number', container).parentElement.append(apie.svg);
		qs('.index-graphs-group #population-number', container).parentElement.append(ppie.svg);

		graphs.append(
			ce('div',
			   [
				   ce('div', EAE['indexes'][idxn]['name'], { "class": 'up-title' }),
				   container,
				   ce('div', (SUMMARY[idxn]['area']['total'] === 0) ? ce('code', "(no datasets selected)") : null, { "style": "text-align: center; font-size: smaller;" }),
			   ],
			   { "class": 'index-group' }));

		ppie.change(0);
		apie.change(0);

		const c = qs('#canvas-' + idxn) || ce('canvas', null, { "id": 'canvas-' + idxn});
		c.style.display = 'none';
		document.body.append(c);

		plot_outputcanvas(raster, c);

		SUMMARY[idxn]['canvas'] = c;
		SUMMARY[idxn]['population-density']['pie'] = ppie;
		SUMMARY[idxn]['area']['pie'] = apie;
	};

	await Promise.all(Object.keys(EAE['indexes']).map(i => get_summaries(i)));

	graphs.append(ce('div', scale.cloneNode(true), { "class": "index-graphs-scale" }));

	const s = analysis_colorscale.stops;

	const lowmedhigh = i => ["low", "low-med", "medium", "med-high", "high"][i];

	const tables_tab = ce('div', null, { "class": 'tab hidden' });

	for (const j of ['area', 'population-density']) {
		const table = ce('table', null, { "class": 'summary' });
		let thead, tbody, thr;

		const title = ce('div', `${j} share`, { "class": 'up-title' });

		table.append(thead = ce('thead'), tbody = ce('tbody'));
		thead.append(thr = ce('tr', ce('th'), { "class": 'number-labels-row' }));
		s.forEach((x,i) => thr.append(ce('th', lowmedhigh(i), { "style": `background-color: ${x};`})));

		for (const k in SUMMARY) {
			const tr = ce('tr', ce('td', EAE['indexes'][k]['name'], { "class": 'index-name' }));
			s.forEach((x,i) => tr.append(ce('td', Math.round(SUMMARY[k][j]['amounts'][i]).toLocaleString())));

			tbody.append(tr);
		}

		tables_tab.append(title, table);
	}

	let ss = true;

	const switcher = ce('button', "Summary Table", { "class": 'big-green-button' });
	switcher.onclick = function() {
		ss = !ss;

		graphs_tab.classList.toggle('hidden');
		tables_tab.classList.toggle('hidden');

		this.innerText = ss ? "Summary Table" : "Summary Graphs";
	};

	const user_id = user_extract('id');

	const pptx_button = ce('button', "Export Presentation", { "class": 'big-green-button' });
	pptx_button.onclick = async _ => {
		if (!user_id) {
			register_login();
			return;
		}

		loading(true);

		await delay(0.1);
		await report_pptx();
		await delay(5);

		loading(false);
	};

	content.append(graphs_tab, tables_tab);

	const footer = ce('div', [switcher, pptx_button], { "style": "text-align: center;" });

	new modal({
		"id":      'snapshot-modal',
		"header":  "Snapshot",
		"content": content,
		"footer":  footer,
		"destroy": true,
	}).show();

	return content;
};

export default async function analyse(raster) {
	let ds = DST.get('population-density');

	if (!ds) {
		console.warn("No 'population-density' dataset present... Will use boundaries");
		ds = OUTLINE;
	}

	await ds.load('raster');
	const p = ds.raster.data;
	const nodata = ds.raster.nodata;

	const a = new Float32Array(raster.length).fill(-1);

	const fn = d3.scaleQuantize()
		.domain([0,1])
		.range(default_colorscale.intervals);

	for (let i = 0; i < raster.length; i += 1) {
		const r = raster[i];
		a[i] = (r === -1) ? -1 : fn(r);
	}

	const population_groups = [0, 0, 0, 0, 0];
	const area_groups = [0, 0, 0, 0, 0];
	let covered = 0;

	for (let i = 0; i < a.length; i += 1) {
		const x = a[i];
		const v = p[i];
		let t = 0;

		if (v == nodata) continue;

		if (x >= 0   && x < 0.2) t = 0;
		else if (x >= 0.2 && x < 0.4) t = 1;
		else if (x >= 0.4 && x < 0.6) t = 2;
		else if (x >= 0.6 && x < 0.8) t = 3;
		else if (x >= 0.8 && x <= 1)  t = 4;

		if (x !== -1) {
			covered += 1;
			area_groups[t] += 1;
			population_groups[t] += v;
		}
	}

	const e = (1000/GEOGRAPHY.resolution)**2;
	const c = OUTLINE.raster.data.filter(x => x !== OUTLINE.raster.nodata).length;

	const ptotal = population_groups.reduce((a,b) => a + b, 0);
	const atotal = area_groups.reduce((a,b) => a + b, 0);

	const s = STATE.divtier ?
		x => x / e :
		d3.scaleLinear()
			.domain([0, c])
			.range([0, (GEOGRAPHY.area || c/e)])
			.clamp(true);

	const o = {};
	if (ds.id === 'population-density')
		o['population-density'] = {
			"total":        ptotal / e,
			"amounts":      population_groups.map(x => x / e),
			"distribution": population_groups.reduce((a,b) => { a.push(b/ptotal); return a; }, []),
		};

	o['area'] = {
		"total":        s(covered),
		"amounts":      area_groups.map(x => s(x)),
		"distribution": area_groups.reduce((a,b) => { a.push(b/atotal); return a; }, []),
	};

	o['raster'] = a;

	return o;
};

/*
 * wrapper
 *
 * A hack. For javascript reasons, loading does not get executed in a
 * blocking manner.
 */

function summary_wrapper() {
	const prom = new Promise((resolve, _) => {
		loading(true);
		setTimeout(_ => resolve("Success!"), 100);
	});

	prom
		.then(summary)
		.then(_ => loading(false));
};

qs('#summary-button').onclick = summary_wrapper;
