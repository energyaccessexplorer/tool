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
  await pop.load('heatmap');
  const p = pop.raster.data;

  const content = ce('div');

  content.append(
    ce('div', "Share of population for each index and category", {
      style: `
text-transform: uppercase;
margin: 0 -1.2em 1.2em -1.2em;
padding-left: 1.2em;
padding-bottom: 1.2em;
border-bottom: 1px solid lightgray;`
    }));

  let graphs;
  const graphs_tab = ce('div', graphs = ce('div', null, { id: "graphs" }), { class: 'tab' });

  const sizes = {
    "eai": 100,
    "ani": 100,
    "demand": 50,
    "supply": 50,
  };

  const summary = {};

  const nodata = pop.nodata;

  async function get_summaries(idxn) {
    let raster = ea_analysis(ea_list_filter_type(idxn), idxn);

    summary[idxn] = await ea_summary_analyse(raster);

    let ppie = ea_svg_pie(summary[idxn]['population']['distribution'].map(x => [x]), 75, 0, ea_color_scale.stops, null);
    let apie = ea_svg_pie(summary[idxn]['area']['distribution'].map(x => [x]), 75, 0, ea_color_scale.stops, null);

    let e = ce('div', null, { style: "text-align: center; margin: 0 1em;" });
    const container = ce('div', null, { class: 'pie-svg-container' });

    e.append(container, ce('div', ea_indexes[idxn]['name']));

    ppie.change(0);
    apie.change(0);

    container.append(ppie.svg, apie.svg);

    graphs.append(e);

    const c = qs('#canvas-' + idxn) || ce('canvas', null, { id: 'canvas-' + idxn});
    c.style.display = 'none';
    document.body.append(c);

    ea_canvas_plot(raster, c);
  };

  await Promise.all(Object.keys(ea_indexes).map(i => get_summaries(i)));

  console.log(summary);

  const s = ea_color_scale.stops;

  const i20 = i => (20 * i) + "-" + (20 * (i+1));

  const legend = ce('div', null, { class: 'number-labels' });
  s.forEach((x,i) => legend.append(ce('div', i20(i), { style: `background-color: ${x};`})));

  const table = ce('table', null, { class: 'summary tab hidden' });
  let thead, tbody, thr;

  table.append(thead = ce('thead'), tbody = ce('tbody'));
  thead.append(thr = ce('tr', ce('th'), { class: 'number-labels-row' }));
  s.forEach((x,i) => thr.append(ce('th', i20(i), { style: `background-color: ${x};`})));

  for (var k in summary) {
    let tr = ce('tr', ce('td', ea_indexes[k]['name'], { class: 'index-name' }));
    s.forEach((x,i) => tr.append(ce('td', (summary[k]['population']['amounts'][i]).toLocaleString())));

    tbody.append(tr);
  }

  let ss = true;

  const switcher = ce('button', "Summary Table", { class: 'big-green-button' });
  switcher.onclick = function() {
    ss = !ss;
    for (let e of qsa('.tab', content))
      e.classList.toggle('hidden');
    this.innerText = ss ? "Summary Table" : "Summary Graphs";
  };

  graphs_tab.append(legend);
  content.append(graphs_tab, table);

  ea_modal.set({
    header: "Snapshot",
    content: content,
    footer: switcher
  }).show();

  ea_report();

  return content;
};

async function ea_summary_analyse(raster) {
  const pop = DS.get('population');

  if (!pop) return null;

  await pop.load('heatmap');
  const p = pop.raster.data;
  const nodata = pop.raster.nodata;

  let a = new Float32Array(raster.length).fill(-1);

  let f = d3.scaleQuantize().domain([0,1]).range(ea_color_scale.domain);

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

    if (v !== nodata)
      population_groups[t] += v;

    if (x !== -1)
      area_groups[t] += 1;
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
 * A hack. For javascript reasons, ea_ui_app_loading does not get executed in a
 * blocking manner.
 */

function ea_summary_wrapper() {
  const prom = new Promise((resolve, rej) => {
    ea_ui_app_loading(true);
    setTimeout(_ => resolve("Success!"), 100);
  });

  prom
    .then(ea_summary)
    .then(_ => ea_ui_app_loading(false));
};
