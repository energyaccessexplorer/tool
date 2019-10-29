/*
 * ea_summary
 *
 * Given the current dataset selection, calculate the population impact through
 * the 'population' dataset on all Indexes. Draw some pie graphs and a modal
 * about it.
 *
 * This is triggered by the "Snapshot" button.
 */

async function ea_summary() {
  const pop = DS.get('population');
  await pop.load('raster');
  const p = pop.raster.data;

  const content = ce('div');

  let graphs;
  const graphs_tab = ce('div', graphs = ce('div', null, { id: "summary-graphs" }), { class: 'tab' });

  const sizes = {
    "eai": 100,
    "ani": 100,
    "demand": 50,
    "supply": 50,
  };

  const summary = {};

  const nodata = pop.nodata;

  const ramp = tmpl("#ramp");
  ramp.append(
    ce('div', "Low"),
    ce('div', "Medium"),
    ce('div', "High")
  );

  const scale = ce('div');
  scale.append(
    ea_svg_color_steps(
      d3.scaleLinear()
        .domain(ea_analysis_colorscale.domain)
        .range(ea_analysis_colorscale.stops)
        .clamp(false),
      ea_analysis_colorscale.domain),
    ramp);

  async function get_summaries(idxn) {
    let raster = ea_analysis(ea_list_filter_type(idxn), idxn);

    summary[idxn] = await ea_summary_analyse(raster);

    let ppie = ea_svg_pie(summary[idxn]['population']['distribution'].map(x => [x]), 75, 0, ea_analysis_colorscale.stops, null);
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

    ea_plot_output(raster, c);
  };

  await Promise.all(Object.keys(ea_indexes).map(i => get_summaries(i)));

  graphs.append(ce('div', scale.cloneNode(true), { class: "index-graphs-scale" }));

  const s = ea_analysis_colorscale.stops;

  const lowmedhigh = i => ["low", "low-med", "medium", "med-high", "high"][i]

  const tables_tab = ce('div', null, { class: 'tab hidden' });

  for (let j of ['area', 'population']) {
    const table = ce('table', null, { class: 'summary' });
    let thead, tbody, thr;

    const title = ce('div', `${j} share`, { class: 'up-title' });

    table.append(thead = ce('thead'), tbody = ce('tbody'));
    thead.append(thr = ce('tr', ce('th'), { class: 'number-labels-row' }));
    s.forEach((x,i) => thr.append(ce('th', lowmedhigh(i), { style: `background-color: ${x};`})));

    for (var k in summary) {
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

  const report = ce('button', "Export PDF Report", { class: 'big-green-button' });
  report.onclick = ea_report;

  content.append(graphs_tab, tables_tab);

  const footer = ce('div', [switcher, report], { style: "text-align: center;" });

  ea_modal.set({
    header: "Snapshot",
    content: content,
    footer: footer
  }).show();

  return content;
};

async function ea_summary_analyse(raster) {
  const pop = DS.get('population');

  if (!pop) return null;

  await pop.load('raster');
  const p = pop.raster.data;
  const nodata = pop.raster.nodata;

  let a = new Float32Array(raster.length).fill(-1);

  let f = d3.scaleQuantize().domain([0,1]).range(ea_analysis_colorscale.domain);

  for (var i = 0; i < raster.length; i += 1) {
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

  const ptotal = population_groups.reduce((a,b) => a + b, 0)
  const atotal = area_groups.reduce((a,b) => a + b, 0);

  return {
    population: {
      total: ptotal,
      amounts: population_groups,
      distribution: population_groups.reduce((a,b) => { a.push(b/ptotal); return a; }, [])
    },
    area: {
      total: atotal,
      amounts: area_groups,
      distribution: area_groups.reduce((a,b) => { a.push(b/atotal); return a; }, [])
    }
  };
};

/*
 * ea_summary_wrapper
 *
 * A hack. For javascript reasons, ea_loading does not get executed in a
 * blocking manner.
 */

function ea_summary_wrapper() {
  const prom = new Promise((resolve, rej) => {
    ea_loading(true);
    setTimeout(_ => resolve("Success!"), 100);
  });

  prom
    .then(ea_summary)
    .then(_ => ea_loading(false));
};
