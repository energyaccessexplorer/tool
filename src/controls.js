function ea_controls_tree() {
  const controls_el = document.querySelector('#controls');

  ea_category_tree.forEach(a => {
    const branch_el = ce('div', null, { id: a.name, class: 'controls-branch' });
    controls_el.append(branch_el);

    let title, subbranches_el;
    branch_el.append(
      title = ce('div', a.name, { class: 'controls-branch-title' }),
      subbranches_el = ce('div', null, { class: 'controls-subbranches' })
    );

    a.children.forEach(b => {
      let subel, conel, title;
      subbranches_el.append(
        subel = ce('div', null, { id: b, class: 'controls-subbranches' })
      );

      subel.append(
        title = ce('div', ea_branch_dict[b], { class: 'controls-subbranch-title' }),
        conel = ce('div', null, { class: 'controls-container' })
      );

      title.prepend(ce('span', ea_ui_collapse_triangle('s'), { class: 'collapse triangle' }));
      title.addEventListener('mouseup', e => elem_collapse(conel, subel));
    });
  });

  for (let d of DS.all) {
    let path = d.category.metadata.path;
    if (!path.length) continue;

    let el = document.querySelector(`#${path[0]} #${path[1]} .controls-container`);
    if (el)
      el.append(d.controls_el);
    else
      console.warn(d.id, path[0], path[1], "container not found...");
  }
};

function ea_controls_checkbox() {
  const ds = this.ds;

  const checkbox = ea_svg_checkbox(ds.active);
  const svg = checkbox.svg;

  const activate = e => {
    switch (e.target.closest('svg')) {
    case this.info:
      break;

    case svg: {
      ds.active = !ds.active;

      ea_overlord({
        "type": "dataset",
        "target": ds,
        "caller": "controls activate",
      });
      break;
    }

    default: {
      let event = document.createEvent('HTMLEvents');
      event.initEvent('click', true, true);
      svg.dispatchEvent(event);
      break;
    }
    };

    return ds.active;
  };

  qs(this, 'header').onclick = activate;

  return checkbox;
};

function ea_controls_mutant_options() {
  const ds = this.ds;

  const container = ce('div', null, { class: 'control-option' })
  const select = ce('select');

  ds.configuration.mutant_targets.forEach(i => {
    const host = DS.get(i);
    select.append(ce('option', host.name_long, { value: i }));
  });

  select.value = ds.configuration.host;

  select.addEventListener('change', async function() {
    const host = DS.get(this.value);

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

function ea_controls_options() {
  const ds = this.ds;

  if (!ds.csv) {
    console.warn(`ea_controls_options: '${ds.id}' does not have a csv_file assigned. Returning.`);
    return null;
  }

  const container = ce('div', null, { class: 'control-option' });
  const select = ce('select>');

  const options = Object.keys(ds.csv.options);

  options.forEach(v => select.append(ce('option', ds.csv.options[v], { value: v })));

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

function ea_controls_range(label, single = false) {
  const ds = this.ds;

  const d = [ds.heatmap.domain.min, ds.heatmap.domain.max];

  const range_norm = d3.scaleLinear().domain([0,1]).range(d);
  const domain = d.slice(0);

  function update_range_value(x,i,el) {
    let v = domain[i] = range_norm(x);
    el.innerText = (v * (ds.heatmap.factor || 1)).toFixed(ds.heatmap.precision || 0);

    ds.tmp_domain = domain;
  };

  const l = elem(`
<div class="label">
  <span bind="v1"></span>
  <span class="unit-label">${label}</span>
  <span bind="v2"></span>
</div>`);

  const v1 = l.querySelector('[bind=v1]');
  const v2 = l.querySelector('[bind=v2]');

  const r = ea_svg_interval(
    single,
    (ds.init_domain ? [range_norm.invert(ds.init_domain[0]), range_norm.invert(ds.init_domain[1])] : null),
    x => update_range_value(x, 0, v1),
    x => update_range_value(x, 1, v2),
    _ => {
      ea_overlord({
        "type": "dataset",
        "target": ds,
        "caller": "ea_controls_range",
      });
    }
  );

  const el = ce('div');
  el.append(r.svg, l);

  return {
    el: el,
    svg: r.svg,
    change: r.change,
    label: l,
  };
};

function ea_controls_single(label) {
  return ea_controls_range.call(this, label, true);
};

function ea_controls_weight(init) {
  const ds = this.ds;

  const weights = Array.apply(null, Array(5)).map((_, i) => i + 1);

  const label = elem(`
<div class="label">
  <span>${weights[0]}</span>
  <span class="unit-label">importance</span>
  <span>${weights[weights.length - 1]}</span>
</div>`);

  const w = ea_svg_range_steps(
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

  const el = ce('div');
  el.append(w.svg, label);

  return {
    el: el,
    svg: w.svg,
    change: w.change,
    label: label,
  };
};

function ea_controls_collection_list() {
  const ds = this.ds;

  if (!ds.collection) return;

  const e = ce('ul', null, { class: 'controls-dataset-collection' });

  for (let i of ds.configuration.collection) {
    let d = DS.get(i);
    e.append(ce('li', d.name_long));
  }

  return e;
};

async function ea_controls_selectlist() {
  let data = {};

  const id = location.get_query_param('id');

  const country_list = await fetch(ea_settings.database + '/geographies?select=id,name&online&order=name.asc')
    .then(r => r.json())
    .then(j => {
      j.forEach(g => data[g.name] = g.name);
      return j;
    });

  function set_default(input) {
    const g = country_list.find(x => x.id === id);
    if (g) input.value = g.name;

    return input;
  };

  const sl = new selectlist("controls-country", data, {
    'change': function(e) {
      const c = country_list.find(c => c.name === this.value);
      if (c && id !== c.id) location = location.search.replace(new RegExp(`id=${UUID_REGEXP}`), `id=${c.id}`);
    }
  });

  document.querySelectorAll('.controls-select-container')[0].append(sl.el);

  set_default(sl.input);
};

function ea_controls_presets_init(v) {
  const el = document.querySelector('#controls-preset');

  Object.keys(ea_presets).forEach(k => el.append(ce('option', ea_presets[k], { value: k })));

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
    // if (d.weight_change) d.weight_change(p.weight);

    d.init_domain = [p.min, p.max];
  } else {
    d.weight = 2;
    // if (d.weight_change) d.weight_change(2);

    d.init_domain = null;
  }

  return d.active;
};

class dscontrols extends HTMLElement {
  constructor(d) {
    if (!(d instanceof DS)) throw Error(`dscontrols: Expected a DS. Got ${d}.`);
    super();

    this.ds = d;
    attach.call(this, shadow_tmpl('#ds-controls-template'));

    this.content = qs(this, 'content');
    this.spinner = qs(this, '.loading');

    this.init();

    this.render();

    return this;
  };

  init() {
    this.checkbox = ea_controls_checkbox.call(this);

    this.info = tmpl('#svg-info');
    this.info.onclick = _ => ea_ui_dataset_modal(this.ds);

    switch (this.ds.id) {
    case "ghi":
    case "poverty":
    case "population":
    case 'windspeed':
    case 'nighttime-lights':
    case 'accessibility':
      this.weight_group = ea_controls_weight.call(this);
      this.range_group = ea_controls_range.call(this, (this.ds.unit || 'range'));
      break;

    case "health":
    case "schools":
      this.weight_group = ea_controls_weight.call(this);
      this.range_group = ea_controls_single.call(this, 'proximity in km');
      break;

    case "minigrids":
    case "mines":
    case "hydro":
    case "powerplants":
    case "geothermal":
    case "transmission-lines":
      this.weight_group = ea_controls_weight.call(this);
      this.range_group = ea_controls_range.call(this, 'proximity in km');
      break;

    case "transmission-lines-collection":
      this.weight_group = ea_controls_weight.call(this);
      this.range_group = ea_controls_range.call(this, 'proximity in km');
      this.collection_list = ea_controls_collection_list.call(this);
      break;

    case 'crops':
      this.weight_group = ea_controls_weight.call(this);
      this.range_group = ea_controls_range.call(this, this.ds.unit);
      this.mutant_options = ea_controls_mutant_options.call(this);
      break;


    default:
      console.warn(`EA Controls: Unknown data id ${this.ds.id}`);
      break;
    }

    if (this.ds.multifilter) DS.all.filter(d => d.id.match(this.ds.id + "-")).forEach(d => d.controls_el = this);
  };

  render() {
    this.content.style.display = this.ds.active ? '' : 'none';

    slot_populate.call(this, this.ds, {
      "info": this.info,
      "checkbox": this.checkbox.svg,
      "collection-list": this.collection_list,
      "mutant-options": this.mutant_options,
      "range-slider": this.range_group && this.range_group.el,
      "weight-slider": this.weight_group && this.weight_group.el,
    });

    return this;
  };

  loading(t) {
    this.spinner.style.display = t ? 'block' : 'none';
  };

  turn(t) {
    this.content.style.display = t ? '' : 'none';
    this.checkbox.change(t);
  };
}

customElements.define('ds-controls', dscontrols);
