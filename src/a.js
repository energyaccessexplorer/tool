function ea_layout_init() {
  if (maybe(GEOGRAPHY, 'timeline'))
    qs('#visual').append(ce('div', null, { id: 'timeline' }));

  const n = qs('nav');
  const p = qs('#playground');
  const w = qs('#mobile-switcher');

  const m = qs('#maparea', p);
  const b = qs('#mapbox-container', m);
  const v = qs('#views', m);
  const t = qs('#timeline');

  const c = qs('#controls-wrapper', p);
  const r = qs('#right-pane', p);

  const d = qs('#drawer', r);

  function set_heights() {
    const h = window.innerHeight - n.clientHeight - (MOBILE ? w.clientHeight : 0);

    p.style['height'] =
      c.style['height'] =
      m.style['height'] =
      b.style['height'] =
      r.style['height'] = h + "px";

    b.style['height'] = (h - (MOBILE ? v.clientHeight : 0)) + "px";

    if (t) b.style['height'] = m.style['height'] = h - t.clientHeight + "px";
  };

  if (MOBILE) m.style['width'] = screen.width + "px";

  const oc = tmpl('#bottom-right-container-output-template');
  const gc = tmpl('#bottom-right-container-graphs-template');

  if (GEOGRAPHY.timeline) {
    qs('#filtered-pane').append(oc);
    qs('#cards-pane').append(gc);
  } else {
    qs('#cards-pane').append(oc);
  }

  document.body.onresize = set_heights;
  set_heights();
};

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

  function mobile_switch(v) {
    switch (v) {
    case 'controls':{
      for (let e of ['#controls-wrapper'])
        qs(e).style.display = '';

      for (let e of ['#right-pane', '#views'])
        qs(e).style.display = 'none';

      break;
    }

    case 'right': {
      for (let e of ['#controls-wrapper'])
        qs(e).style.display = 'none';

      for (let e of ['#right-pane'])
        qs(e).style.display = '';

      break;
    }

    case 'outputs':
    case 'inputs': {
      for (let e of ['#controls-wrapper'])
        qs(e).style.display = 'none';

      for (let e of ['#right-pane'])
        qs(e).style.display = '';

      U.view = v;

      right_pane();
      ea_views_buttons();
      break;
    }

    case 'map':
    default: {
      for (let e of ['#right-pane', '#controls-wrapper', '#views'])
        qs(e).style.display = 'none';

      for (let e of ['#views'])
        qs(e).style.display = '';

      break;
    }
    }
  };

  for (let e of tabs) {
    e.onclick = function(ev) {
      for (let t of tabs) t.classList.remove('active');

      mobile_switch(this.getAttribute('bind'));
      e.classList.add('active');
    };

    switcher.append(e);
  }

  map.click();
};

/*
 * empty array means it'll be treated as an editable array
 * non-empty arrays mean allowed values (default: first)
 */

function ea_nanny_init() {
  window.ea_nanny = new nanny(ea_nanny_steps);

  if (![null, "inputs"].includes(U.view)) return;
  if (U.inputs.length > 0) return;

  const w = localStorage.getItem('needs-nanny');
  if (!w || !w.match(/false/)) ea_nanny.start();
};

function ea_nanny_force_start() {
  U.params = {
    inputs: [],
    output: 'eai',
    view: 'inputs'
  };

  DS.array.filter(d => d.on).forEach(d => d.active(false, false));

  O.view = 'inputs';
  ea_controls_select_tab(qs('#controls-tab-census'), "census");
  ea_modal.hide();

  O.view = U.view;

  ea_nanny.start();
};

