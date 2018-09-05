function ea_layers_dataset_collection() {
  const curr = document.querySelector('#layers-list').children;

  const list = [].map.call(curr, x => x.getAttribute('bind'));

  return ea_datasets_collection
    .filter(d => d.active)
    .sort((a,b) => (list.indexOf(a.id) < list.indexOf(b.id)) ? -1 : 1);
};

function ea_layers_update_datasets(list) {
  let order = [ea_canvas, ea_map.svg.node()];
  const maparea = document.querySelector('#maparea');
  const c = ea_datasets_collection;

  const raster_id = list
        .find(d => c.find(x => x.id === d && x.active && typeof x.polygons === 'undefined'));

  list
    .filter(x => c.find(d => d.id === x && d.features))
    .reverse()
    .forEach(i => ea_map.map.select(`#${i}`).raise());

  if (list.indexOf(raster_id) === 0) order = order.reverse();

  maparea.insertBefore(...order);
};

function ea_layers_dataset_elem(ds) {
  const d = elem(`
<li bind="${ds.id}"
    class="layers-element">
  <div class="layers-element-handle"></div>

  <div class="layers-element-content">
    <div class="layers-element-header">
      <div class="layers-element-title">${ds.name_long}</div>

      <div class="layers-element-controls">
        <div class="layer-type"></div>
        <div class="layer-visibility"></div>
        <div class="layer-info"></div>
      </div>
    </div>

    <div class="layers-element-descriptor"></div>
  </div>
</li>`);

  if (ds.unit) {
    d.querySelector('.layers-element-title')
      .appendChild(elem(`<span class="small">&nbsp;&nbsp;(${ds.unit})</span>`));
  }

  d.querySelector('.layer-type').addEventListener('mouseup', (e) => {
    flash()
      .message("this does something, right?")();
  });

  let visible = true;
  d.querySelector('.layer-visibility').addEventListener('mouseup', (e) => {
    visible = !visible;

    if (ds.raster) {
      ea_canvas.style['opacity'] = (visible ? 1 : 0);
    }

    else if (ds.features) {
      ea_map.map.select(`#${ds.id}`).style('opacity', (visible ? 1 : 0))
    }
  });

  d.querySelector('.layer-info').addEventListener('mouseup', (e) => {
    flash()
      .type('info')
      .message("Info: " + ds.description)();
  });

  if (ds.polygons && ds.polygons.symbol)
    d.querySelector('.layers-element-descriptor').appendChild(ea_svg_symbol(ds.polygons.symbol, ds.id, 36));

  return d;
};

function ea_layers_heatmap_elem(t, v) {
  const svg = ea_svg_color_gradient(_ => {
    return d3.scaleLinear()
      .domain(plotty.colorscales[ea_default_color_scheme].positions)
      .range(plotty.colorscales[ea_default_color_scheme].colors)
      .clamp(false)
  });

  const d = elem(`
<li bind="${t}"
    class="layers-element eai">
  <div class="layers-element-handle"></div>

  <div class="layers-element-content">
    <div class="layers-element-header">
      <div class="layers-element-title">${v}</div>

      <div class="layers-element-controls">
        <div class="layer-type"></div>
        <div class="layer-visibility"></div>
        <div class="layer-info"></div>
      </div>
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

  d.querySelector('.layers-element-descriptor').prepend(svg);

  return d;
};

function ea_layers_heatmaps(list) {
  sortable('#layers-list', 'disable');

  const layers = document.querySelector('#layers');
  const layers_list = layers.querySelector('#layers-list');

  let lhc = {
    "eai": 'Energy Access Index',
    "ani": 'Assistance Need Index',
    "demand": 'Demand Index',
    "supply": 'Supply Index',
  };

  layers_list.innerHTML = "";

  list.forEach((t,i) => layers_list.appendChild(ea_layers_heatmap_elem(t, lhc[t], i)));
  sortable('#layers-list', 'enable');
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

  else if (typeof ldc.find(i => i.polygons) === 'undefined')
    layers_list.appendChild(elem(`<pre ${style}>No layers with polygons selected.</pre>`));

  sortable('#layers-list', 'enable');
};

function ea_layers_init() {
  const layers = document.querySelector('#layers');
  const list = layers.querySelector('#layers-list');

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
