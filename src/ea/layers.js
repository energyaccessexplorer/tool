async function ea_layers_sort_inputs(list) {
  for (let i of list.slice(0).reverse())
    await DS.named(i).raise();
};

function ea_layers_input_elem(ds) {
  const d = elem(`
<li bind="${ds.id}"
    class="layers-element">
  <div class="layers-element-handle"></div>

  <div class="layers-element-content">
    <div class="layers-element-header">
      <div class="layers-element-title">${ds.name_long}</div>

      <div class="layers-element-controls"></div>
    </div>

    <div class="layers-element-description"></div>
  </div>
</li>`);

  let lec = d.querySelector('.layers-element-controls');

  let dli = elem(`<div class="layer-info">${ea_svg_info()}</div>`);
  dli.addEventListener('mouseup', _ => ea_dataset_modal(ds));

  lec.appendChild(dli);

  function svg_thing(d) {
    let e;
    if (d.polygons) e = d.polygons.symbol_svg;
    else if (!d.polygons && d.heatmap) e = d.color_scale_svg;
    return e;
  }

  let c = d.querySelector('.layers-element-description');

  if (ds.collection) {
    for (let d of ds.configuration.collection) {
      let x = DS.named(d);
      let li = elem('<div class="layers-element-collection">');

      li.appendChild(svg_thing(x))
      li.appendChild(elem(`<div class="layers-element-subheader">${x.name_long}</div>`));

      c.appendChild(li);
    }
  }

  else
    c.appendChild(svg_thing(ds));

  return d;
};

function ea_layers_output_elem(t, v, i, x) {
  const svg = ea_svg_color_steps(_ => {
    return d3.scaleLinear()
      .domain(ea_default_color_domain)
      .range(ea_default_color_stops)
      .clamp(false)
  }, 3);

  const d = elem(`
<li bind="${t}"
    class="layers-element heatmaps-layers">
  <div class="layers-element-radio"></div>

  <div class="layers-element-content">
    <div class="layers-element-header">
      <div class="layers-element-title">
        ${v}
        <div class="layers-element-index-description">${x}</div>
      </div>

      <div class="layers-element-controls"></div>
    </div>

    <div class="layers-element-descriptor">
      <div style="display: flex; justify-content: space-between; padding-right: 0.5em; padding-left: 0.5em;">
        <div class="thing">Low</div>
        <div class="thing">Medium</div>
        <div class="thing">High</div>
      </div>
    </div>
  </div>
</li>`);

  let lec = d.querySelector('.layers-element-controls');
  let dli = elem(`<div class="layer-info">${ea_svg_info(0.75)}</div>`);
  dli.addEventListener('mouseup', _ => ea_index_modal(t));

  lec.appendChild(dli);

  let ler = d.querySelector('.layers-element-radio');
  ler.appendChild(ea_svg_radio(i));

  d.querySelector('.layers-element-descriptor').prepend(svg);

  return d;
};

function ea_layers_outputs(target) {
  let nodes;

  const layers_list = document.querySelector('#layers-list');
  layers_list.innerHTML = "";

  async function trigger_this() {
    let unselect = document.createEvent('HTMLEvents');
    unselect.initEvent("unselect", true, true);

    await nodes.forEach(n => n.querySelector('.layers-element-radio svg').dispatchEvent(unselect));

    ea_overlord({
      "type": 'output',
      "heatmap": this.getAttribute('bind'),
      "caller": 'ea_layers_outputs'
    });
  };

  nodes = Object.keys(ea_indexes).map((t,i) => {
    let node = ea_layers_output_elem(t, ea_indexes[t], t === target, ea_indexes_descriptions[t]);

    node.querySelector('.layers-element-radio svg').addEventListener('mouseup', _ => trigger_this.apply(node));

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
          "layers": e.detail.destination.items.map(i => i.getAttribute('bind')),
          "caller": 'ea_layers_init',
        })
      });
};
