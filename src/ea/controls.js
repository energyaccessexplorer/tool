function ea_controls_collapse_subcategory(conel, subel) {
  const d = conel.style['display'];
  const c = subel.querySelector('.collapse');

  if (d === "none") {
    conel.style['display'] = 'block';
    c.innerHTML = ea_ui_collapse_triangle('s');
  }

  else {
    conel.style['display'] = 'none';
    c.innerHTML = ea_ui_collapse_triangle('e');
  }
};

function ea_controls_tree(tree, collection) {
  const ctel = document.querySelector('#controls')

  tree.forEach(cat => cat.subcategories.forEach(sub => sub.datasets.filter(d => {
    const ds = DS.named(d.id);

    if (!ds) {
      console.warn(`Dataset '${d.id}' not found:`, ds);
      return false;
    }

    ds.invert = d.invert;
    ds.category = cat.name;
  })));

  tree.forEach(a => {
    ctel.appendChild(elem(`
<div id=${a.name} class="controls-category">
  <div class="controls-category-title">${a.name}</div>
  <div class="controls-subcategories"></div>
</div>`));

    const catel = ctel.querySelector(`#${a.name}`);

    a.subcategories.forEach(b => {
      catel.querySelector('.controls-subcategories')
        .appendChild(elem(`
<div id=${b.name} class="controls-subcategory">
  <div class="controls-subcategory-title">
    <span class="collapse triangle">${ea_ui_collapse_triangle('s')}</span>
    ${ea_category_dict[b.name]}
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

  ds.configuration.mutant_targets.forEach(i => {
    const host = DS.named(i);
    select.appendChild(elem(`<option value=${i}>${host.name_long}</option>`));
  });

  select.value = ds.configuration.mutant_targets[0];

  select.addEventListener('change', async function() {
    const host = DS.named(this.value);

    ds.raster = undefined;
    ds.polygons = undefined;
    ds.heatmap = undefined;
    ds.height = undefined;
    ds.width = undefined;
    ds.image = undefined;
    ds.tiff = undefined;

    ds.configuration.host = host.id;
    ds.polygons = host.polygons;
    ds.color_scale_svg = host.color_scale_svg;
    ds.color_scale_fn = host.color_scale_fn;

    await host.heatmap.parse.call(host);

    ds.heatmap = host.heatmap;
    ds.raster = host.raster;
    ds.image = host.image;

    ea_overlord({
      type: "input",
      target: ds,
      caller: "ea_controls_mutant_options",
    });
  });

  container.appendChild(select);

  return container;
};

function ea_controls_elem(ds) {
  const controls = elem(`
<div id="controls-${ds.id}" class="controls">
  <div class="controls-dataset-header"></div>
  <div class="controls-dataset-content"></div>
</div>`);

  const header = controls.querySelector('.controls-dataset-header');

  const check = ea_controls_active(ds, v => ds.active = v);

  const button = check.svg;

  header.appendChild(button);

  ds.checkbox_change = check.change;

  const help = elem(`<div class="controls-dataset-help">${ea_svg_info()}</div>`);

  const clicko = function(e) {
    ds.active = !ds.active;

    if (e.target.closest('div') === help) return;

    if (e.target.closest('svg') !== button) {
      let event = document.createEvent('HTMLEvents');
      event.initEvent('click', true, true);

      button.dispatchEvent(event);
    }

    ea_overlord({
      type: "input",
      target: ds,
      caller: "ea_controls_elem clicko",
    });
  };

  const name = elem(`<div class="controls-dataset-name">${ds.name_long}</div>`);
  header.appendChild(name);

  header.addEventListener('mouseup', clicko);

  if (ds.help && (ds.help.why || ds.help.what)) {
    header.appendChild(help);

    help.addEventListener('mouseup', _ => ea_category_help_modal(ds));
  }

  check.change(ds.active);

  return controls;
};

function ea_controls(ds) {
  const _controls = ea_controls_elem(ds);
  const controls = _controls.querySelector('.controls-dataset-content');

  const weight_group = ea_controls_weight(ds);
  ds.weight_change = weight_group.weight_control.change;

  let range_group;

  controls.style['display'] = ds.active ? '' : 'none';

  switch (ds.id) {
  case "ghi":
  case "poverty":
  case "population":
  case 'windspeed':
  case 'nighttime-lights':
  case 'accessibility':
    range_group = ea_controls_range(ds, (ds.unit || 'range'));
    controls.appendChild(range_group.elem);
    controls.appendChild(weight_group.elem);
    break;

  case "schools":
  case "minigrids":
  case "mines":
  case "hydro":
  case "facilities":
  case "health":
  case "powerplants":
  case "geothermal":
  case "transmission-lines":
    range_group = ea_controls_range(ds, (ds.unit || 'proximity in km'))
    controls.appendChild(range_group.elem);
    controls.appendChild(weight_group.elem);
    break;

  case "boundaries":
    range_group = ea_controls_range(ds, (ds.unit || 'percentage'))

    const o = ea_controls_options(ds);
    if (o) {
      controls.appendChild(o);
      controls.appendChild(range_group.elem);
    }
    else {
      controls.remove();
    }

    break;

  case 'crops':
    range_group = ea_controls_range(ds, (ds.unit || 'range'))
    controls.appendChild(ea_controls_mutant_options(ds));
    controls.appendChild(range_group.elem);
    controls.appendChild(weight_group.elem);
    break;

  default:
    throw `EA Controls: Unknown data id ${ds.id}`;
    break;
  }

  return _controls;
};

function ea_controls_options(ds) {
  if (!ds.csv) {
    console.warn(`ea_controls_options: '${ds.id}' does not have a csv_file assigned. Returning.`);
    return null;
  }

  const container = elem(`<div class="control-option"></div>`);
  const select = elem('<select></select>');

  // select.appendChild(elem(`<option selected disabled>Select one...</option>`));

  const options = Object.keys(ds.csv.options);

  options.forEach(v => {
    select.appendChild(elem(`<option value=${v}>${ds.csv.options[v]}</option>`));
  });

  ds.heatmap.scale_option = select.value = options[0];

  select.addEventListener('change', function() {
    ds.heatmap.scale_option = this.value;

    ea_overlord({
      type: "input",
      target: ds,
      caller: "ea_controls_options",
    })
  });

  container.appendChild(select);

  return container;
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

  const container = elem(`<div class="control-group"></div>`);

  const l = elem(`
<div class="label">
  <span bind="v1"></span>
  <span class="weight-label">${label}</span>
  <span bind="v2"></span>
</div>`);

  const v1 = l.querySelector('[bind=v1]');
  const v2 = l.querySelector('[bind=v2]');

  let csf = _ => {
    return d3.scaleLinear()
      .clamp(false)
      .range([getComputedStyle(document.body).getPropertyValue('--the-green')]);
  };

  const range_control = ea_svg_interval_thingradient(
    csf,
    (ds.init_domain ? [range_norm.invert(ds.init_domain[0]), range_norm.invert(ds.init_domain[1])] : null),
    x => update_range_value(x, 0, v1),
    x => update_range_value(x, 1, v2),
    _ => ea_overlord({
      type: "input",
      target: ds,
      caller: "ea_controls_range",
    })
  );

  container.appendChild(range_control.svg);
  container.appendChild(l);

  return {
    elem: container,
    range_control: range_control
  };
};

function ea_controls_weight(ds, init) {
  const weights = Array.apply(null, Array(5)).map((_, i) => i + 1);

  const container = elem(`<div class="control-group"></div>`);

  const l = elem(`
<div class="label">
  <span>${weights[0]}</span>
  <span class="weight-label">importance</span>
  <span>${weights[weights.length - 1]}</span>
</div>`);

  const weight_control = ea_svg_range_steps(
    weights,
    ds.weight,
    null,
    x => {
      ds.weight = x;

      ea_overlord({
        type: "input",
        target: ds,
        caller: "ea_controls_weight",
      });
    },
    ("weight" === "weight")
  );

  container.appendChild(weight_control.svg);
  container.appendChild(l);

  return {
    elem: container,
    weight_control: weight_control
  };
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
          type: "input",
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
