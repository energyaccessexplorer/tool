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

  height = p.clientHeight;

  width = p.clientWidth - p.querySelector('#controls').clientWidth + 10;
  ea_canvas = document.querySelector('canvas#plot');

  const coord_tooltip = document.querySelector('body')
        .appendChild(elem(`<div id="coord-tooltip"></div>`));

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

function ea_dataset_modal(ds) {
  let content = elem('<div style="display:flex; flex-flow: row nowrap;">');

  let left = elem('<div class="left" style="flex: 1;">')
  let right = elem('<div class="right" style="flex: 0 300px; padding-left: 3em;">')

  content.appendChild(left);
  content.appendChild(right);

  if (ds.metadata.description)
    left.appendChild(elem(`<section>
<h3>Description</h3><pre class="description-text">${ds.metadata.description}</pre>
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
<h3>Spatial Resolution</h3><code>${ds.metadata.spatial_resolution}</code>
</section>`));

  if (ds.metadata.license)
    right.appendChild(elem(`<section>
<h3>License</h3><code>${ds.metadata.license}</code>
</section>`));

  if (ds.metadata.content_date)
    right.appendChild(elem(`<section>
<h3>Date of Content</h3><code>${ds.metadata.content_date}</code>
</section>`));

  modal()
    .header(ds.name_long)
    .content(content.outerHTML)();
};

function ea_index_modal(i) {
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

  modal()
    .header(titles[i])
    .content(infos[i])
    .footer('')();
};

function ea_category_help_modal(ds) {
  let content = elem('<div>');

  if (ds.help.why)
    content.appendChild(elem(`<section>
<h3>Why is this dataset?</h3>
<p>${ds.help.why}</p>
</section>`));

  if (ds.help.what)
    content.appendChild(elem(`<section>
<h3>What is this dataset?</h3>
<p>${ds.help.what}</p>
</section>`));

  modal()
    .main_style(`
background-color: white;
margin: auto;
max-width: 1200px;
width: fit-content;
height: fit-content;
width: -webkit-fit-content;
width: -moz-fit-content;
    `)
    .header(ds.name_long)
    .content(content.innerHTML)();
};
