function ea_layers_collection() {
  const curr = document.querySelector('#layers-list').children;

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
    .forEach(i => ea_map.svg.select(`#${i}`).raise());

  ea_map.svg.select(`#mask`).raise();

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

    <div class="layers-element-controls">
      <div class="layer-type"></div>
      <div class="layer-visibility"></div>
      <div class="layer-info"></div>
    </div>
  </div>

  <div class="layers-element-descriptor"></div>
</div>
`;

  if (ds.unit)
    d.querySelector('.layers-element-title').insertAdjacentHTML(
      'beforeend',
      `&nbsp;<span class="small">(${ds.unit})</span>`
    );

  d.querySelector('.layer-type').addEventListener('mouseup', (e) => {
    ea_ui_flash(null, "this does something, right?");
  });

  let visible = true;
  d.querySelector('.layer-visibility').addEventListener('mouseup', (e) => {
    visible = !visible;

    if (ds.raster) {
      ea_canvas.style['opacity'] = (visible ? 1 : 0);
    }

    else if (ds.features) {
      ea_map.svg.select(`#${ds.id}`).style('opacity', (visible ? 1 : 0))
    }
  });

  d.querySelector('.layer-info').addEventListener('mouseup', (e) => {
    ea_ui_flash('info', "Info:", ds.description);
  });

  return d;
}

function ea_layers_update_list() {
  sortable('#layers-list', 'disable');

  const parent = document.querySelector('#layers');
  const el = parent.querySelector('#layers-list');

  const coll = ea_layers_collection();
  const t = parent.querySelector('.collapse.triangle');

  el.innerHTML = "";

  let d = true;

  if (coll.length) {
    parent.style['display'] = "block";

    parent.querySelector('.layers-header').addEventListener('mouseup', function() {
      d = !d;

      el.style['display'] = (d ? "" : "none");

      t.innerHTML = ea_ui_collapse_triangle(d ? 's' : 'n');
    });

    coll.forEach(ds => el.appendChild(ea_layer_elem(ds)));

    sortable('#layers-list', 'enable');
  } else {
    d = false;
    parent.style['display'] = "none";
  }
}

function ea_layers_init() {
  const el = document.querySelector('#layers');

  el.insertAdjacentHTML(
    'afterBegin',
    `
<div class="layers-header">
Underlying Datasets
<div class="collapse triangle">${ea_ui_collapse_triangle('s')}</div>
</div>
`);

  sortable('#layers-list', {
    items: 'li.layers-element',
    forcePlaceholderSize: true,
    placeholder: '<li style="background-color: rgba(0,0,0,0.3);"></li>',
    handle: '.layers-element-handle',
  })[0]
    .addEventListener(
      'sortupdate',
      (e) => ea_layers_update_map(e.detail.destination.items.map(i => i.getAttribute('bind')))
    )

  return el;
}
