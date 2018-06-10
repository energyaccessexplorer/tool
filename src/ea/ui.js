function ea_ui_collapse_triangle(d) {
  let t;

  switch (d) {
  case 'e':
    t = 'rotate(-45)translate(-2,-4)';
    break;

  case 's':
    t = 'translate(-8,-6)rotate(45)';
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
    throw `ea_collapse_triangle: e, ne, s, se, w. Got ${dir}.`;
  }

  return `
<svg width="12px" height="12px" viewBox="0 0 12 12" transform="${t}">
  <polyline points="12,0 12,12 0,12 "/>
</svg>`;
}

function ea_ui_spinner() {
  var d = document.createElement('div');
  d.classList.add('loading');

  var s = document.createElement('div');
  s.classList.add('spinner');

  d.appendChild(s);

  return d;
}

function ea_ui_app_loading(bool) {
  document.querySelector('#app-loading').style.display = (bool) ? 'block' : 'none';
}

function ea_ui_dataset_loading(ds, bool) {
  const el = document.querySelector(`#controls-${ds.id}`);
  let s;

  if (bool) {
    s = ea_ui_spinner();
    el.append(s);
  }

  else {
    s = el.querySelector('.loading');
    s.remove();
  }

  return s;
}
