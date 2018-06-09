function ea_layers_collection() {
  const curr = document.querySelector('#layers').children;

  var list = [].map.call(curr, x => x.getAttribute('bind'));

  return ea_datasets
    .filter(d => d.active)
    .sort((a,b) => (list.indexOf(a.id) < list.indexOf(b.id)) ? -1 : 1)
}

function ea_layers_update_map(list) {
  const raster_id = list
        .find(d => ea_datasets.find(x => x.id === d && x.active && x.raster));

  list
    .filter(x => ea_datasets.find(d => d.id === x && d.features))
    .reverse()
    .forEach(i => ea_globe.svg.select(`#${i}`).raise());

  ea_globe.svg.select(`#mask`).raise();

  ea_plot(ea_datasets.find(x => x.id === raster_id));
}

function ea_layer_elem(ds) {
  const d = document.createElement('li');
  d.setAttribute('bind', ds.id);
  d.className = "layers-element";

  d.innerHTML = `
<div class="layers-element-handle"></div>

<div class="layers-element-content">
  <div class="layers-element-header">
    <div class="layers-element-title">${ds.description}</div>
  </div>

  <div class="layers-element-descriptor"></div>
</div>
`;

  if (ds.unit)
    d.querySelector('.layers-element-title').insertAdjacentHTML(
      'beforeend',
      `&nbsp;<span class="small">(${ds.unit})</span>`
    );

  return d;
}

function ea_layers_update_list() {
  sortable('#layers', 'disable');

  const coll = ea_layers_collection();
  const el = document.querySelector('#layers');
  el.innerHTML = "";

  coll.forEach(ds => el.appendChild(ea_layer_elem(ds)));

  sortable('#layers', 'enable');
}

function ea_layers_init() {
  const coll = ea_layers_collection();

  sortable('#layers', {
    items: '.layers-element',
    forcePlaceholderSize: true,
    placeholder: '<li style="background-color: rgba(0,0,0,0.3);"></li>',
    handle: '.layers-element-handle',
  })[0]
    .addEventListener(
      'sortupdate',
      (e) => ea_layers_update_map(e.detail.destination.items.map(i => i.getAttribute('bind')))
    )

  return coll;
}
