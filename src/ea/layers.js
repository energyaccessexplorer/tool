function ea_layers_dataset_collection() {
  const curr = document.querySelector('#layers-list').children;

  const list = [].map.call(curr, x => x.getAttribute('bind'));

  return ea_datasets_collection
    .filter(d => d.active)
    .sort((a,b) => (list.indexOf(a.id) < list.indexOf(b.id)) ? -1 : 1);
};

function ea_layers_update_datasets(list) {
  const c = ea_datasets_collection;

  list.reverse().forEach(i => {
    let d = c.find(x => x.id === i);

    if (!d.polygons)
      ea_mapbox.moveLayer('canvas-layer', ea_mapbox.first_symbol);
    else
      ea_mapbox.moveLayer(i, ea_mapbox.first_symbol);
  });
};

function ea_layers_dataset_elem(ds) {
  const d = elem(`
<li bind="${ds.id}"
    class="layers-element">
  <div class="layers-element-handle"></div>

  <div class="layers-element-content">
    <div class="layers-element-header">
      <div class="layers-element-title">${ds.name_long}</div>

      <div class="layers-element-controls"></div>
    </div>

    <div class="layers-element-descriptor"></div>
  </div>
</li>`);

  let lec = d.querySelector('.layers-element-controls');

  let dli = elem(`<div class="layer-info">${ea_svg_info()}</div>`);
  dli.addEventListener('mouseup', _ => ea_dataset_modal(ds));

  lec.appendChild(dli);

  if (ds.polygons && ds.polygons.symbol)
    d.querySelector('.layers-element-descriptor').appendChild(ea_svg_symbol(ds.polygons.symbol, ds.id, 36));

  return d;
};

function ea_layers_heatmap_elem(t, v, i) {
  const svg = ea_svg_color_gradient(_ => {
    return d3.scaleLinear()
      .domain(plotty.colorscales[ea_default_color_scheme].positions)
      .range(plotty.colorscales[ea_default_color_scheme].colors)
      .clamp(false)
  });

  const d = elem(`
<li bind="${t}"
    class="layers-element heatmaps-layers">
  <div class="layers-element-radio"></div>

  <div class="layers-element-content">
    <div class="layers-element-header">
      <div class="layers-element-title">${v}</div>

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

function ea_layers_heatmaps(target) {
  let nodes;

  const layers_list = document.querySelector('#layers-list');
  layers_list.innerHTML = "";

  async function trigger_this() {
    let event = document.createEvent('HTMLEvents');
    event.initEvent("unselect", true, true);

    await nodes.forEach(n => n.querySelector('.layers-element-radio svg').dispatchEvent(event));

    ea_overlord({
      type: "heatmap",
      heatmap: this.getAttribute('bind'),
      caller: 'ea_layers_heatmaps'
    });
  };

  nodes = Object.keys(ea_indexes).map((t,i) => {
    let node = ea_layers_heatmap_elem(t, ea_indexes[t], t === target);

    node.addEventListener('mouseup', trigger_this);

    layers_list.appendChild(node);

    return node;
  });
};

function ea_layers_datasets(list) {
  sortable('#layers-list', 'disable');

  const layers = document.querySelector('#layers');
  const layers_list = layers.querySelector('#layers-list');

  const ldc = list.map(i => ea_datasets_collection.find(d => d.id == i));

  layers_list.innerHTML = "";

  ldc.forEach(ds => layers_list.appendChild(ea_layers_dataset_elem(ds)));

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
    items: 'li.layers-element',
    forcePlaceholderSize: true,
    placeholder: '<li class="layers-element-place-holder"></li>',
    handle: '.layers-element-handle',
  })[0]
    .addEventListener(
      'sortupdate',
      (e) => {
        ea_overlord({
          type: "sort",
          layers: e.detail.destination.items.map(i => i.getAttribute('bind')),
          caller: "ea_layers_init",
        })
      });
};
