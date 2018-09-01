function elem(str) {
  const d = document.createElement('div');
  d.innerHTML = str;

  return d.firstElementChild;
};

function fake_download(blob) {
  const a = document.createElement('a');
  document.body.appendChild(a);

  a.style = "display:none;";

  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "ea_download";
  a.click();

  window.URL.revokeObjectURL(url);
};

function ea_ui_collapse_triangle(d) {
  let t;

  switch (d) {
  case 'e':
    t = 'rotate(-45)translate(0,0)';
    break;

  case 's':
    t = 'rotate(45)translate(0,-6)';
    break;

  case 'n':
    t = 'rotate(-135)translate(0,-6)';
    break;

  case 'w':
    t = 'rotate(135)translate(-2,0)';
    break;

  case 'ne':
    t = 'rotate(-90)';
    break;

  case 'se':
    t = '';
    break;

  default:
    throw `ea_ui_collapse_triangle: e, ne, s, se, w. Got ${d}.`;
  }

  return `
<svg width="12px" height="12px" viewBox="0 0 12 12" transform="${t}">
  <polyline points="12,0 12,12 0,12 "/>
</svg>`;
};

function ea_ui_spinner() {
  return elem(`<div class="loading"><div class="spinner"></div></div>`);
};

function ea_ui_app_loading(bool) {
  document.querySelector('#app-loading').style['display'] = bool ? 'block' : 'none';
};

function ea_ui_dataset_loading(ds, bool) {
  const el = document.querySelector(`#controls-${ds.id}`);
  let s;

  if (!el) {
    console.log(`'#controls-${ds.id}' element not found. Returning.`);
    return null;
  }

  if (bool) {
    s = ea_ui_spinner();
    el.append(s);
  }

  else {
    s = el.querySelector('.loading');
    s.remove();
  }

  return s;
};

function ea_layout_map(bounds) {
  const p = document.querySelector('#playground');

  let width, height;
  const b = bounds;

  const w = (b[1][0] - b[0][0]);
  const h = (b[1][1] - b[0][1]);

  width = p.clientWidth -
    (p.querySelector('#controls').clientWidth +
     p.querySelector('#layers').clientWidth) + 10;

  height = h * (width / w);

  const coord_tooltip = document.querySelector('body')
        .appendChild(elem(`<div id="coord-tooltip"></div>`));

  ea_canvas = document.querySelector('canvas#plot');
  ea_canvas.style['width'] = width + "px";
  ea_canvas.style['height'] = height + "px";

  const maparea = document.querySelector('#maparea');
  maparea.style['width'] = width + "px";
  maparea.style['height'] = height + "px";

  const svg = d3.select('#svg-map');
  svg
    .attr('width', width)
    .attr('height', height);

  return {
    width: width,
    height: height
  };
};
