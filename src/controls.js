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

    const lr = c.range_label || cat.unit || 'range';

    let steps;
    if (c.range_steps) {
      steps = [];
      const s = (this.ds.raster.config.domain.max - this.ds.raster.config.domain.min) / (c.range_steps - 1);

      for (let i = 0; i < c.range_steps; i += 1)
        steps[i] = this.ds.raster.config.domain.min + (s * i);
    }

    switch (this.ds.datatype) {
    case 'raster':
    case 'raster-mutant': {
      this.range_group = ea_controls_range.call(this.ds, {
        ramp: lr,
        steps: steps,
        single: c.range === 'single'
      });
      break;
    }

    case 'points':
    case 'lines':
    case 'polygons': {
      if (!this.ds.raster) break;

      this.range_group = ea_controls_range.call(this.ds, {
        ramp: lr,
        steps: steps,
        single: c.range === 'single'
      });
      break;
    }

    case 'polygons-fixed':
    case 'polygons-timeline': {
      this.range_group = ea_controls_range.call(this.ds, {
        ramp: lr,
        steps: steps,
        single: c.range === 'single'
      });
      break;
    }

    default: {
      this.range_group = null;
      break;
    }
    }

    this.manual_setup();

    if (this.ds.items)
      this.collection_list = ea_controls_collection_list.call(this.ds);

    if (this.ds.mutant)
      this.mutant_options = ea_controls_mutant_options.call(this.ds);

    this.dropdown = new dropdown(ea_controls_dropdown.call(this));
  };

  render() {
    this.content.style.display = this.ds.active ? '' : 'none';

    slot_populate.call(this, this.ds, {
      "dropdown": this.dropdown,
      "info": this.info,
      "checkbox": this.checkbox.svg,
      "collection-list": this.collection_list,
      "mutant-options": this.mutant_options,
      "range-slider": maybe(this.range_group, 'el'),
      "weight-slider": maybe(this.weight_group, 'el'),
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
    this.main.classList[this.ds.active ? 'add' : 'remove']('active');

    if (this.checkbox) this.checkbox.change(t);
  };

  inject() {
    const ds = this.ds;
    const path = maybe(ds.category, 'controls', 'path');

    if (!path.length) return;

    const controls = qs('#controls-contents');
    const controls_tabs_el = qs('#controls-tabs');

    function create_tab(name) {
      return ce('div', ea_branch_dict[name] || name, { id: 'controls-tab-' + name, class: 'controls-branch-tab up-title' });
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

    let b = qs(`#${path[0]}.controls-branch`, controls);
    if (!b) b = create_branch(path[0]);
    controls.append(b);

    let sb = qs(`#${path[1]}.controls-subbranch`, b);
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
      this.weight_group.change(this.ds.weight = 2);
    }

    if (this.range_group) {
      const d = this.ds.raster.config.init;
      this.range_group.change(d.min, d.max);
    }

    ea_overlord({
      "type": "controls",
      "target": this.ds,
      "caller": "dscontrols_restore_defaults"
    });
  };

  manual_setup() {
    if (!this.manual_min || !this.manual_max) return;

    this.manual_min.value = maybe(this.ds, 'domain', 0) || "";
    this.manual_max.value = maybe(this.ds, 'domain', 1) || "";

    this.manual_min.onchange = e => {
      let v = +e.target.value;

      if (v > this.ds.domain[1]) {
        e.target.value = this.ds.domain[1];
      }

      this.ds.domain[0] = v;
      this.range_group.change(...this.ds.domain);

      ea_overlord({
        "type": "dataset",
        "target": this.ds,
        "caller": "ea_controls manual",
      });
    };

    this.manual_max.onchange = e => {
      let v = +e.target.value;

      if (v < this.ds.domain[0]) {
        e.target.value = this.ds.domain[0];
      }

      this.ds.domain[1] = v;
      this.range_group.change(...this.ds.domain);

      ea_overlord({
        "type": "dataset",
        "target": this.ds,
        "caller": "ea_controls manual",
      });
    };

    switch (maybe(this.ds, 'category', 'controls', 'range')) {
    case 'single':
      this.manual_min.setAttribute('disabled', true);
      break;

    case 'double':
    default:
      break;
    }
  };
}

customElements.define('ds-controls', dscontrols);

function ea_controls_init(state) {
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

  const tab_filters = qs('#controls-tab-filters', controls_tabs_el);
  if (tab_filters) ea_controls_select_tab(tab_filters, "filters");
  else ea_controls_select_tab(tab_all, "all");
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

  const b = qs('#' + name, controls);
  if (b) b.style.display = 'block';
};

function ea_controls_checkbox() {
  const checkbox = ea_svg_switch(this.active);
  const svg = checkbox.svg;

  checkbox.click = e => {
    if (e.target.closest('svg') === svg)
      this.toggle();

    else if (e.target.closest('.more-dropdown') === this.controls.dropdown)
      return;

    else
      svg.dispatchEvent(new Event('click', { bubbles: true }));

    return this.active;
  };

  return checkbox;
};

function ea_controls_mutant_options() {
  const container = ce('div', null, { class: 'control-option' });
  const select = ce('select');

  this.hosts.forEach(d => select.append(ce('option', d.name, { value: d.id })));

  select.value = this.host.id;

  select.onchange = async e => {
    const host = DST[e.target.value];

    await this.mutate(host);

    ea_overlord({
      "type": "dataset",
      "target": this,
      "caller": "ea_controls_mutant_options",
    });
  };

  container.append(select);

  return container;
};

function ea_controls_range(opts = {}) {
  const update = (x, i, el) => {
    if (this.datatype.match('raster-'))
      el.innerText = (x * (this.raster.config.factor || 1)).toFixed(this.raster.config.precision || 0);
    else
      el.innerText = x;

    const man = maybe(this.controls, i ? 'manual_max' : 'manual_min');
    if (man) man.value = x;

    this.domain[i] = parseFloat(x);
  };

  const v1 = ce('div', null, { bind: "v1" });
  const v2 = ce('div', null, { bind: "v2" });

  l = tmpl('#ramp');
  l.className = 'ramp';
  l.append(v1, ce('div', opts.ramp || 'range', { class: "unit-ramp" }), v2);

  const r = ea_svg_interval({
    single: opts.single,
    width: opts.width || 256,
    init: this.domain_default,
    domain: this.domain,
    steps: opts.steps,
    callback1: x => update(x, 0, v1),
    callback2: x => update(x, 1, v2),
    end_callback: _ => {
      ea_overlord({
        "type": "controls",
        "target": this,
        "caller": "ea_controls_range",
      });
    }
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
    single: true,
    init: [1, this.weight],
    domain: [1, 5],
    steps: weights,
    width: 256,
    end_callback: x => {
      this.weight = x;

      ea_overlord({
        "type": "controls",
        "target": this,
        "caller": "ea_controls_weight",
      });
    }
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

  const url = new URL(location);
  const id = url.searchParams.get('id');

  const list = await ea_api("geographies", {
    select: ["id", "name"],
    online: "eq.true",
    datasets_count: "gt.0",
    parent_id: GEOGRAPHY.parent_id ? `eq.${GEOGRAPHY.parent_id}` : "is.null",
    order: "name.asc"
  }).then(j => {
    j.forEach(g => data[g.name] = g.name);
    return j;
  });

  function set_default(input) {
    const g = list.find(x => x.id === id);
    if (g) input.value = g.name;

    return input;
  };

  const sl = new selectlist("controls-geography", data, {
    'change': function(e) {
      const c = list.find(x => x.name === this.value);

      if (maybe(c, 'id') && id !== c.id) {
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

function ea_controls_sort_datasets(list) {
  const collection = qsa('ds-controls', qs('#controls'));

  for (let id of list.reverse()) {
    for (let dsc of collection) {
      if (dsc.ds.id === id)
        dsc.closest('.controls-container').prepend(dsc);
    }
  }

  const subcategories = qsa('.controls-subbranch', qs('#controls'));

  for (let id of [
    'demographics', 'productive-uses',
    'resources', 'infrastructure'
  ]) {
    for (let s of subcategories)
      if (s.id === id) s.closest('.controls-branch').append(s);
  }
};
