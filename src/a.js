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

  const oc = el_tree(
    [ ce('div', null, { id: 'bottom-right-container-output', class: 'bottom-right-container' }), [
      [ ce('select', null, { id: 'canvas-output-select' }) ],
      [ ce('canvas', null, { id: 'output' }) ]
    ]]
  );

  const gc = el_tree(
    [ ce('div', null, { id: 'bottom-right-container-graphs', class: 'bottom-right-container' }), [
      [ ce('h3', null, { id: 'district-header', class: "header" }) ],
      [ ce('div', null, { id: 'district-graph', class: "graphs" }) ]
    ]]
  );

  if (GEOGRAPHY.timeline) {
    qs('#filtered-pane').append(oc);
    qs('#cards-pane').append(gc);
  } else {
    qs('#cards-pane').append(oc);
  }

  document.body.onresize = set_heights;
  set_heights();
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
