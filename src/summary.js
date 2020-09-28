import * as plot from './plot.js';

import * as report from './report.js';

import ea_analysis from './analysis.js';

/*
 * summary
 *
 * Given the current dataset selection, calculate the population impact through
 * the 'population-density' dataset on all Indexes. Draw some pie graphs and a
 * modal about it.
 *
 * This is triggered by the "Snapshot" button.
 */

async function summary() {
	const pop = DST.get('population-density');
	await pop.load('raster');

	const content = ce('div');

	let graphs;
	const graphs_tab = ce('div', graphs = ce('div', null, { id: "summary-graphs" }), { class: 'tab' });

	const summary = {};

	const ramp = tmpl("#ramp");
	ramp.append(
		ce('div', "Low"),
		ce('div', "Medium"),
		ce('div', "High")
	);

	const scale = ce('div');
	scale.append(ea_analysis_colorscale.svg.cloneNode(true), ramp);

	async function get_summaries(idxn) {
		let raster = ea_analysis(idxn);

		summary[idxn] = await analyse(raster);

		let ppie = ea_svg_pie(summary[idxn]['population-density']['distribution'].map(x => [x]), 75, 0, ea_analysis_colorscale.stops, null);
		let apie = ea_svg_pie(summary[idxn]['area']['distribution'].map(x => [x]), 75, 0, ea_analysis_colorscale.stops, null);

		graphs.append(el_tree(
			[ ce('div', null, { class: 'index-group' }), [
				[ ce('div', ea_indexes[idxn]['name'], { class: 'up-title' }) ],
				[ ce('div', null, { class: 'index-graphs-container' }), [
					[ ce('div', null, { class: 'index-graphs-group' }),
						[
							ce('div', "Area share"),
							apie.svg
						]
					],
					[ ce('div', null, { class: 'index-graphs-group' }),
						[
							ce('div', "Population share"),
							ppie.svg
						]
					]
				]
				],
				[ ce('div', (summary[idxn]['area']['total'] === 0) ? "<code>(No datasets selected)</code>" : null, { style: "text-align: center; font-size: smaller;" }) ]
			]]));

		ppie.change(0);
		apie.change(0);

		const c = qs('#canvas-' + idxn) || ce('canvas', null, { id: 'canvas-' + idxn});
		c.style.display = 'none';
		document.body.append(c);

		plot.outputcanvas(raster, c);
	};

	await Promise.all(Object.keys(ea_indexes).map(i => get_summaries(i)));

	graphs.append(ce('div', scale.cloneNode(true), { class: "index-graphs-scale" }));

	const s = ea_analysis_colorscale.stops;

	const lowmedhigh = i => ["low", "low-med", "medium", "med-high", "high"][i];

	const tables_tab = ce('div', null, { class: 'tab hidden' });

	for (let j of ['area', 'population-density']) {
		const table = ce('table', null, { class: 'summary' });
		let thead, tbody, thr;

		const title = ce('div', `${j} share`, { class: 'up-title' });

		table.append(thead = ce('thead'), tbody = ce('tbody'));
		thead.append(thr = ce('tr', ce('th'), { class: 'number-labels-row' }));
		s.forEach((x,i) => thr.append(ce('th', lowmedhigh(i), { style: `background-color: ${x};`})));

		for (let k in summary) {
			let tr = ce('tr', ce('td', ea_indexes[k]['name'], { class: 'index-name' }));
			s.forEach((x,i) => tr.append(ce('td', (summary[k][j]['amounts'][i]).toLocaleString())));

			tbody.append(tr);
		}

		tables_tab.append(title, table);
	}

	let ss = true;

	const switcher = ce('button', "Summary Table", { class: 'big-green-button' });
	switcher.onclick = function() {
		ss = !ss;

		graphs_tab.classList.toggle('hidden');
		tables_tab.classList.toggle('hidden');

		this.innerText = ss ? "Summary Table" : "Summary Graphs";
	};

	const pdf = ce('button', "Export PDF Report", { class: 'big-green-button' });
	pdf.onclick = report.pdf;

	const csv = ce('button', "Export CSV Report", { class: 'big-green-button' });
	csv.onclick = _ => fake_blob_download(report.csv(summary), `energyaccessexplorer-report.csv`, "text/csv");

	content.append(graphs_tab, tables_tab);

	const footer = ce('div', [switcher, pdf, csv], { style: "text-align: center;" });

	ea_modal.set({
		header: "Snapshot",
		content: content,
		footer: footer
	}).show();

	return content;
};

export default async function analyse(raster) {
	let ds = DST.get('population-density');

	if (!ds) {
		console.warn("No 'population-density' dataset present... Will use boundaries");
		ds = DST.get('boundaries');
	}

	await ds.load('raster');
	const p = ds.raster.data;
	const nodata = ds.raster.nodata;

	let a = new Float32Array(raster.length).fill(-1);

	let f = d3.scaleQuantize().domain([0,1]).range(NORM_STOPS);

	for (let i = 0; i < raster.length; i += 1) {
		const r = raster[i];
		a[i] = (r === -1) ? -1 : f(r);
	}

	let population_groups = [0, 0, 0, 0, 0];
	let area_groups = [0, 0, 0, 0, 0];

	for (let i = 0; i < a.length; i += 1) {
		let x = a[i];
		let v = p[i];
		let t = 0;

		if (v == nodata) continue;

		if (x >= 0   && x < 0.2) t = 0;
		else if (x >= 0.2 && x < 0.4) t = 1;
		else if (x >= 0.4 && x < 0.6) t = 2;
		else if (x >= 0.6 && x < 0.8) t = 3;
		else if (x >= 0.8 && x <= 1)  t = 4;

		if (x !== -1) {
			area_groups[t] += 1;
			population_groups[t] += v;
		}
	}

	const ptotal = population_groups.reduce((a,b) => a + b, 0);
	const atotal = area_groups.reduce((a,b) => a + b, 0);

	const o = {};
	if (ds.id === 'population-density')
		o['population-density'] = {
			total: ptotal,
			amounts: population_groups,
			distribution: population_groups.reduce((a,b) => { a.push(b/ptotal); return a; }, [])
		};

	o['area'] = {
		total: atotal,
		amounts: area_groups,
		distribution: area_groups.reduce((a,b) => { a.push(b/atotal); return a; }, [])
	};

	return o;
};

/*
 * wrapper
 *
 * A hack. For javascript reasons, ea_loading does not get executed in a
 * blocking manner.
 */

function wrapper() {
	const prom = new Promise((resolve, _) => {
		ea_loading(true);
		setTimeout(_ => resolve("Success!"), 100);
	});

	prom
		.then(summary)
		.then(_ => ea_loading(false));
};

qs('#summary-button').onclick = wrapper;
