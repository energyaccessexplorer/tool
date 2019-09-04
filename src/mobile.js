function ea_mobile_init() {
  ea_controls_select_tab(qs('#controls-tab-all'), "all");

  for (let el of qsa('.controls-subbranch')) {
    elem_collapse(qs('.controls-container', el), el);
  }

  const switcher = qs('#mobile-switcher');

  const controls = ce('div', tmpl('#svg-controls'), { bind: 'controls', ripple: "" });
  const map = ce('div', tmpl('#svg-map'), { bind: 'map', ripple: "" });
  const inputs = ce('div', tmpl('#svg-list'), { bind: 'inputs', ripple: "" });
  const outputs = ce('div', tmpl('#svg-pie'), { bind: 'outputs', ripple: "" });

  const tabs = [controls, map, inputs, outputs];

  for (let e of tabs) {
    e.onclick = function(ev) {
      for (let t of tabs) t.classList.remove('active');

      ea_mobile_switch(this.getAttribute('bind'));
      e.classList.add('active');
    };

    switcher.append(e);
  }

  map.click();
};

function ea_mobile_switch(v) {
  switch (v) {
  case 'controls':
    for (let e of ['#controls-wrapper'])
      qs(e).style.display = '';

    for (let e of ['#right-pane', '#views'])
      qs(e).style.display = 'none';

    break;

  case 'right':
    for (let e of ['#controls-wrapper'])
      qs(e).style.display = 'none';

    for (let e of ['#right-pane'])
      qs(e).style.display = '';

    break;

  case 'outputs':
  case 'inputs':
    for (let e of ['#controls-wrapper'])
      qs(e).style.display = 'none';

    for (let e of ['#right-pane'])
      qs(e).style.display = '';

    ea_view(v);
    break;

  default:
  case 'map':
    for (let e of ['#right-pane', '#controls-wrapper', '#views'])
      qs(e).style.display = 'none';

    for (let e of ['#views'])
      qs(e).style.display = '';

    break;
  }
};
