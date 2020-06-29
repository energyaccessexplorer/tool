//TODO: why does this NOT work with out the window.PIES?  'strict' mode?
window.PIES = {
  'population': ea_svg_pie([[0], [0], [0], [0], [0]], 70, 0, ea_analysis_colorscale.stops, null),
  'area': ea_svg_pie([[0], [0], [0], [0], [0]], 70, 0, ea_analysis_colorscale.stops, null),
};

async function graphs(raster) {
  const t = await ea_summary_analyse(raster);
  let g;

  if (g = maybe(t, 'population-density')) {
    g['distribution'].forEach((x,i) => PIES['population']['data'][i].push(x));

    PIES['population'].change(1);

    qs('#population-number').innerHTML = g['total'].toLocaleString() + "&nbsp;" + "people";

    g['distribution'].forEach((x,i) => PIES['population']['data'][i].shift());
  } else {
    const pn = qs('#population-number');
    if (pn) pn.closest('.index-graphs-group').remove();
  }

  if (g = maybe(t, 'area')) {
    g['distribution'].forEach((x,i) => PIES['area']['data'][i].push(x));

    PIES['area'].change(1);

    qs('#area-number').innerHTML = g['total'].toLocaleString() + "&nbsp;" + "km<sup>2</sup>";

    g['distribution'].forEach((x,i) => PIES['area']['data'][i].shift());
  } else {
    const an = qs('#area-number');
    if (an) an.closest('.index-graphs-group').remove();
  }
};

function init() {
  const url = new URL(location);

  const ramp = tmpl("#ramp");
  ramp.append(
    ce('div', "Low"),
    ce('div', "Medium"),
    ce('div', "High")
  );

  const scale = ce('div', null, { class: 'index-graphs-scale' });
  scale.append(ea_analysis_colorscale.svg, ramp);

  const cos = qs('#canvas-output-select');
  for (let i in ea_indexes)
    cos.append(ce('option', ea_indexes[i]['name'], { value: i }));

  cos.value = U.output;
  cos.onchange = x => { O.index = x.target.value };

  const toolbox = qs('#index-graphs-toolbox');

  const info = qs('#index-graphs-info');
  info.append(tmpl('#svg-info'));
  info.onclick = _ => indexes.modal();

  const download = qs('#index-graphs-download');
  download.append(tmpl('#svg-download'));
  download.onclick = _ => raster_to_tiff(url.searchParams.get('output'));

  const code = qs('#index-graphs-code');
  code.append(tmpl('#svg-code'));
  code.onclick = _ => conf();

  qs('#index-graphs').append(el_tree(
    [ ce('div', null, { class: 'index-graphs-container' }), [
      [ ce('div', ce('div', "Area share"), { class: 'index-graphs-group' }),
        [
          ce('div', null, { id: 'area-number', class: 'indexes-pie-label' }),
          PIES['area'].svg
        ]
      ],
      [ ce('div', ce('div', "Population share"), { class: 'index-graphs-group' }),
        [
          ce('div', null, { id: 'population-number', class: 'indexes-pie-label' }),
          PIES['population'].svg
        ]
      ]
    ]]
  ), scale);
};

function list() {
  const nodes = [];

  const indexes_list = qs('#indexes-list');
  elem_empty(indexes_list);

  function i_elem(t, v, x) {
    const d = ce('li',  null, { bind: t, class: 'element', ripple: "" });
    d.append(
      ce('div', null, { class: 'radio' }),
      ce('span', v)
    );

    if (ea_analysis_datasets(t) < 1)
      d.setAttribute('disabled', "");

    return d;
  };

  function trigger_this() {
    if (this.hasAttribute('disabled')) return false;

    let e = document.createEvent('HTMLEvents');

    for (let n of nodes) {
      qs('.radio svg', n).dispatchEvent(new Event((this === n) ? "select" : "unselect"));
    }

    O.index = this.getAttribute('bind');
  };

  for (let t in ea_indexes) {
    let node = i_elem(t, ea_indexes[t]['name'], ea_indexes[t]['description']);

    let ler = qs('.radio', node);
    ler.append(ea_svg_radio(t === U.output));

    node.addEventListener('mouseup', _ => setTimeout(_ => trigger_this.call(node), 10));

    indexes_list.append(node);

    nodes.push(node);
  }
};

function modal() {
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
    footer: elem(`
<a style="text-align: right; display: block;" href="https://www.wri.org/publication/energy-access-explorer-data-and-methods">
  See technical note for more detailed methodology
</a>
`)
  }).show();
};

function conf() {
  const config = {
    geography_id: GEOGRAPHY.id,
    analysis_type: U.output,
    datasets: []
  };

  for (let i of U.inputs) {
    let d = DST.get(i);
    let c = {};

    c.id = d.dataset_id;
    c.category = d.id;
    c.weight = d.weight;
    c.domain = d.domain.map(x => +x);

    config.datasets.push(c);
  }

  let blob = new Blob([JSON.stringify(config)], { type: "application/octet-stream;charset=utf-8" });

  fake_download(URL.createObjectURL(blob), `energyaccessexplorer-${U.output}.json`);

  return config;
};

export {
  init,
  list,
  modal,
  graphs,
};
