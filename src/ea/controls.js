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
};

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
    catel.style['padding-right'] = "0";
  }
};

function ea_controls_tree(tree, collection) {
  const ctel = document.querySelector('#controls')
  const height = window.innerHeight - (
    document.querySelector('nav').clientHeight +
    document.querySelector('#controls-preset').clientHeight
  );

  ctel.style['height'] = `${height}px`;

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
    <span class="collapse triangle">${ea_ui_collapse_triangle('se')}</span>
  </div>
  <div class="controls-container"></div>
</div>`));

      const subel = catel.querySelector(`#${b.name}`);
      const conel = subel.querySelector('.controls-container');

      subel.querySelector('.controls-subcategory-title')
        .addEventListener('mouseup', e => ea_controls_collapse_subcategory(conel, subel));

      b.datasets.forEach(b => {
        const ds = collection.find(x => x.id === b.id);

        if (ds) {
          conel.appendChild(ea_controls(ds));
        }
        else {
          console.warn(`'${b.id}' dataset not found.`);
        }
      });
    });
  });
};

function ea_controls_mutant_options(ds) {
  const container = elem(`<div class="control-option"></div>`);
  const select = elem('<select></select>');

  ds.metadata.mutant_targets.forEach(o => {
    const host = ea_datasets_collection.find(x => x.id === o);
    select.appendChild(elem(`<option value=${o}>${host.description}</option>`));
  });

  select.value = ds.metadata.mutant_targets[0];

  select.addEventListener('change', async function() {
    const host = ea_datasets_collection.find(x => x.id === this.value);

    ds.raster = undefined;
    ds.polygons = undefined;
    ds.heatmap = undefined;
    ds.height = undefined;
    ds.width = undefined;
    ds.image = undefined;
    ds.tiff = undefined;

    ds.polygons = host.polygons;
    ds.heatmap = host.heatmap;

    await host.heatmap.parse.call(host);
    ds.color_scale_svg = ea_svg_color_gradient(ds.color_scale_fn);

    ds.raster = host.raster;
    ds.image = host.image;

    ea_datasets_active(ds, true);
  });

  container.appendChild(select);
  container.appendChild(elem('<div>&nbsp;</div>')); // TODO: remove this.

  return container;
};

function ea_controls_elem(ds) {
  const controls = elem(`
<div id="controls-${ds.id}" class="controls">
  <div class="controls-dataset-header"></div>
  <div class="controls-dataset-content"></div>
</div>`);

  const header = controls.querySelector('.controls-dataset-header');

  let button;

  header.appendChild(
    button = ea_controls_active(
      ds,
      (v) => ea_datasets_active(ds,v)
    )
  );

  header.addEventListener('mouseup', function(e) {
    if (e.target.closest('svg') !== button) {
      let event = document.createEvent('HTMLEvents');
      event.initEvent('click', true, true);

      button.dispatchEvent(event);
    }
  });

  header.appendChild(elem(`<span class="controls-dataset-description">${ds.description}</span>`));

  if (ds.unit) {
    header
      .appendChild(elem(`<span class="controls-dataset-unit small">(${ds.unit})</span>`));
  }

  return controls;
};

function ea_controls(ds) {
  const _controls = ea_controls_elem(ds);
  const controls = _controls.querySelector('.controls-dataset-content');

  controls.style['display'] = ds.active ? '' : 'none';

  switch (ds.id) {
  case "ghi":
  case "poverty":
  case "population":
  case 'windspeed':
  case 'nighttime-lights':
    controls.appendChild(ea_controls_range(ds, 'range'));
    controls.appendChild(ea_controls_weight(ds));
    break;

  case "schools":
  case "minigrids":
  case "mines":
  case "hydro":
  case "facilities":
  case "powerplants":
  case "transmission-lines":
    controls.appendChild(ea_controls_range(ds, 'proximity in km'));
    controls.appendChild(ea_controls_weight(ds));
    break;

  case 'districts':
    controls.appendChild(ea_controls_options(ds));
    controls.appendChild(ea_controls_range(ds, 'range'));
    break;

  case 'crops':
    controls.appendChild(ea_controls_mutant_options(ds));
    controls.appendChild(ea_controls_range(ds, 'range'));
    controls.appendChild(ea_controls_weight(ds));
    break;

  default:
    throw `EA Controls: Unknown data id ${ds.id}`;
    break;
  }

  return _controls;
};

function ea_controls_options(ds) {
  const container = elem(`<div class="control-option"></div>`);
  const select = elem('<select></select>');

  // select.appendChild(elem(`<option selected disabled>Select one...</option>`));

  const options = Object.keys(ds.metadata.options);

  options.forEach((v,i) => {
    select.appendChild(elem(`<option value=${v}>${ds.metadata.options[v]}</option>`));
  });

  ds.heatmap.scale_option = select.value = options[0];

  select.addEventListener('change', function() {
    ds.heatmap.scale_option = this.value;
    ea_datasets_active(ds, true);
  });

  container.appendChild(select);
  container.appendChild(elem('<div>&nbsp;</div>')); // TODO: remove this.

  return container;
};

function ea_controls_blur_control_groups(bool) {
  const contel = document.querySelectorAll('.controls-dataset-content');

  contel.forEach((c,i) => {
    if (c) {
      c.style['opacity'] = bool ? 0.1 : 1;
      c.style['pointer-events'] = bool ? 'none' : '';
    }
  });
};

function ea_controls_active(ds, callback) {
  return ea_svg_checkbox(ds.active, (s) => {
    const contel = document.querySelector(`.controls#controls-${ds.id}`);
    if (!contel) return;

    const cs = contel.querySelectorAll('.controls-dataset-content');

    cs.forEach((c,i) => {
      if (s) c.style['display'] = '';
      else c.style['display'] = 'none';
    });

    callback(s);
  });
};

function ea_controls_range(ds, label) {
  const d = [ds.heatmap.domain.min, ds.heatmap.domain.max];

  const range_norm = d3.scaleLinear().domain([0,1]).range(d);
  const domain = d.slice(0);

  function update_range_value(x,i,el) {
    let v = domain[i] = range_norm(x);
    el.innerText = (v * (ds.heatmap.factor || 1)).toFixed(ds.heatmap.precision || 0);

    ds.tmp_domain = domain;
  };

  const container = elem(`
<div class="control-group">
  <div class="weight-label">${label}:</div>
</div>`);

  const l = elem(`
<div class="label">
  <span bind="v1"></span>
  <span bind="v2"></span>
</div>`);

  const v1 = l.querySelector('[bind=v1]');
  const v2 = l.querySelector('[bind=v2]');

  container.appendChild(
    ea_svg_interval_thingradient(
      ds.color_scale_fn,
      x => update_range_value(x, 0, v1),
      x => update_range_value(x, 1, v2),
      _ => ea_overlord({
        type: "dataset",
        target: ds,
        caller: "ea_controls_range",
      })
    )
  );

  container.appendChild(elem('<br>'));

  container.appendChild(l);

  return container;
};

function ea_controls_weight(ds) {
  const weights = Array.apply(null, Array(5)).map((_, i) => i + 1);

  const container = elem(`
<div class="control-group">
  <div class="weight-label">weight:</div>
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
          caller: "ea_controls_weight",
        });
      },
      ("weight" === "weight")
    )
  );

  container.appendChild(elem('<br>'));

  container.appendChild(l);

  return container;
};

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
          caller: "ea_controls_steps",
        });
      },
      ("weight" === false)
    )
  );

  container.appendChild(elem('<br>'));

  container.appendChild(l);

  return container;
};
