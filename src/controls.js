class dscontrols extends HTMLElement {
  constructor(d) {
    if (!(d instanceof DS)) throw Error(`dscontrols: Expected a DS. Got ${d}.`);
    super();

    this.ds = d;
    attach.call(this, shadow_tmpl('#ds-controls-template'));

    this.content = qs('content', this);
    this.spinner = qs('.loading', this);

    this.show_advanced = false;

    this.init();

    this.render();

    return this;
  };

  activate() {
    this.ds.active = !this.ds.active;

    ea_overlord({
      "type": "dataset",
      "target": this.ds,
      "caller": "controls activate",
    });
  };

  init() {
    if (this.ds.parent)
      this.range_group = ea_controls_range.call(this, (this.ds.parent.category.unit || 'range'));

    this.checkbox = ea_controls_checkbox.call(this);

    const cat = this.ds.category;
    const c = cat.configuration.controls;

    if (c.weight)
      this.weight_group = ea_controls_weight.call(this);

    const lr = c.range_label || cat.unit || 'range';

    if (c.range === 'double')
      this.range_group = ea_controls_range.call(this, lr);
    else if (c.range === 'single')
      this.range_group = ea_controls_single.call(this, lr);

    if (this.ds.items)
      this.collection_list = ea_controls_collection_list.call(this);

    if (this.ds.mutant)
      this.mutant_options = ea_controls_mutant_options.call(this);

    const dropdownlist = [{
      "content": "Dataset info",
      "action": _ => ea_dataset_modal(this.ds)
    }];

    if (this.weight_group) {
      dropdownlist.push({
        "content": "Toggle advanced controls",
        "action": _ => {
          if (!this.ds.active) this.activate();

          qs('.advanced-controls', this).style.display = (this.show_advanced = !this.show_advanced) ? 'block' : 'none';
        }
      });
    }

    dropdownlist.push({
      "content": "Reset default values",
      "action": _ => this.reset_defaults()
    });

    this.dropdown = new dropdown(dropdownlist)
  };

  render() {
    this.content.style.display = this.ds.active ? '' : 'none';

    slot_populate.call(this, this.ds, {
      "dropdown": this.dropdown,
      "info": this.info,
      "checkbox": this.checkbox.svg,
      "collection-list": this.collection_list,
      "mutant-options": this.mutant_options,
      "range-slider": this.range_group && this.range_group.el,
      "weight-slider": this.weight_group && this.weight_group.el,
    });

    if (!this.weight_group && !this.range_group) this.content.remove();

    this.inject();

    return this;
  };

  loading(t) {
    this.spinner.style.display = t ? 'block' : 'none';
  };

  turn(t) {
    this.content.style.display = t ? '' : 'none';
    if (this.checkbox) this.checkbox.change(t);
  };

  inject() {
    const ds = this.ds;
    const path = ds.category.configuration.path;

    if (!path.length) return;
    if (ds.children) return;

    const controls_el = qs('#controls-contents');
    const controls_tabs_el = qs('#controls-tabs');

    function create_tab(name) {
      return ce('div', name, { id: 'controls-tab-' + name, class: 'controls-branch-tab up-title' });
    };

    function create_branch(name) {
      return ce('div', null, { id: name, class: 'controls-branch' });
    };

    function create_subbranch(name) {
      let conel, title;
      const el = ce('div', null, { id: name, class: 'controls-subbranch' });

      el.append(
        title = ce('div', (ea_branch_dict[name] || name), { class: 'controls-subbranch-title up-title' }),
        conel = ce('div', null, { class: 'controls-container' })
      );

      title.prepend(ce('span', collapse_triangle('s'), { class: 'collapse triangle' }));
      title.addEventListener('mouseup', e => elem_collapse(conel, el));

      return el;
    };

    let t = qs(`#controls-tab-${path[0]}.controls-branch-tab`);
    if (!t) {
      t = create_tab(path[0]);
      t.onclick = _ => ea_controls_select_tab(t, path[0]);
      controls_tabs_el.append(t);
    }

    let b = qs(`#${path[0]}.controls-branch`, controls_el);
    if (!b) b = create_branch(path[0]);
    controls_el.append(b);

    let sb = qs(`#${path[1]}.controls-subbranch`, b);
    if (!sb) sb = create_subbranch(path[1]);
    b.append(sb);

    const container = qs('.controls-container', sb);
    if (container) container.append(this);
  };

  disable() {
    qs('main', this).classList.add('disabled');

    this.loading(true);

    this.spinner.remove();
    this.content.remove();

    if (this.checkbox) this.checkbox.svg.remove();
  };

  reset_defaults() {
    if (this.weight_group) {
      this.weight_group.change(this.ds.weight = 2);
    }

    if (this.range_group) {
      const d = this.ds.category.raster.config.init;
      this.range_group.change(d.min, d.max);
    }

    ea_overlord({
      "type": "dataset",
      "target": this.ds,
      "caller": "dscontrols restore defaults"
    });
  };
}

customElements.define('ds-controls', dscontrols);

function ea_controls_init(state) {
  ea_controls_selectlist();
  ea_controls_presets_init(state.preset);

  const controls_el = qs('#controls-contents');
  const controls_tabs_el = qs('#controls-tabs');
  const tab_all = ce('div', "all", { id: 'controls-tab-all', class: 'controls-branch-tab up-title' });

  controls_tabs_el.append(tab_all);

  tab_all.onclick = function() {
    for (let e of qsa('.controls-branch-tab', controls_tabs_el))
      e.classList.remove('active');

    for (let e of qsa('.controls-branch', controls_el))
      e.style.display = '';

    tab_all.classList.add('active');
  };

  const tab_filters = qs('#controls-tab-filters', controls_tabs_el);
  if (tab_filters) ea_controls_select_tab(tab_filters, "filters");
  else ea_controls_select_tab(tab_all, "all");
};

function ea_controls_select_tab(tab, name) {
  const controls_tabs_el = qs('#controls-tabs');
  const controls_el = qs('#controls-contents');

  for (let e of qsa('.controls-branch-tab', controls_tabs_el))
    e.classList.remove('active');

  for (let e of qsa('.controls-branch', controls_el)) {
    let all = (name === 'all');
    e.style.display = all ? '' : 'none';
  }

  tab.classList.add('active');

  const b = qs('#' + name, controls_el);
  if (b) b.style.display = 'block';
};

function ea_controls_checkbox() {
  const ds = this.ds;

  const checkbox = ea_svg_checkbox(ds.active);
  const svg = checkbox.svg;

  const checkbox_activate = e => {
    if (e.target.closest('svg') === svg)
      this.activate();

    else if (e.target.closest('.more-dropdown') === this.dropdown)
      return;

    else {
      let event = document.createEvent('HTMLEvents');
      event.initEvent('click', true, true);
      svg.dispatchEvent(event);
    }

    return ds.active;
  };

  qs('header', this).onclick = checkbox_activate;

  return checkbox;
};

function ea_controls_mutant_options() {
  const ds = this.ds;

  const container = ce('div', null, { class: 'control-option' })
  const select = ce('select');

  ds.hosts.forEach(d => select.append(ce('option', d.name, { value: d.id })));

  select.value = ds.host.id;

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

function ea_controls_range(label, single = false, opts = {}) {
  const ds = this.ds;

  const d = [ds.raster.config.domain.min, ds.raster.config.domain.max];

  const range_norm = d3.scaleLinear().domain([0,1]).range(d);
  const domain = d.slice(0);

  function update_range_value(x,i,el) {
    let v = domain[i] = range_norm(x);
    el.innerText = (v * (ds.raster.config.factor || 1)).toFixed(ds.raster.config.precision || 0);

    ds.domain = domain;
  };

  const l = elem(`
<div class="label">
  <span bind="v1"></span>
  <span class="unit-label">${label}</span>
  <span bind="v2"></span>
</div>`);

  const v1 = qs('[bind=v1]', l);
  const v2 = qs('[bind=v2]', l);

  function c(a,b) {
    return r.change(range_norm.invert(a), range_norm.invert(b));
  };

  const r = ea_svg_interval(
    single,
    [range_norm.invert(ds.raster.config.init.min), range_norm.invert(ds.raster.config.init.max)], {
      width: opts.width || 320,
      callback1: x => update_range_value(x, 0, v1),
      callback2: x => update_range_value(x, 1, v2),
      end_callback: _ => {
        ea_overlord({
          "type": "dataset",
          "target": ds,
          "caller": "ea_controls_range",
        });
      }
    }
  );

  const el = ce('div');
  el.append(r.svg, l);

  return {
    el: el,
    svg: r.svg,
    change: c,
    label: l
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
    ds.weight, {
      width: 320,
      drag_callback: null,
      end_callback: x => {
        ds.weight = x;

        ea_overlord({
          "type": "dataset",
          "target": ds,
          "caller": "ea_controls_weight",
        });
      }
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

  if (!ds.items) return;

  const e = ce('ul', null, { class: 'collection' });

  for (let d of ds.items)
    e.append(ce('li', d.name));

  return e;
};

async function ea_controls_selectlist() {
  let data = {};

  const id = location.get_query_param('id');

  const pidq = GEOGRAPHY.parent_id ? `eq.${GEOGRAPHY.parent_id}` : "is.null";
  const list = await fetch(ea_settings.database + `/geographies?select=id,name&online=eq.true&datasets_count=gt.0&parent_id=${pidq}&order=name.asc`)
        .then(r => r.json())
        .then(j => {
          j.forEach(g => data[g.name] = g.name);
          return j;
        });

  function set_default(input) {
    const g = list.find(x => x.id === id);
    if (g) input.value = g.name;

    return input;
  };

  const sl = new selectlist("controls-country", data, {
    'change': function(e) {
      const c = list.find(c => c.name === this.value);
      if (c && id !== c.id) location = location.search.replace(new RegExp(`id=${UUID_REGEXP}`), `id=${c.id}`);
    }
  });

  qsa('.controls-select-container')[0].append(sl.el);

  set_default(sl.input);
};

function ea_controls_presets_init(v) {
  const el = qs('#controls-preset');

  Object.keys(ea_presets).forEach(k => el.append(ce('option', ea_presets[k], { value: k })));

  el.value = v || "custom";
  qs('option[value="custom"]', el).innerText = "Custom Analysis";

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
  } else {
    d.weight = 2;
  }

  return d.active;
};
