/*
 * This file contains the functionality for the layers.
 */

function ea_layers_init() {
  const layers = document.querySelector('#layers');
  const list = layers.querySelector('#layers-list');

  sortable('#layers-list', {
    "items": 'li.layers-element',
    "forcePlaceholderSize": true,
    "placeholder": '<li class="layers-element-place-holder"></li>',
    "handle": '.layers-element-handle',
  })[0]
    .addEventListener(
      'sortupdate',
      e => {
        ea_overlord({
          "type": 'sort',
          "target": e.detail.destination.items.map(i => i.getAttribute('bind')),
          "caller": 'ea_layers_init',
        })
      });
};

function ea_layers_elem(ds) {
  const title = ds.name_long + (ds.unit ? ` (${ ds.unit })` : '');

  const d = elem(`
<li bind="${ds.id}"
    class="layers-element">
  <div class="layers-element-handle">${ea_svg_layer_handle()}</div>

  <div class="layers-element-content">
    <div class="layers-element-header">
      <div class="layers-element-title">${title}</div>

      <div class="layers-element-controls"></div>
    </div>

    <div class="layers-element-details"></div>
  </div>
</li>`);

  let c = d.querySelector('.layers-element-details');
  let lec = d.querySelector('.layers-element-controls');

  if (!ds.vectors && !ds.collection) {
    const loc = ea_layers_opacity_control(ds);
    d.prepend(loc);

    let dlo = elem(`<div class="layer-opacity">${ea_svg_opacity()}</div>`);
    dlo.addEventListener('mouseup', _ => loc.style.display = 'block');

    loc.addEventListener('mouseleave', _ => loc.style.display = 'none');

    lec.append(dlo);
  }

  function svg_thing(d) {
    let e;
    if (d.vectors && (!d.vectors.color_stops || !d.vectors.color_stops.length)) e = d.vectors.symbol_svg;
    if (d.vectors && (d.vectors.color_stops && d.vectors.color_stops.length)) e = d.color_scale_svg;
    else if (!d.vectors && d.heatmap) e = d.color_scale_svg;
    return e;
  };

  if (ds.collection) {
    for (let d of ds.configuration.collection) {
      let x = DS.named(d);
      let li = elem('<div class="layers-element-collection">');

      li.append(svg_thing(x))
      li.append(elem(`<div class="layers-element-subheader">${x.name_long}</div>`));

      c.append(li);
    }
  }

  else {
    c.append(svg_thing(ds));
    if (!ds.vectors && ds.heatmap) c.append(ea_layers_min_max(ds));
    if (ds.vectors && (ds.vectors.color_stops && ds.vectors.color_stops.length)) c.append(ea_layers_0_100(ds));
  }

  return d;
};

function ea_layers_inputs(list) {
  sortable('#layers-list', 'disable');

  const layers = document.querySelector('#layers');
  const layers_list = layers.querySelector('#layers-list');

  const ldc = list.map(i => DS.named(i));

  elem_empty(layers_list);

  ldc.forEach(ds => layers_list.append(ea_layers_elem(ds)));

  if (list.length === 0)
    layers_list.innerHTML = `<code>No layers selected.</code>`;

  sortable('#layers-list', 'enable');
};

async function ea_layers_sort_inputs(list) {
  for (let i of list.slice(0).reverse())
    await DS.named(i).raise();
};

function ea_layers_opacity_control(ds) {
  const e = elem(`<div class="layers-opacity-control"></div>`);

  let opacity = 1;

  const grad = ea_svg_interval(
    true, null, null,
    x => opacity = x,
    _ => ea_mapbox.setPaintProperty(ds.id, 'raster-opacity', parseFloat(opacity))
  );

  e.append(grad.svg);
  e.append(elem(`
<div style="display: flex; justify-content: space-between; padding-right: 0.5em; padding-left: 0.5em; font-size: 0.8em;">
  <span>0%</span>
  <span>Opacity</span>
  <span>100%</span>
</div>`));

  return e;
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
</div>`);
};

function ea_layers_lowmidhigh() {
  return elem(`
<div style="display: flex; justify-content: space-between; padding-right: -0.5em; padding-left: 0.2em;">
  <div>LOW</div>
  <div>MID</div>
  <div>HIGH</div>
</div>`);
};

function ea_layers_min_max(ds) {
  return elem(`
<div style="display: flex; justify-content: space-between; padding-right: 0.2em; padding-left: 0.2em;">
  <div>${ds.heatmap.domain.min * ds.heatmap.factor}</div>
  <div>${ds.heatmap.domain.max * ds.heatmap.factor}</div>
</div>`);
};
