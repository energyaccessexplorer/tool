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

function ea_ui_app_loading(bool) {
  qs('#app-loading').style['display'] = bool ? 'block' : 'none';
};

function ea_ui_layout() {
  const n = qs('nav');
  const p = qs('#playground');
  const m = qs('#maparea', p);
  const c = qs('#controls-wrapper', p);
  const r = qs('#right-pane', p);
  const o = qs('#canvas-output-container', r);
  const d = qs('#drawer', r);
  const l = qs('#inputs-list', r);

  function set_heights() {
    p.style['height'] =
      c.style['height'] =
      m.style['height'] =
      window.innerHeight - n.clientHeight + "px";

    l.style['height'] = p.clientHeight - (o.clientHeight + d.clientHeight + 4) + "px";
  };

  document.body.onresize = set_heights;

  set_heights();
};

function ea_ui_views_init() {
  const el = qs('#views');

  Object.keys(ea_views).forEach(v => {
    const btn = ce('div', ce('div', ea_views[v]['name'], { class: 'view-name' }), { class: 'view', ripple: "" });

    btn.addEventListener('mouseup', function(e) {
      qsa('.view', el).forEach(e => e.classList.remove('active'));

      setTimeout(_ => {
        ea_overlord({
          "type": "mode",
          "target": v,
          "caller": "ea_views_init",
        });

        btn.classList.add('active');
      }, 50);
    });

    if (location.get_query_param('mode') === v) btn.classList.add('active');

    el.append(btn);
  });
};

function ea_ui_dataset_modal(ds) {
  const b = ds.metadata;
  b['why'] = ds.category.metadata.why;

  const content = tmpl('#ds-info-modal', b);
  qs('#metadata-sources', content).href = ds.metadata.download_original_url;
  qs('#learn-more', content).href = ds.metadata.learn_more_url;

  ea_modal.set({
    header: ds.name,
    content: content,
    footer: null
  }).show();
};

function ea_ui_flash_setup() {
  window.ea_flash = flash()
    .style(`
color: white !important;
position: fixed;
top: 7px;
left: 7px;
z-index: 9999;
display: none;
padding: 10px 20px;
border: 1px solid white;
`);
};

function ea_help() {
  const hm = qs('[bind=help-message]').cloneNode(true);
  hm.style.display = 'block';

  ea_modal.set({
    header: "Help",
    content: hm,
    footer: null
  }).show();
};

function elem_collapse(el, t) {
  const d = el.style['display'];
  const c = qs('.collapse', t);

  if (d === "none") {
    el.style['display'] = 'block';
    c.innerHTML = ea_ui_collapse_triangle('s');
  }

  else {
    el.style['display'] = 'none';
    c.innerHTML = ea_ui_collapse_triangle('e');
  }
};
