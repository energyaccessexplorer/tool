async function ea_indexes_graphs(raster) {
  const t = await ea_summary_analyse(raster);

  if (!t) return;

  t['population']['distribution']
    .forEach((x,i) => POPULATION_PIE['data'][i].push(x));

  t['area']['distribution']
    .forEach((x,i) => AREA_PIE['data'][i].push(x));

  POPULATION_PIE.change(1);
  AREA_PIE.change(1);

  qs('#population-number').innerHTML = t['population']['total'].toLocaleString() + "&nbsp;" + "people";
  qs('#area-number').innerHTML = t['area']['total'].toLocaleString() + "&nbsp;" + "km<sup>2</sup>";

  t['population']['distribution'].forEach((x,i) => POPULATION_PIE['data'][i].shift());
  t['area']['distribution'].forEach((x,i) => AREA_PIE['data'][i].shift());
};

function ea_indexes_init(state) {
  const ramp = tmpl("#ramp");
  ramp.append(
    ce('div', "Low"),
    ce('div', "Medium"),
    ce('div', "High")
  );

  const scale = ce('div', null, { class: 'index-graphs-scale' });
  scale.append(
    ea_svg_color_steps(
      d3.scaleLinear()
        .domain(ea_analysis_colorscale.domain)
        .range(ea_analysis_colorscale.stops)
        .clamp(false),
      ea_analysis_colorscale.domain),
    ramp);

  const cos = qs('#canvas-output-select');
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

  const info = qs('#index-graphs-info');
  info.append(tmpl('#svg-info'));
  info.onclick = _ => ea_indexes_modal();

  window.POPULATION_PIE = ea_svg_pie([[0], [0], [0], [0], [0]], 70, 0, ea_analysis_colorscale.stops, null);
  window.AREA_PIE = ea_svg_pie([[0], [0], [0], [0], [0]], 70, 0, ea_analysis_colorscale.stops, null);

  qs('#index-graphs').append(el_tree(
    [ ce('div', null, { class: 'index-graphs-container' }), [
      [ ce('div', ce('div', "Area share"), { class: 'index-graphs-group' }),
        [
          ce('div', null, { id: 'area-number', class: 'indexes-pie-label' }),
          AREA_PIE.svg
        ]
      ],
      [ ce('div', ce('div', "Population share"), { class: 'index-graphs-group' }),
        [
          ce('div', null, { id: 'population-number', class: 'indexes-pie-label' }),
          POPULATION_PIE.svg
        ]
      ]
    ]]
  ), scale);
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

  const indexes_list = qs('#indexes-list');
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
      qs('.radio svg', n).dispatchEvent(new Event((this === n) ? "select" : "unselect"));
    }

    ea_overlord({
      "type": 'index',
      "target": this.getAttribute('bind'),
      "caller": 'ea_indexes_list'
    });
  };

  for (let t in ea_indexes) {
    let node = i_elem(t, ea_indexes[t]['name'], ea_indexes[t]['description']);

    let ler = qs('.radio', node);
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
