async function ea_indexes_analyse(raster) {
  const pop = DS.get('population');

  if (!pop) return null;

  await pop.load('heatmap');
  const p = pop.raster;
  const nodata = pop.nodata;

  let a = new Float32Array(raster.length).fill(-1);

  let f = d3.scaleQuantize().domain([0,1]).range(ea_default_color_domain);

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
  const index_graphs = document.querySelector('#index-graphs-container');
  elem_empty(index_graphs);

  const scale = ce('div');

  scale.append(
    ea_svg_color_steps(
      d3.scaleLinear()
        .domain(ea_default_color_domain)
        .range(ea_default_color_stops)
        .clamp(false),
      ea_default_color_domain),
    tmpl("#ramp-label-0-100"));

  const t = await ea_indexes_analyse(raster);

  if (!t) return;

  const ppie = ea_svg_pie(t['population']['distribution'].map(x => [x]), 75, 0, ea_default_color_stops, null);
  const apie = ea_svg_pie(t['area']['distribution'].map(x => [x]), 75, 0, ea_default_color_stops, null);

  ppie.change(0);
  apie.change(0);

  let pe = ce('div', ce('div', "Population share"), { class: 'index-graphs-group' });
  let ae = ce('div', ce('div', "Area share"), { class: 'index-graphs-group' });

  pe.append(ppie.svg);
  ae.append(apie.svg);

  index_graphs.append(ae, pe, scale);
};

function ea_indexes_init(o) {
  const cos = document.querySelector('#canvas-output-select');
  for (let i in ea_indexes)
    cos.append(ce('option', ea_indexes[i]['name'], { value: i }));

  cos.value = o;

  cos.addEventListener('change', function() {
    ea_overlord({
      "type": "index",
      "target": this.value,
      "caller": "ea_indexes_init select"
    });
  });

  document.querySelector('#index-graphs-info').append(tmpl('#svg-info'));
  document.querySelector('#index-graphs-info').addEventListener('mouseup', _ => ea_indexes_modal());
};

function ea_indexes_list(target) {
  let nodes;

  const indexes_list = document.querySelector('#indexes-list');
  elem_empty(indexes_list);

  function i_elem(t, v, x) {
    const d = ce('li',  null, { bind: t, class: 'element', ripple: "" });
    d.append(
      ce('div', null, { class: 'radio' }),
      ce('span', v)
    );

    return d;
  };

  function trigger_this() {
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

  nodes = Object.keys(ea_indexes).map((t,i) => {
    let node = i_elem(t, ea_indexes[t]['name'], ea_indexes[t]['description']);

    let ler = node.querySelector('.radio');
    ler.append(ea_svg_radio(t === target));

    node.addEventListener('mouseup', _ => setTimeout(_ => trigger_this.call(node), 10));

    indexes_list.append(node);

    return node;
  });
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
