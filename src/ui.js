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
  document.querySelector('#app-loading').style['display'] = bool ? 'block' : 'none';
};

function ea_ui_dataset_loading(ds, bool) {
  const el = document.querySelector(`#controls-${ds.id}`);
  if (!el) return;

  let s = el.querySelector('.loading');

  if (!el)
    return null;

  if (bool && !s) {
    s = elem(`<div class="loading"><div class="spinner"></div></div>`);
    el.append(s);
  }

  else {
    if (s) s.remove();
  }

  return s;
};

function ea_ui_layout_map(bounds) {
  const p = document.querySelector('#playground');

  const ch = window.innerHeight - (
    document.querySelector('nav').clientHeight +
      document.querySelector('#controls-boundaries').clientHeight +
      document.querySelector('.controls-select-container').clientHeight
  );

  document.querySelector('#controls').style['height'] = `${ch}px`;

  let width, height;
  const b = bounds;

  const w = (b[1][0] - b[0][0]);
  const h = (b[1][1] - b[0][1]);

  height = p.clientHeight;

  width = p.clientWidth - p.querySelector('#controls').clientWidth + 10;

  const maparea = document.querySelector('#maparea');
  maparea.style['height'] = height + "px";

  return {
    width: width,
    height: height
  };
};

function ea_ui_views_init() {
  const el = document.querySelector('#views');

  Object.keys(ea_views).forEach(v => {
    const btn = elem(`
<div class="view">
  <div class="view-name">${ea_views[v]['name']}</div>
  <div class="view-description">${ea_views[v]['description']}</div>
</div>
`);

    btn.addEventListener('mouseup', function(e) {
      el.querySelectorAll('.view').forEach(e => e.classList.remove('active'));

      btn.classList.add('active');

      ea_overlord({
        "type": "mode",
        "target": v,
        "caller": "ea_views_init",
      });
    });

    if (location.get_query_param('mode') === v) btn.classList.add('active');

    el.appendChild(btn);
  });
};

function ea_ui_dataset_modal(ds) {
  let content = elem('<div style="display:flex; flex-flow: row nowrap;">');

  let left = elem('<div class="left" style="flex: 1;">')
  let right = elem('<div class="right" style="flex: 0 300px; padding-left: 3em;">')

  content.appendChild(left);
  content.appendChild(right);

  if (ds.metadata.description)
    left.appendChild(elem(`<section>
<h3>Description</h3><pre class="description-text">${ds.metadata.description}</pre>
</section>`));

  if (ds.help && ds.help.why)
    left.appendChild(elem(`<section>
<h3>Why is this dataset used?</h3><pre>${ds.help.why}</pre>
</section>`));

  if (ds.metadata.suggested_citation)
    left.appendChild(elem(`<section>
<h3>Suggested Citation</h3><pre class="description-text">${ds.metadata.suggested_citation}</pre>
</section>`));

  if (ds.metadata.cautions)
    left.appendChild(elem(`<section>
<h3>Cautions</h3><pre class="description-text">${ds.metadata.cautions}</pre>
</section>`));

  if (ds.metadata.download_original_url)
    right.appendChild(elem(`<section>
<a class="download-link" target="_blank" href="${ds.metadata.download_original_url}">Download from Source</a>
</section>`));

  if (ds.metadata.learn_more_url)
    right.appendChild(elem(`<section>
<a class="download-link" target="_blank" href="${ds.metadata.learn_more_url}">Learn More</a>
</section>`));

  if (ds.metadata.sources)
    right.appendChild(elem(`<section>
<h3>Sources</h3><pre class="description-text">${ds.metadata.sources}</pre>
</section>`));

  if (ds.metadata.spatial_resolution)
    right.appendChild(elem(`<section>
<h3>Spatial Resolution</h3>${ds.metadata.spatial_resolution}
</section>`));

  if (ds.metadata.license)
    right.appendChild(elem(`<section>
<h3>License</h3>${ds.metadata.license}
</section>`));

  if (ds.metadata.content_date)
    right.appendChild(elem(`<section>
<h3>Date of Content</h3>${ds.metadata.content_date}
</section>`));

  ea_modal
    .header(ds.name_long)
    .content(content)();
};

function ea_ui_index_modal(i) {
  const titles = {
    "eai": "Energy Access Index",
    "ani": "Assistance Need Index",
    "supply": "The Supply Index",
    "demand": "The Demand Index"
  };

  const infos = {
    "eai": "The Energy Access Index indentifies areas with higher energy demand and supply which are characterized with higher index values. It is an aggregated measure of all selected data sets under both Demand and Supply categories.",
    "ani": "The Assistance Need Index identifies areas where market assistance is needed the most which are characterized with higher index values. It is an aggregated and weighted measure of selected data sets under both Demand and Supply categories indicating high energy demand, low economic activity, and low access to infrastructure and resources.",
    "supply": "The Supply Index identifies areas with higher energy supply which are characterized with higher index values. It is an aggregated and weighted measure of all selected data sets under Resource Availability and Infrastructure.",
    "demand": "The Demand Index identifies areas with higher energy demand which are characterized with higher index values. It is an aggregated and weighted measure of all selected data sets under Demographics and Socio-economic activities."
  };

  ea_modal
    .header(titles[i])
    .content(infos[i])();
};

function ea_ui_modal_setup() {
  window.ea_modal = modal()
    .header_style(`
padding: 1em;
padding-left: 1.3em;
font-size: 1.1em;
background-color: var(--the-green);
color: var(--the-white);
position: relative;
    `)
    .close_style(`
position: absolute;
top: 0.5em;
right: 0.5em;
text-decoration: none;
font-size: 1.4em;
line-height: 1em;
width: 1em;
display: block;
text-align: center;
vertical-align: middle;
color: var(--the-white);
`)
    .main_style(`
background-color: white;
margin: auto;
max-width: 1200px;
width: fit-content;
height: fit-content;
width: -webkit-fit-content;
width: -moz-fit-content;
font-size: 1.2em;
margin-top: 80px;
    `)
    .content_style(`
padding: 1.2em;
    `);
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

/*
 * elem
 *
 * Create a _SINGLE_ HTMLElement from a string and return it.
 *
 * @param "str" string. The HTML.
 *
 * returns an Object with the handled params and their set_ methods.
 */

function elem(str) {
  const d = document.createElement('div');
  d.innerHTML = str;

  return d.firstElementChild;
};
