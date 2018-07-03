function ea_layers_collection() {
  const curr = document.querySelector('#layers-list').children;

  var list = [].map.call(curr, x => x.getAttribute('bind'));

  return ea_datasets_collection
    .filter(d => d.active)
    .sort((a,b) => (list.indexOf(a.id) < list.indexOf(b.id)) ? -1 : 1);
}

function ea_layers_update_map(list) {
  var order = [ea_canvas, ea_map.svg.node()];
  const maparea = document.querySelector('#maparea');

  const raster_id = list
        .find(d => ea_datasets_collection.find(x => x.id === d && x.active && x.raster));

  list
    .filter(x => ea_datasets_collection.find(d => d.id === x && d.features))
    .reverse()
    .forEach(i => ea_map.map.select(`#${i}`).raise());

  if (list.indexOf(raster_id) === 0) order = order.reverse();

  maparea.insertBefore(...order);

  ea_canvas_plot(ea_datasets_collection.find(x => x.id === raster_id));
}

function ea_layer_elem(ds) {
  const d = elem(`
<li bind="${ds.id}"
    class="layers-element">
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
</li>`);

  if (ds.unit) {
    d.querySelector('.layers-element-title')
      .appendChild(elem(`<span class="small">&nbsp;&nbsp;(${ds.unit})</span>`));
  }

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
      ea_map.map.select(`#${ds.id}`).style('opacity', (visible ? 1 : 0))
    }
  });

  d.querySelector('.layer-info').addEventListener('mouseup', (e) => {
    ea_ui_flash('info', "Info:", ds.description);
  });

  return d;
}

function ea_layers_toggle_list(bool) {
  const layers = document.querySelector('#layers');
  const list = layers.querySelector('#layers-list');
  const t = layers.querySelector('.collapse.triangle');

  const eai = document.querySelector('#eai');
  eai.style['display']  = (!bool ? "" : "none");
  list.style['display'] = ( bool ? "" : "none");
  t.innerHTML = ea_ui_collapse_triangle(bool ? 's' : 'n');

  ea_controls_collapse_category(document.querySelector('#supply'), !bool);
  ea_controls_collapse_category(document.querySelector('#demand'), !bool);
}

function ea_layers_update_list() {
  sortable('#layers-list', 'disable');

  const layers = document.querySelector('#layers');
  const list = layers.querySelector('#layers-list');

  const coll = ea_layers_collection();

  list.innerHTML = "";

  if (coll.length) {
    coll.forEach(ds => list.appendChild(ea_layer_elem(ds)));
    sortable('#layers-list', 'enable');
  }

  layers.style['display'] = (coll.length) ? "block" : "none";
}

function ea_layers_init() {
  const layers = document.querySelector('#layers');
  const header = layers.querySelector('#layers-header');
  const list = layers.querySelector('#layers-list');

  header.querySelector('.collapse.triangle')
    .innerHTML = ea_ui_collapse_triangle('s');

  let d;
  ea_layers_toggle_list(d = false);

  header.addEventListener('mouseup', function() {
    d = !d;

    ea_layers_toggle_list(d);

    if (d) {
      ea_layers_update_map([].map.call(
        document.querySelectorAll('li.layers-element'),
        i => i.getAttribute('bind')));
    } else {
      ea_canvas_plot(ea_analysis());
    }
  });

  sortable('#layers-list', {
    items: 'li.layers-element',
    forcePlaceholderSize: true,
    placeholder: '<li class="layers-element-place-holder"></li>',
    handle: '.layers-element-handle',
  })[0]
    .addEventListener(
      'sortupdate',
      (e) => ea_layers_update_map(e.detail.destination.items.map(i => i.getAttribute('bind')))
    )
}
