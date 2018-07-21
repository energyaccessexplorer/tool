function ea_controls_collapse_subcategory(conel, subel) {
  const d = conel.style['display'];
  const c = subel.querySelector('.collapse');

  if (d === "none") {
    conel.style['display'] = 'block';
    c.innerHTML = ea_ui_collapse_triangle('se');
  }

  else {
    conel.style['display'] = 'none';
    c.innerHTML = ea_ui_collapse_triangle('ne');
  }
}

function ea_controls_collapse_category(catel, show) {
  if (!catel) {
    console.warn(`ea_controls_collapse_category: catel is ${catel}. Return.`);
    return;
  }

  const subcatel = catel.querySelector('.controls-subcategories');
  const cti = catel.querySelector('.controls-category-title');
  const ctr = catel.querySelector('.collapse.triangle')

  let d = (subcatel.style['display'] === "none");

  if (typeof show !== 'undefined') d = show;

  if (d) {
    ctr.innerHTML = ea_ui_collapse_triangle('w');

    // use empty strings so that the CSS can decide
    //
    subcatel.style['display'] = "";
    cti.style['transform'] = "";
    catel.style['padding-right'] = "";
  }

  else {
    ctr.innerHTML = ea_ui_collapse_triangle('s');

    subcatel.style['display'] = 'none';
    cti.style['transform'] = "rotate(-90deg) translate(-2em)";
    catel.style['padding-right'] = "0";
  }
}

function ea_controls_tree(tree, collection) {
  const ctel = document.querySelector('#controls')
  ctel.style['height'] = `calc(${window.innerHeight}px - 3.5em)`;

  tree.forEach(a => {
    ctel.appendChild(elem(`
<div id=${a.name} class="controls-category">
  <div class="controls-category-title">
    <span class="collapse triangle">${ea_ui_collapse_triangle('w')}</span> ${a.name}
  </div>
  <div class="controls-subcategories"></div>
</div>`));

    const catel = ctel.querySelector(`#${a.name}`);
    const cti = catel.querySelector('.controls-category-title');

    cti.addEventListener('mouseup', e => ea_controls_collapse_category(catel));

    a.subcategories.forEach(b => {
      catel.querySelector('.controls-subcategories')
        .appendChild(elem(`
<div id=${b.name} class="controls-subcategory">
  <div class="controls-subcategory-title">
    ${b.name}
    <span class="collapse">${ea_ui_collapse_triangle('se')}</span>
  </div>
  <div class="controls-container"></div>
</div>`));

      const subel = catel.querySelector(`#${b.name}`);
      const conel = subel.querySelector('.controls-container');

      subel.querySelector('.controls-subcategory-title')
        .addEventListener('mouseup', e => ea_controls_collapse_subcategory(conel, subel));

      b.datasets.forEach(b => {
        const ds = collection.find(x => x.id === b.id);

        if (ds) conel.appendChild(ea_controls(ds));
        else console.warn(`'${b.id}' dataset not found`);
      });
    });
  });
}

function ea_controls_elem(ds) {
  const controls = elem(`
<div id="controls-${ds.id}" class="controls">
  <div class="controls-dataset-header">
    <span class="controls-dataset-description">${ds.description}</span>
  </div>
</div>`);

  if (ds.unit) {
    controls.querySelector('.controls-dataset-header')
      .appendChild(elem(`<span class="controls-dataset-unit small">(${ds.unit})</span>`));
  }

  return controls;
}

function ea_controls(ds) {
  const controls = ea_controls_elem(ds);

  controls.querySelector('.controls-dataset-header').appendChild(
    ea_controls_active(
      ds.active,
      (v) => ea_datasets_active(ds,v)
    )
  );

  switch (ds.id) {
  case "ghi":
  case "poverty":
  case "population":
  case 'windspeed':
  case "livestock":
  case 'mobile':
  case 'ironrooftop':
  case 'radio':
  case 'nighttime-lights':
    controls.appendChild(ea_controls_range(ds));
    controls.appendChild(ea_controls_weight(ds));
    break;

  case "transmission-lines":
    controls.appendChild(ea_controls_steps(ds));
    break;

  case "transmission-lines-polygon":
    controls.appendChild(ea_controls_steps(ds));
    break;

  case "schools":
  case "minigrids":
  case "crops":
  case "mines":
  case "hydro":
  case "facilities":
  case "powerplants":
    controls.appendChild(ea_controls_range(ds));
    controls.appendChild(ea_controls_weight(ds));
    break;

  default:
    throw `EA Controls: Unknown data id ${ds.id}`;
    break;
  }

  return controls;
}

function ea_controls_active(active, callback) {
  return ea_svg_checkbox(active, callback);
}

function ea_controls_range(ds) {
  function update_range_value(x,i,el) {
    el.innerText = domain[i] = range_norm(x).toFixed(2);
    ds.tmp_domain = domain;
  }

  const container = elem(`<div class="controls-group"></div>`);
  const d = ds.views.heatmaps.domain

  const range_norm = d3.scaleLinear().domain([0,1]).range(d);
  const domain = d.slice(0);

  const l = elem(`
<div class="label">
  <span bind="v1"></span>
  <span bind="v2"></span>
</div>`);

  const v1 = l.querySelector('[bind=v1]');
  const v2 = l.querySelector('[bind=v2]');

  container.appendChild(
    ea_svg_interval(
      ds.color_scale_fn,
      x => update_range_value(x, 0, v1),
      x => update_range_value(x, 1, v2),
      _ => ea_overlord({
        type: "dataset",
        target: ds,
      })
    )
  );

  container.appendChild(elem('<br>'));

  container.appendChild(l);

  return container;
}

function ea_controls_weight(ds) {
  const weights = Array.apply(null, Array(5)).map((_, i) => i + 1);

  const container = elem(`
<div class="control-group">
  <span class="weight-label">weight</span>
</div>`);

  const l = elem(`
<div class="label">
  <span>${weights[0]}</span>
  <span>${weights[weights.length - 1]}</span>
</div>`);

  container.appendChild(
    ea_svg_range_steps(
      weights,
      ds.weight,
      null,
      x => {
        ds.weight = x;

        ea_overlord({
          type: "dataset",
          target: ds,
        });
      },
      ("weight" === "weight")
    )
  );

  container.appendChild(elem('<br>'));

  container.appendChild(l);

  return container;
}

function ea_controls_steps(ds) {
  const container = elem(`<div class="control-group"></div>`);

  const l = elem(`
<div class="label">
  <span></span>
  <span bind="vw"></span>
</div>`);

  const w = l.querySelector('[bind=vw]');

  container.appendChild(
    ea_svg_range_steps(
      ds.steps,
      ds.init,
      x => w.innerText = `${x}km`,
      async x => {
        ds.image = ds.raster = null;
        if (!ds.active) return;

        await ea_datasets_load(ds, (ds.init = x));

        ea_overlord({
          type: "dataset",
          target: ds,
        });
      },
      ("weight" === false)
    )
  );

  container.appendChild(elem('<br>'));

  container.appendChild(l);

  return container;
}
