async function ea_indexes_analyse(raster) {
  const pop = DS.get('population');

  if (!pop) return null;

  await pop.load('heatmap');
  const p = pop.raster.data;
  const nodata = pop.raster.nodata;

  let a = new Float32Array(raster.length).fill(-1);

  let f = d3.scaleQuantize().domain([0,1]).range(ea_color_scale.domain);

  for (var i = 0; i < raster.length; i++) {
    const r = raster[i];
    a[i] = (r === -1) ? -1 : f(r);
  }

  let population_groups = [0, 0, 0, 0, 0];
  let area_groups = [0, 0, 0, 0, 0];

  for (let i = 0; i < a.length; i++) {
    let x = a[i];
    let v = p[i];
    let t = 0;

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
      distribution: population_groups.reduce((a,b) => { a.push(b/ptotal); return a; }, [])
    },
    area: {
      total: atotal,
      distribution: area_groups.reduce((a,b) => { a.push(b/atotal); return a; }, [])
    }
  };
};

async function ea_indexes_graphs(raster) {
  const t = await ea_indexes_analyse(raster);

  if (!t) return;

  t['population']['distribution']
    .forEach((x,i) => POPULATION_PIE['data'][i].push(x));

  t['area']['distribution']
    .forEach((x,i) => AREA_PIE['data'][i].push(x));

  POPULATION_PIE.change(1);
  AREA_PIE.change(1);

  document.querySelector('#population-number').innerHTML = t['population']['total'].toLocaleString() + "&nbsp;" + "people";
  document.querySelector('#area-number').innerHTML = t['area']['total'].toLocaleString() + "&nbsp;" + "km<sup>2</sup>";

  t['population']['distribution'].forEach((x,i) => POPULATION_PIE['data'][i].shift());
  t['area']['distribution'].forEach((x,i) => AREA_PIE['data'][i].shift());
};

function ea_indexes_init(state) {
  const index_graphs = document.querySelector('#index-graphs-container');

  const scale = ce('div');
  scale.append(
    ea_svg_color_steps(
      d3.scaleLinear()
        .domain(ea_color_scale.domain)
        .range(ea_color_scale.stops)
        .clamp(false),
      ea_color_scale.domain),
    tmpl("#ramp-label-low-high"));

  const cos = document.querySelector('#canvas-output-select');
  for (let i in ea_indexes)
    cos.append(ce('option', ea_indexes[i]['name'], { value: i }));

  cos.value = state.output;
  cos.onchange = function() {
    ea_overlord({
      "type": "index",
      "target": this.value,
      "caller": "ea_indexes_init select"
    });
  };

  const info = document.querySelector('#index-graphs-info');
  info.append(tmpl('#svg-info'));
  info.onclick = _ => ea_indexes_modal();

  window.POPULATION_PIE = ea_svg_pie([[0], [0], [0], [0], [0]], 75, 0, ea_color_scale.stops, null);
  window.AREA_PIE = ea_svg_pie([[0], [0], [0], [0], [0]], 75, 0, ea_color_scale.stops, null);

  const pe = ce('div', ce('div', "Population share"), { class: 'index-graphs-group' });
  const ae = ce('div', ce('div', "Area share"), { class: 'index-graphs-group' });

  pe.append(ce('div', null, { id: 'population-number', class: 'indexes-pie-label' }), POPULATION_PIE.svg);
  ae.append(ce('div', null, { id: 'area-number', class: 'indexes-pie-label' }), AREA_PIE.svg);

  index_graphs.append(ae, pe, scale);
};

function ea_index_drawable(inputs, target) {
  const counts = {};

  for (let i in ea_indexes) counts[i] = 0;

  for (let i of inputs) {
    if (i === 'boundaries') continue;

    let n = DS.get(i).indexname;
    counts[n] += 1;

    counts['ani'] += 1;
    counts['eai'] += 1;
  }

  return counts[target] > 0;
};

function ea_indexes_list(state) {
  const target = state.output;
  const nodes = [];

  const indexes_list = document.querySelector('#indexes-list');
  elem_empty(indexes_list);

  function i_elem(t, v, x) {
    const d = ce('li',  null, { bind: t, class: 'element', ripple: "" });
    d.append(
      ce('div', null, { class: 'radio' }),
      ce('span', v)
    );

    if (!ea_index_drawable(state.inputs, t))
      d.setAttribute('disabled', "");

    return d;
  };

  function trigger_this() {
    if (this.hasAttribute('disabled')) return false;

    let e = document.createEvent('HTMLEvents');

    for (n of nodes) {
      e.initEvent((this === n) ? "select" : "unselect", true, true);
      n.querySelector('.radio svg').dispatchEvent(e);
    }

    ea_overlord({
      "type": 'index',
      "target": this.getAttribute('bind'),
      "caller": 'ea_indexes_list'
    });
  };

  for (let t in ea_indexes) {
    let node = i_elem(t, ea_indexes[t]['name'], ea_indexes[t]['description']);

    let ler = node.querySelector('.radio');
    ler.append(ea_svg_radio(t === target));

    node.addEventListener('mouseup', _ => setTimeout(_ => trigger_this.call(node), 10));

    indexes_list.append(node);

    nodes.push(node);
  }
};

function ea_indexes_modal() {
  const c = ce('div');

  for (let i in ea_indexes) {
    const s = ce('section');

    c.append(
      ce('h3', ea_indexes[i]['name']),
      ce('p', ea_indexes[i]['info'])
    );
  }

  ea_modal.set({
    header: "Energy Access Explorer Indexes",
    content: c,
    footer: null
  }).show();
};
