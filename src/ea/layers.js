async function ea_layers_sort_inputs(list) {
  for (let i of list.slice(0).reverse())
    await DS.named(i).raise();
};

function ea_layers_elem(bind, cls, title) {
  return elem(`
<li bind="${bind}"
    class="layers-element ${cls}">

  <div class="layers-element-content">
    <div class="layers-element-header">
      <div class="layers-element-title">${title}</div>

      <div class="layers-element-controls"></div>
    </div>

    <div class="layers-element-description"></div>
  </div>
</li>`);
};

function ea_layers_0_100() {
  return elem(`
<div style="display: flex; justify-content: space-between; margin-right: -0.5em; padding-left: 0.2em;">
  <div>0</div>
  <div>20</div>
  <div>40</div>
  <div>60</div>
  <div>80</div>
  <div>100</div>
</div>
`);
};

function ea_layers_lowmidhigh() {
  return elem(`
<div style="display: flex; justify-content: space-between; padding-right: -0.5em; padding-left: 0.2em;">
  <div>LOW</div>
  <div>MID</div>
  <div>HIGH</div>
</div>
`);
};

function ea_layers_min_max(ds) {
  return elem(`
<div style="display: flex; justify-content: space-between; padding-right: 0.2em; padding-left: 0.2em;">
  <div>${ds.heatmap.domain.min}</div>
  <div>${ds.heatmap.domain.max}</div>
</div>
`);
};

function ea_layers_opacity_control(ds) {
  const e = elem(`<div class="layers-opacity-control"></div>`);

  let csf = _ => {
    return d3.scaleLinear()
      .clamp(false)
      .range([getComputedStyle(document.body).getPropertyValue('--the-green')]);
  };

  let opacity = 1;

  const grad = ea_svg_interval_thingradient(
    csf, true, null, null,
    x => opacity = x,
    _ => ea_mapbox.setPaintProperty(ds.id, 'raster-opacity', parseFloat(opacity))
  );

  e.appendChild(grad.svg);
  e.appendChild(elem(`
<div style="display: flex; justify-content: space-between; padding-right: 0.5em; padding-left: 0.5em; font-size: 0.8em;">
  <span>0%</span>
  <span>Opacity</span>
  <span>100%</span>
</div>`));

  return e;
};

function ea_layers_input_elem(ds) {
  const d = ea_layers_elem(ds.id, '', ds.name_long + (ds.unit ? ` (${ ds.unit })` : ''));

  d.prepend(elem('<div class="layers-element-handle"></div>'));

  let c = d.querySelector('.layers-element-description');
  let lec = d.querySelector('.layers-element-controls');

  if (!ds.vectors && !ds.collection) {
    const loc = ea_layers_opacity_control(ds);
    d.prepend(loc);

    let dlo = elem(`<div class="layer-opacity">${ea_svg_opacity()}</div>`);
    dlo.addEventListener('mouseup', _ => loc.style.display = 'block');

    loc.addEventListener('mouseleave', _ => loc.style.display = 'none');

    lec.appendChild(dlo);
  }

  let dli = elem(`<div class="layer-info">${ea_svg_info()}</div>`);
  dli.addEventListener('mouseup', _ => ea_dataset_modal(ds));

  lec.appendChild(dli);

  function svg_thing(d) {
    let e;
    if (d.vectors) e = d.vectors.symbol_svg;
    else if (!d.vectors && d.heatmap) e = d.color_scale_svg;
    return e;
  };

  if (ds.collection) {
    for (let d of ds.configuration.collection) {
      let x = DS.named(d);
      let li = elem('<div class="layers-element-collection">');

      li.appendChild(svg_thing(x))
      li.appendChild(elem(`<div class="layers-element-subheader">${x.name_long}</div>`));

      c.appendChild(li);
    }
  }

  else {
    c.appendChild(svg_thing(ds));
    if (!ds.vectors && ds.heatmap) c.appendChild(ea_layers_min_max(ds));
  }

  return d;
};

function ea_layers_output_elem(t, v, i, x) {
  const d = ea_layers_elem(t, 'outputs-layers', v);

  d.prepend(elem('<div class="layers-element-radio"></div>'))

  d.querySelector('.layers-element-title')
    .append(elem(`<span><span>&nbsp;&nbsp;</span><span class="layers-element-index-description">${x}</span></span>`))

  let c = d.querySelector('.layers-element-description');
  let lec = d.querySelector('.layers-element-controls');

  lec.appendChild(elem('<div class="layers-element-useless">What does this mean?</div>'));

  let dli = elem(`<div class="layer-info">${ea_svg_info()}</div>`);
  dli.addEventListener('mouseup', _ => ea_index_modal(t));

  lec.appendChild(dli);

  c.append(ea_layers_0_100());
  c.prepend(ea_svg_color_steps(_ => {
    return d3.scaleLinear()
      .domain(ea_default_color_domain)
      .range(ea_default_color_stops)
      .clamp(false)
  }, 3));

  return d;
};

function ea_layers_outputs(target) {
  let nodes;

  const layers_list = document.querySelector('#layers-list');
  layers_list.innerHTML = "";

  function trigger_this() {
    let e = document.createEvent('HTMLEvents');

    for (n of nodes) {
      e.initEvent((this === n) ? "select" : "unselect", true, true);
      n.querySelector('.layers-element-radio svg').dispatchEvent(e);
    }

    ea_overlord({
      "type": 'index',
      "target": this.getAttribute('bind'),
      "caller": 'ea_layers_outputs'
    });
  };

  nodes = Object.keys(ea_indexes).map((t,i) => {
    let node = ea_layers_output_elem(t, ea_indexes[t], t === target, ea_indexes_descriptions[t]);

    let ler = node.querySelector('.layers-element-radio');
    ler.appendChild(ea_svg_radio(t === target));

    node.querySelector('.layers-element-radio svg').addEventListener('mouseup', _ => trigger_this.call(node));
    node.querySelector('.layers-element-title').addEventListener('mouseup', _ => trigger_this.call(node));

    layers_list.appendChild(node);

    return node;
  });
};

function ea_layers_inputs(list) {
  sortable('#layers-list', 'disable');

  const layers = document.querySelector('#layers');
  const layers_list = layers.querySelector('#layers-list');

  const ldc = list.map(i => DS.named(i));

  layers_list.innerHTML = "";

  ldc.forEach(ds => layers_list.appendChild(ea_layers_input_elem(ds)));

  const style = 'style="font-size: smaller; text-align: center;"';

  if (list.length === 0)
    layers_list.innerHTML = `<pre ${style}>No layers selected.</pre>`;

  sortable('#layers-list', 'enable');
};

function ea_layers_init() {
  const layers = document.querySelector('#layers');
  const list = layers.querySelector('#layers-list');

  const min_arrow = elem(`
<div style="display: flex; justify-content: flex-end;">
  <div style="background-color: rgba(0,0,0,0.7); padding: 0.2em 0.4em; color: white; fill: white; cursor: pointer;">${ea_svg_arrow()}</div>
</div>
`);

  let v = true;

  min_arrow.addEventListener('mouseup', function(e) {
    v = !v;
    list.style.display = v ? '' : 'none';
    min_arrow.style.transform = v ? "scale(1, 1)" : "scale(1, -1)";
  });

  layers.prepend(min_arrow);

  sortable('#layers-list', {
    "items": 'li.layers-element',
    "forcePlaceholderSize": true,
    "placeholder": '<li class="layers-element-place-holder"></li>',
    "handle": '.layers-element-handle',
  })[0]
    .addEventListener(
      'sortupdate',
      (e) => {
        ea_overlord({
          "type": 'sort',
          "target": e.detail.destination.items.map(i => i.getAttribute('bind')),
          "caller": 'ea_layers_init',
        })
      });
};
