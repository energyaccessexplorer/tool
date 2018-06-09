function ea_collapse_triangle(dir) {
  let t;

  switch (dir) {
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
</svg>`
}

function ea_collapse_subcategory(conel, subel) {
  const d = conel.style['display'];
  const c = subel.querySelector('.collapse');

  if (d === "none") {
    conel.style['display'] = 'block';
    c.innerHTML = ea_collapse_triangle('se');
  }

  else {
    conel.style['display'] = 'none';
    c.innerHTML = ea_collapse_triangle('ne');
  }
}

function ea_collapse_category(catel) {
  const subcatel = catel.querySelector('.controls-subcategories');
  const cti = catel.querySelector('.controls-category-title');
  const ctr = catel.querySelector('.collapse.triangle')

  const d = subcatel.style['display'];

  if (d === "none") {
    ctr.innerHTML = ea_collapse_triangle('w');

    // use empty strings so that the CSS can decide
    //
    subcatel.style['display'] = "";
    cti.style['transform'] = "";
    catel.style['padding-right'] = "";
  }

  else {
    ctr.innerHTML = ea_collapse_triangle('s');

    subcatel.style['display'] = 'none';
    cti.style['transform'] = "rotate(-90deg) translate(-2em)";
    catel.style['padding-right'] = "0";
  }
}

function ea_controls_tree() {
  const ctel = document.querySelector('#controls')
  ctel.style['height'] = `calc(${window.innerHeight}px - 6.5em)`;

  ea_datasets_category_tree.forEach(a => {
    const ahtml = `
      <div id=${a.name} class="controls-category">
        <div class="controls-category-title">
          <span class="collapse triangle">${ea_collapse_triangle('w')}</span> ${a.name}
        </div>
        <div class="controls-subcategories"></div>
      </div>
    `;

    ctel.insertAdjacentHTML('beforeend', ahtml);

    const catel = ctel.querySelector(`#${a.name}`);
    const cti = catel.querySelector('.controls-category-title');

    cti.addEventListener('mouseup', e => ea_collapse_category(catel));

    a.subcategories.forEach(b => {
      const bhtml = `
        <div id=${b.name} class="controls-subcategory">
          <div class="controls-subcategory-title">
            ${b.name}
            <span class="collapse">${ea_collapse_triangle('se')}</span>
          </div>
          <div class="controls-container"></div>
        </div>
      `;

      catel.querySelector('.controls-subcategories')
        .insertAdjacentHTML('beforeend', bhtml);

      const subel = catel.querySelector(`#${b.name}`);
      const conel = subel.querySelector('.controls-container');

      subel.querySelector('.controls-subcategory-title')
        .addEventListener('mouseup', e => ea_collapse_subcategory(conel, subel));

      b.datasets.forEach(b => {
        const ds = ea_datasets.find(x => x.id === b);

        if (ds) conel.appendChild(ea_controls(ds));
        else console.warn(`'${b}' dataset not found`);
      });
    });
  });
}

function ea_controls_elem(ds) {
  const controls = document.createElement('div');
  controls.id = `controls-${ds.id}`;
  controls.classList.add('controls');

  const conhead = document.createElement('div');
  conhead.className = "controls-dataset-header";

  conhead.insertAdjacentHTML(
    'beforeend',
    `<span class="controls-dataset-description">${ds.description}&nbsp;</span>`
  );

  if (ds.unit)
    conhead.insertAdjacentHTML(
      'beforeend',
      `<span class="controls-dataset-unit small">(${ds.unit})</span>&nbsp;&nbsp;`
    );

  controls.appendChild(conhead);

  return controls;
}

function ea_controls(ds) {
  const controls = ea_controls_elem(ds);
  controls.querySelector('.controls-dataset-header').appendChild(
    ea_controls_activate(
      ds,
      async function(v) {
        if (v) await ea_dataset_load(ds);
        else {
          if (typeof ds.hide === 'function') ds.hide();
        }

        ea_layers_update_list();

        ea_plot(ea_analysis());
      }
    )
  );

  switch (ds.id) {
  case "ghi":
  case "poverty":
  case "population":
    controls.appendChild(ea_controls_range(ds));
    controls.appendChild(ea_controls_weight(ds));
    break;

  case "transmission-lines":
    controls.appendChild(ea_controls_steps(ds));
    break;

  case "transmission-lines-polygon":
    controls.appendChild(ea_controls_steps(ds));
    break;

  case "schools-distance":
    controls.appendChild(ea_controls_range(ds));
    controls.appendChild(ea_controls_weight(ds));
    break;

  case "crops":
  case "mines":
  case "hydro":
  case "facilities":
  case "powerplants":
    controls.appendChild(ea_controls_empty(ds));
    break;

  default:
    throw `EA Controls: Unknown data id ${ds.id}`;
    break;
  }

  return controls;
}

function ea_controls_activate(ds, callback) {
  return ea_svg_checkbox((s) => callback((ds.active = s)));
}

function ea_controls_range(ds) {
  function update_range_value(x,i,el) {
    el.innerText = domain[i] = range_norm(x).toFixed(2);
    ds.scalefn = () => d3.scaleLinear().domain(domain).range([0,1]).clamp(true);
  }

  const container = document.createElement('div');
  container.className = "control-group";

  const range_norm = d3.scaleLinear().domain([0,1]).range(ds.domain);
  const domain = ds.domain.slice(0);

  const l = document.createElement('div');
  l.className = "label";
  l.innerHTML = `<span class="left" bind="v1"></span> <span bind="v2" class="right"></span>`;  l.style = `
float: right;
display: flex;
justify-content: space-between;
width: 150px;
margin-bottom: 10px;
`;

  const v1 = l.querySelector('[bind=v1]');
  const v2 = l.querySelector('[bind=v2]');

  container.appendChild(
    ea_svg_interval(
      x => update_range_value(x, 0, v1),
      x => update_range_value(x, 1, v2),
      () => ea_plot(ea_analysis()),
    )
  );

  container.appendChild(l);

  return container;
}

function ea_controls_weight(ds) {
  var weights = Array.apply(null, Array(5)).map((_, i) => i + 1)

  const container = document.createElement('div');
  container.className = "control-group";
  container.innerHTML = `<span class="label">weight</span>&nbsp;&nbsp;&nbsp;`;

  const l = document.createElement('div');
  l.className = "label";
  l.style = `
float: right;
display: flex;
justify-content: space-between;
width: 150px;
margin-bottom: 10px;
`;

  l.innerHTML = `<span>${weights[0]}</span><span>${weights[weights.length - 1]}</span>`

  container.appendChild(
    ea_svg_range_steps(
      weights,
      ds.weight,
      null,
      x => {
        ds.weight = x;
        ea_plot(ea_analysis());
      },
      ("weight" === "weight")
    )
  );

  container.appendChild(l);

  return container;
}

function ea_controls_steps(ds) {
  const container = document.createElement('div');
  container.className = "control-group";

  const l = document.createElement('span');
  l.className = "label";
  l.style = `
float: right;
display: flex;
justify-content: space-between;
width: 150px;
margin-bottom: 10px;
`;

  l.innerHTML = `<span></span><span bind="vw"></span>`;

  const w = l.querySelector('[bind=vw]');

  container.appendChild(
    ea_svg_range_steps(
      ds.steps,
      ds.init,
      x => w.innerText = `${x}km`,
      async x => {
        ds.image = ds.raster = null;
        ds.init = x;

        if (!ds.active) return;

        await ea_dataset_load(ds,x);
        ea_plot(ea_analysis());
      },
      ("weight" === false)
    )
  );

  container.appendChild(l);

  return container;
}

function ea_dataset_loading(ds, bool) {
  const el = document.querySelector(`#controls-${ds.id}`);
  let s;

  if (bool) {
    s = ea_spinner();
    el.append(s);
  }

  else if (bool === false) {
    s = el.querySelector('.loading');
    s.remove();
  }

  else {
    throw "Wrong Argument ${bool} for ea_dataset_loading";
  }

  return s;
}

function ea_controls_empty(ds) {
  return document.createElement('div');
}
