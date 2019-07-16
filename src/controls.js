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
    controls.append(range_group.elem, weight_group.elem);
    break;

  case "health":
  case "schools":
    range_group = ea_controls_single(ds, (ds.unit || 'proximity in km'));
    controls.append(range_group.elem, weight_group.elem);
    break;

  case "minigrids":
  case "mines":
  case "hydro":
  case "powerplants":
  case "geothermal":
  case "transmission-lines":
    range_group = ea_controls_range(ds, (ds.unit || 'proximity in km'));
    controls.append(range_group.elem, weight_group.elem);
    break;

  case "boundaries-temp-disabled": { // NOTE: left as a reference...
    range_group = ea_controls_range(ds, (ds.unit || 'percentage'));

    const o = ea_controls_options(ds);
    if (o) {
      controls.append(o, range_group.elem);
    }
    else {
      controls.remove();
    }

    break;
  }

  case "boundaries": {
    _controls.querySelector('.controls-dataset-header').remove();
    _controls.prepend(elem(`
<div class="controls-subbranch-title">
  <span class="collapse triangle">${ea_ui_collapse_triangle(ds.active ? 's' : 'e')}</span>
  ${ds.name_long}
</div>`));

    if (!ds.csv) break;

    const sbs = [];
    let first = true;

    for (let v in ds.csv.options) {
      let d = DS.named(ds.id + "-" + v);

      let a = true;

      const check = ea_svg_checkbox(true, s => {
        d.active_filter = a = s;
        update();
      });

      const button = check.svg;

      range_group = ea_controls_range(d, (d.unit || 'percentage'), false, update);

      let sb = elem('<div class="controls-multifilter-elem" ripple>');
      const title = elem(`<div class="control-group">${ds.csv.options[v]}</div>`)

      sb.addEventListener('mousedown', e => (e.target.closest('svg') !== check.svg) ? update() : null);

      sb.append(button, title, range_group.elem);
      sbs.push(sb);

      function update() {
        for (let s of sbs) s.classList.remove('active');
        sb.classList.add('active');
        ds.name_long = ds.csv.options[v];

        ea_overlord({
          "type": "dataset",
          "target": d,
          "caller": "ea_controls_elem multifilter",
        });
      };

      if (first) { sb.classList.add('active'); first = false; }

      controls.append(sb);
    }

    _controls.querySelector('.controls-subbranch-title')
      .addEventListener('mouseup', e => elem_collapse(controls, _controls.querySelector('.controls-subbranch-title')));

    break;
  }

  case "transmission-lines-collection":
    range_group = ea_controls_range(ds, (ds.unit || 'proximity in km'));
    controls.append(ea_controls_collection_list(ds), range_group.elem, weight_group.elem);
    break;

  case 'crops':
    range_group = ea_controls_range(ds, (ds.unit || 'range'));
    controls.append(ea_controls_mutant_options(ds), range_group.elem, weight_group.elem);
    break;

  default:
    throw `EA Controls: Unknown data id ${ds.id}`;
    break;
  }

  return _controls;
};

function ea_controls_elem(ds) {
  const controls = elem(`
<div id="controls-${ds.id}" class="controls">
  <div class="controls-dataset-header" ripple></div>
  <div class="controls-dataset-content"></div>
</div>`);

  const header = controls.querySelector('.controls-dataset-header');

  const check = ea_svg_checkbox(ds.active, s => ea_controls_toggle(ds, ds.active = s));

  const button = check.svg;

  ds.checkbox_change = check.change;

  const info = elem(`<div class="controls-dataset-info">${ea_svg_info()}</div>`);

  const clicko = function(e) {
    ds.active = !ds.active;

    if (e.target.closest('div') === info) return;

    if (e.target.closest('svg') !== button) {
      let event = document.createEvent('HTMLEvents');
      event.initEvent('click', true, true);

      button.dispatchEvent(event);
    }

    ea_overlord({
      "type": "dataset",
      "target": ds,
      "caller": "ea_controls_elem clicko",
    });
  };

  const name = elem(`<div class="controls-dataset-name">${ds.name_long}</div>`);
  header.append(button, name, info);
  header.addEventListener('mouseup', clicko);

  info.addEventListener('mouseup', _ => ea_ui_dataset_modal(ds));

  return controls;
};

function ea_controls_tree(tree, list) {
  const controls_el = document.querySelector('#controls');

  tree.forEach(branch => branch.subbranches.forEach(sub => sub.datasets.filter(d => {
    const ds = DS.named(d.id);

    if (!ds) {
      console.warn(`Dataset '${d.id}' not found:`, ds);
      return false;
    }

    ds.invert = d.invert;
  })));

  tree.forEach(a => {
    controls_el.append(elem(`
<div id=${a.name} class="controls-branch">
  <div class="controls-branch-title">${a.name}</div>
  <div class="controls-subbranches"></div>
</div>`));

    const branch_el = controls_el.querySelector(`#${a.name}`);

    a.subbranches.forEach(b => {
      branch_el.querySelector('.controls-subbranches')
        .append(elem(`
<div id=${b.name} class="controls-subbranches">
  <div class="controls-subbranch-title">
    <span class="collapse triangle">${ea_ui_collapse_triangle('s')}</span>
    ${ea_branch_dict[b.name]}
  </div>
  <div class="controls-container"></div>
</div>`));

      const subel = branch_el.querySelector(`#${b.name}`);
      const conel = subel.querySelector('.controls-container');

      subel.querySelector('.controls-subbranch-title')
        .addEventListener('mouseup', e => elem_collapse(conel, subel));

      b.datasets.forEach(b => {
        const ds = list.find(x => x.id === b.id);

        if (ds) {
          conel.append(ea_controls(ds));
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
    select.append(elem(`<option value=${i}>${host.name_long}</option>`));
  });

  select.value = ds.configuration.mutant_targets[0];

  select.addEventListener('change', async function() {
    const host = DS.named(this.value);

    await ds.mutate(host);

    ea_overlord({
      "type": "dataset",
      "target": ds,
      "caller": "ea_controls_mutant_options",
    });
  });

  container.append(select);

  return container;
};

function ea_controls_options(ds) {
  if (!ds.csv) {
    console.warn(`ea_controls_options: '${ds.id}' does not have a csv_file assigned. Returning.`);
    return null;
  }

  const container = elem(`<div class="control-option"></div>`);
  const select = elem('<select></select>');

  // select.append(elem(`<option selected disabled>Select one...</option>`));

  const options = Object.keys(ds.csv.options);

  options.forEach(v => {
    select.append(elem(`<option value=${v}>${ds.csv.options[v]}</option>`));
  });

  ds.filter_option = select.value = options[0];

  select.addEventListener('change', function() {
    ds.filter_option = this.value;

    ea_overlord({
      "type": "dataset",
      "target": ds,
      "caller": "ea_controls_options",
    });
  });

  container.append(select);

  return container;
};

function ea_controls_toggle(ds, status) {
  const contel = document.querySelector(`.controls#controls-${ds.id}`);
  if (!contel) return;

  const cs = contel.querySelectorAll('.controls-dataset-content');

  if (ds.checkbox_change) ds.checkbox_change(status);

  cs.forEach((c,i) => {
    if (status) c.style['display'] = '';
    else c.style['display'] = 'none';
  });
};

function ea_controls_range(ds, label, single, callback) {
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

  const range_control = ea_svg_interval(
    single,
    (ds.init_domain ? [range_norm.invert(ds.init_domain[0]), range_norm.invert(ds.init_domain[1])] : null),
    x => update_range_value(x, 0, v1),
    x => update_range_value(x, 1, v2),
    _ => {
      if (typeof callback === 'function') callback();

      ea_overlord({
        "type": "dataset",
        "target": ds,
        "caller": "ea_controls_range",
      });
    }
  );

  container.append(range_control.svg, l);

  return {
    elem: container,
    range_control: range_control
  };
};

function ea_controls_single(ds, label) {
  return ea_controls_range(ds, label, true);
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
        "type": "dataset",
        "target": ds,
        "caller": "ea_controls_weight",
      });
    }
  );

  container.append(weight_control.svg, l);

  return {
    elem: container,
    weight_control: weight_control
  };
};

function ea_controls_collection_list(ds) {
  if (!ds.collection) return;

  const e = elem('<ul class="controls-dataset-collection">');

  for (let i of ds.configuration.collection) {
    let d = DS.named(i);
    e.append(elem(`<li>${d.name_long}</li>`));
  }

  return e;
};

function ea_controls_country_setup() {
  const datalist = document.querySelector('datalist#controls-country');
  const input = document.querySelector('input[list="controls-country"]');

  let country_list = null;

  const curr_ccn3 = +location.get_query_param('ccn3');

  function set_default() {
    const c = country_list.find(c => c.ccn3 === curr_ccn3);
    if (c) input.value = c.name;
  };

  fetch(ea_settings.database + '/countries?select=name,cca3,ccn3&online')
    .then(r => r.json())
    .then(j => j.sort((a,b) => a['name'] > b['name'] ? 1 : -1))
    .then(j => {
      country_list = j;
      j.forEach(c => datalist.append(elem(`<option value="${c.name}"></option>`)));
      set_default();
    });

  input.addEventListener('focus', function() { this.value = ""; });

  input.addEventListener('blur', set_default);

  input.addEventListener('change', function() {
    const c = country_list.find(c => c.name === this.value);
    if (c && curr_ccn3 !== c.ccn3)
      location = location.search.replace(/ccn3=[0-9]{3}/, `ccn3=${c.ccn3}`);
  });
};

function ea_controls_presets_init(v) {
  const el = document.querySelector('#controls-preset');

  Object.keys(ea_presets).forEach(k => el.append(elem(`<option value="${k}">${ea_presets[k]}</option>`)));

  el.value = v || "custom";
  el.querySelector('option[value="custom"]').innerText = "Custom Analysis";

  el.addEventListener('change', function(e) {
    ea_overlord({
      "type": "preset",
      "target": this.value,
      "caller": "ea_controls_presets_init change"
    });
  });
};

function ea_controls_presets_set(d, v) {
  let p = d.presets[v];

  // DS 'boundaries' should always remain active even if no preset is
  // present. It does not change calculations anyway since it's scaling function
  // is a "delta-key".
  //
  if (d.id == 'boundaries')
    d.active = true;
  else
    d.active = !!p;

  if (p) {
    d.weight = p.weight;
    if (d.weight_change) d.weight_change(p.weight);

    d.init_domain = [p.min, p.max];
  } else {
    d.weight = 2;
    if (d.weight_change) d.weight_change(2);

    d.init_domain = null;
  }

  return d.active;
};
