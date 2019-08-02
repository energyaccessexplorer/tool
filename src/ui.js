function collapse_triangle(d) {
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
    throw `collapse_triangle: e, ne, s, se, w. Got ${d}.`;
  }

  return `
<svg width="12px" height="12px" viewBox="0 0 12 12" transform="${t}">
  <polyline points="12,0 12,12 0,12 "/>
</svg>`;
};

function elem_collapse(el, t) {
  const d = el.style['display'];
  const c = qs('.collapse', t);

  if (d === "none") {
    el.style['display'] = 'block';
    c.innerHTML = collapse_triangle('s');
  }

  else {
    el.style['display'] = 'none';
    c.innerHTML = collapse_triangle('e');
  }
};

function ea_loading(bool) {
  qs('#app-loading').style['display'] = bool ? 'block' : 'none';
};
