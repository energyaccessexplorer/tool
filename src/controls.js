class dscontrols extends HTMLElement {
  constructor(d) {
    if (!(d instanceof DS)) throw Error(`dscontrols: Expected a DS. Got ${d}.`);
    super();

    this.ds = d;
    attach.call(this, shadow_tmpl('#ds-controls-template'));

    this.main = qs('main', this);
    this.header = qs('header', this);
    this.content = qs('content', this);
    this.spinner = qs('.loading', this);

    this.manual_min = qs('.manual-controls input[bind=min]', this);
    this.manual_max = qs('.manual-controls input[bind=max]', this);

    this.show_advanced = false;

    this.init();

    this.render();

    return this;
  };

  init() {
    this.checkbox = ea_controls_checkbox.call(this.ds);
    this.header.onclick = this.checkbox.click;

    const cat = this.ds.category;
    const c = cat.controls;

    if (c.weight)
      this.weight_group = ea_controls_weight.call(this.ds);

    if (this.ds.items)
      this.collection_list = ea_controls_collection_list.call(this.ds);

    if (this.ds.mutant)
      ea_controls_mutant_options.call(this.ds);

    this.dropdown = new dropdown(ea_controls_dropdown.call(this));
  };

  async range_group_controls() {
    const cat = this.ds.category;

    let steps;
    if (cat.controls.range_steps) {
      steps = [];
      const s = (this.ds.raster.domain.max - this.ds.raster.domain.min) / (cat.controls.range_steps - 1);

      for (let i = 0; i < cat.controls.range_steps; i += 1)
        steps[i] = this.ds.raster.domain.min + (s * i);
    }

    const lr = cat.controls.range_label || cat.unit || 'range';

    switch (this.ds.datatype) {
    case 'raster':
    case 'raster-mutant': {
      await until(_ => this.ds._domain);

      this.range_group = ea_controls_range.call(this.ds, {
        ramp: lr,
        steps: steps,
        sliders: cat.controls.range
      });
      break;
    }

    case 'points':
    case 'lines':
    case 'polygons': {
      if (!this.ds.raster) break;

      await until(_ => this.ds._domain);

      this.range_group = ea_controls_range.call(this.ds, {
        ramp: lr,
        steps: steps,
        sliders: cat.controls.range,
        domain: this.ds.domain
      });
      break;
    }

    case 'polygons-fixed':
    case 'polygons-timeline': {
      await until(_ => this.ds._domain);

      this.range_group = ea_controls_range.call(this.ds, {
        ramp: lr,
        steps: steps,
        sliders: cat.controls.range,
        domain: this.ds.domain
      });
      break;
    }

    default: {
      this.range_group = null;
      break;
    }
    }

    this.manual_setup();

    slot_populate.call(this, {}, {
      "range-slider": maybe(this.range_group, 'el'),
    });
  };

  render() {
    slot_populate.call(this, this.ds, {
      "dropdown": this.dropdown,
      "info": this.info,
      "checkbox": this.checkbox.svg,
      "collection-list": this.collection_list,
      "weight-slider": maybe(this.weight_group, 'el'),
    });

    this.inject();

    return this;
  };

  loading(t) {
    this.spinner.style.display = t ? 'block' : 'none';
  };

  turn(t) {
    this.content.style.display = t ? 'block' : 'none';
    this.main.classList[this.ds.on ? 'add' : 'remove']('active');

    if (this.checkbox) this.checkbox.change(t);

    if (t && !this.range_group) this.range_group_controls();
  };

  inject() {
    const ds = this.ds;
    const path = maybe(ds.category, 'controls', 'path');

    if (!path.length) return;

    const controls = qs('#controls-contents');
    const controls_tabs_el = qs('#controls-tabs');

    function create_tab(name) {
      return ce('div', humanformat(name), { id: 'controls-tab-' + name, class: 'controls-branch-tab up-title' });
    };

    function create_branch(name) {
      return ce('div', null, { id: 'controls-branch-' + name, class: 'controls-branch' });
    };

    function create_subbranch(name) {
      let conel, title;
      const el = ce('div', null, { id: 'controls-subbranch-' + name, class: 'controls-subbranch' });

      el.append(
        title = ce('div', humanformat(name), { class: 'controls-subbranch-title up-title' }),
        conel = ce('div', null, { class: 'controls-container' })
      );

      title.prepend(ce('span', collapse_triangle('s'), { class: 'collapse triangle' }));
      title.addEventListener('mouseup', e => elem_collapse(conel, el));

      elem_collapse(conel, el);

      return el;
    };

    let t = qs(`#controls-tab-${path[0]}.controls-branch-tab`);
    if (!t) {
      t = create_tab(path[0]);
      t.onclick = _ => ea_controls_select_tab(t, path[0]);
      controls_tabs_el.append(t);
    }

    let b = qs(`#controls-branch-${path[0]}.controls-branch`, controls);
    if (!b) b = create_branch(path[0]);
    controls.append(b);

    let sb = qs(`#controls-subbranch-${path[1]}.controls-subbranch`, b);
    if (!sb) sb = create_subbranch(path[1]);
    b.append(sb);

    const container = qs('.controls-container', sb);
    if (container) container.append(this);
  };

  disable() {
    this.main.classList.add('disabled');

    this.loading(true);

    this.spinner.remove();
    this.content.remove();
    this.dropdown.remove();

    if (this.checkbox) this.checkbox.svg.remove();
  };

  reset_defaults() {
    if (this.weight_group) {
      this.weight_group.change(2);
      O.dataset(this, 'weight', 2);
    }

    if (this.range_group) {
      const d = this.ds.raster.init;
      this.range_group.change(d.min, d.max);
      O.dataset(this, 'domain', d);
    }
  };

  manual_setup() {
    if (!this.manual_min || !this.manual_max) return;

    this.manual_min.value = maybe(this.ds, 'domain', 0) || "";
    this.manual_max.value = maybe(this.ds, 'domain', 1) || "";

    const change = (e,i) => {
      let v = +e.target.value;

      if (v > this.ds.domain[(i+1)%2]) {
        e.target.value = this.ds.domain[(i+1)%2];
      }

      const d = [this.ds._domain[0], this.ds._domain[1]];
      d[i] = v;

      this.range_group.change(...d);

      O.dataset(this.ds, 'domain', d);
    };

    this.manual_min.onchange = e => change(e, 0);
    this.manual_max.onchange = e => change(e, 1);

    switch (maybe(this.ds, 'category', 'controls', 'range')) {
    case 'single':
      this.manual_min.setAttribute('disabled', true);
      break;

    case 'double':
      break;

    case null:
    default:
      break;
    }
  };
};

customElements.define('ds-controls', dscontrols);

function ea_controls_init() {
  ea_controls_selectlist();

  const controls = qs('#controls-contents');
  const controls_tabs_el = qs('#controls-tabs');
  const tab_all = ce('div', "all", { id: 'controls-tab-all', class: 'controls-branch-tab up-title' });

  controls_tabs_el.append(tab_all);

  tab_all.onclick = function() {
    for (let e of qsa('.controls-branch-tab', controls_tabs_el))
      e.classList.remove('active');

    for (let e of qsa('.controls-branch', controls))
      e.style.display = '';

    tab_all.classList.add('active');
  };

  ea_controls_sort_datasets(GEOGRAPHY.configuration);

  const first = qs('.controls-branch-tab', controls_tabs_el);
  ea_controls_select_tab(first, first.id.replace('controls-tab-', ''));
};

function ea_controls_select_tab(tab, name) {
  const controls_tabs_el = qs('#controls-tabs');
  const controls = qs('#controls-contents');

  for (let e of qsa('.controls-branch-tab', controls_tabs_el))
    e.classList.remove('active');

  for (let e of qsa('.controls-branch', controls)) {
    let all = (name === 'all');
    e.style.display = all ? '' : 'none';
  }

  tab.classList.add('active');

  const b = qs('#controls-branch-' + name, controls);
  if (b) b.style.display = 'block';
};

function ea_controls_checkbox() {
  const checkbox = ea_svg_switch(this.on);
  const svg = checkbox.svg;

  checkbox.click = e => {
    if (e.target.closest('svg') === svg)
      this.toggle();

    else if (e.target.closest('.more-dropdown') === this.controls.dropdown)
      return;

    else
      svg.dispatchEvent(new Event('click', { bubbles: true }));

    return this.on;
  };

  return checkbox;
};

async function ea_controls_mutant_options() {
  await until(_ => maybe(this.hosts, 'length') === this.config.mutant_targets.length);

  const container = ce('div', null, { class: 'control-option' });
  const select = ce('select');

  this.hosts.forEach(d => select.append(ce('option', d.name, { value: d.id })));

  select.value = this.host.id;

  select.onchange = async e => {
    const host = DST.get(e.target.value);

    await this.mutate(host);

    O.dataset(this, 'mutate', host);
  };

  container.append(select);

  this.mutant_options = container;

  slot_populate.call(this.controls, null, {
    "mutant-options": this.mutant_options,
  });
};

function ea_controls_range(opts = {}) {
  if (!opts.sliders) return null;

  const domain = [];

  const update = (x, i, el) => {
    el.innerText = (+x).toFixed(maybe(this, 'raster', 'precision') || 0);

    const man = maybe(this.controls, i ? 'manual_max' : 'manual_min');
    if (man) man.value = x;

    domain[i] = parseFloat(x);
  };

  const v1 = ce('div', null, { bind: "v1" });
  const v2 = ce('div', null, { bind: "v2" });

  l = tmpl('#ramp');
  l.className = 'ramp';
  l.append(v1, ce('div', opts.ramp || 'range', { class: "unit-ramp" }), v2);

  const r = ea_svg_interval({
    sliders: opts.sliders,
    width: opts.width || 256,
    init: this.domain_init,
    domain: this.domain,
    steps: opts.steps,
    callback1: x => update(x, 0, v1),
    callback2: x => update(x, 1, v2),
    end_callback: _ => O.dataset(this, 'domain', domain),
  });

  const el = ce('div');
  el.append(r.svg, l);

  return {
    el: el,
    svg: r.svg,
    change: r.change,
    ramp: l
  };
};

function ea_controls_weight() {
  const weights = [1,2,3,4,5];

  const ramp = tmpl('#ramp');
  ramp.append(
    ce('div', weights[0] + ""),
    ce('div', "importance", { class: "unit-ramp" }),
    ce('div', weights[weights.length - 1] + "")
  );

  const w = ea_svg_interval({
    sliders: "single",
    init: [1, this.weight],
    domain: [1, 5],
    steps: weights,
    width: 256,
    end_callback: x => O.dataset(this, 'weight', x)
  });

  const el = ce('div');
  el.append(w.svg, ramp);

  return {
    el: el,
    svg: w.svg,
    change: w.change,
    ramp: ramp,
  };
};

function ea_controls_collection_list() {
  if (!this.items) return;

  const e = ce('ul', null, { class: 'collection' });

  for (let d of this.items)
    e.append(ce('li', d.name));

  return e;
};

async function ea_controls_selectlist() {
  let data = {};

  const p = {
    "select": ["id", "name"],
    "online": "eq.true",
    "datasets_count": "gt.0",
    "parent_id": GEOGRAPHY.parent_id ? `eq.${GEOGRAPHY.parent_id}` : "is.null",
    "order": "name.asc"
  };

  const list = await ea_api.get("geographies", p).then(j => {
    j.forEach(g => data[g.name] = g.name);
    return j;
  });

  function set_default(input) {
    const g = list.find(x => x.id === GEOGRAPHY.id);
    if (g) input.value = g.name;

    return input;
  };

  const sl = new selectlist("controls-geography", data, {
    'change': function(e) {
      const c = list.find(x => x.name === this.value);

      if (maybe(c, 'id') && GEOGRAPHY.id !== c.id) {
        const url = new URL(location);
        url.searchParams.set('id', c.id);
        location = url;
      }
    }
  });

  const info = tmpl('#svg-info');
  info.querySelector('path').setAttribute('fill', 'rgba(255, 255, 255, 0.3)');
  info.onclick = ea_overview;
  info.style = `
display: inline-block;
transform: scale(1.2);
width: 50px;
cursor: pointer;
`;

  qsa('.controls-select-container')[0].append(sl.el, info);

  set_default(sl.input);
};

function ea_controls_sort_datasets(config) {
  const {sort_datasets, sort_subbranches, sort_branches} = config;

  const controls = qs('#controls');
  const controls_elements = qsa('ds-controls', controls);

  if (maybe(sort_datasets, 'length'))
    for (let id of sort_datasets.slice(0).reverse()) {
      for (let el of controls_elements) {
        if (el.ds.id === id)
          el.closest('.controls-container').prepend(el);
      }
    }

  const subbranches_elements = qsa('.controls-subbranch', controls);

  if (maybe(sort_subbranches, 'length'))
    for (let subbranch of sort_subbranches.slice(0).reverse()) {
      for (let el of subbranches_elements) {
        if (el.id === 'controls-subbranch-' + subbranch) el.closest('.controls-branch').prepend(el);
      }
    }

  const branches_elements = qsa('.controls-branch', controls);
  const branches_tabs = qsa('.controls-branch-tab', controls);

  if (maybe(sort_branches, 'length'))
    for (let branch of sort_branches.slice(0).reverse()) {
      for (let el of branches_elements) {
        if (el.id === 'controls-branch-' + branch) {
          qs('#controls-contents').prepend(el);

          const t = qs('#controls-tab-' + branch);
          if (t) qs('#controls-tabs').prepend(t);
          else warn("nope...");
        }
      }
    }
};

function ea_controls_dropdown() {
  const dropdownlist = [];

  if (!Object.keys(this.ds.metadata).every(k => !this.ds.metadata[k])) {
    dropdownlist.push({
      "content": "Dataset info",
      "action": _ => ea_dataset_modal(this.ds)
    });
  }

  if (this.weight_group) {
    dropdownlist.push({
      "content": "Toggle advanced controls",
      "action": _ => {
        if (!this.ds.on) this.ds.toggle();

        qs('.advanced-controls', this).style.display = (this.show_advanced = !this.show_advanced) ? 'block' : 'none';
      }
    });
  }

  dropdownlist.push({
    "content": "Reset default values",
    "action": _ => this.reset_defaults()
  });

  dropdownlist.push({
    "content": "Set values manually",
    "action": _ => qs('.manual-controls', this).style.display = 'flex'
  });

  // Enable this later when we are ready to let the users download the
  // original file.
  //
  // if (this.ds.download) {
  //   dropdownlist.push({
  //     "content": "Download dataset file",
  //     "action": _ => fake_download(this.ds.download, null)
  //   });
  // }
  //
  return dropdownlist;
};
