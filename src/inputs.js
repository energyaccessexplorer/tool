function ea_inputs_init() {
  const inputs = qs('#inputs-pane');
  const list = qs('#inputs-list', inputs);

  sortable('#inputs-list', {
    "items": 'ds-input',
    "forcePlaceholderSize": true,
    "placeholder": '<div style="margin: 1px; background-color: rgba(0,0,0,0.3);"></div>',
  })[0]
    .addEventListener(
      'sortupdate',
      e => {
        ea_overlord({
          "type": 'sort',
          "target": e.detail.destination.items.map(i => i.getAttribute('bind')),
          "caller": 'ea_inputs_init',
        })
      });
};

function ea_inputs(list) {
  const inputs = qs('#inputs-pane');
  const inputs_list = qs('#inputs-list', inputs);

  const ldc = list.map(i => DS.get(i).input);
  const empty = inputs_list.children.length === 0;

  if (!empty) sortable('#inputs-list', 'disable');

  for (let i of ldc)
    if (!inputs_list.contains(i)) { empty ? inputs_list.append(i) : inputs_list.prepend(i) }

  for (let i of inputs_list.children)
    if (!list.includes(i.ds.id)) inputs_list.removeChild(i);

  if (!empty) sortable('#inputs-list', 'enable');
};

async function ea_inputs_sort(list) {
  for (let i of list.slice(0).reverse())
    await DS.get(i).raise();
};

class dsinput extends HTMLElement {
  constructor(d) {
    if (!(d instanceof DS)) throw Error(`dsinput: Expected a DS. Got ${d}.`);
    super();

    this.ds = d;

    if (d.disabled) return undefined;

    attach.call(this, shadow_tmpl('#ds-input-template'));

    this.svg_el = this.svg();
    this.ramp_el = this.ramp();

    this.render();

    return this;
  };

  render() {
    this.setAttribute('bind', this.ds.id);

    slot_populate.call(this, this.ds, {
      "svg": this.svg_el,
      "ramp": this.ramp_el,
      "opacity": this.opacity(),
      "handle": tmpl("#svg-handle"),
    });

    return this;
  };

  disable() {
    this.remove();
  };

  refresh() {
    const tmp = this.svg();
    qs('[slot=svg]', this).replaceChild(tmp, this.svg_el);
    this.svg_el = tmp;
  };

  opacity() {
    let o = 1;
    const e = tmpl('#opacity-control');
    const ramp = tmpl('#ramp');
    ramp.append(ce('div', '0%'), ce('div', 'Opacity'), ce('div', '100%'));

    qs('.opacity-box', e).append(ramp);

    const grad = ea_svg_interval({
      init: [null, 100],
      domain: [0, 100],
      single: true,
      callback2: x => o = x/100,
      end_callback: _ => {
        let t = null;

        switch (this.ds.datatype) {
        case 'points':
          t = ['circle-opacity', 'circle-stroke-opacity'];
          break;

        case 'lines':
          t = ['line-opacity'];
          break;

        case 'polygons':
          t = ['fill-opacity'];
          break;

        case 'raster':
          t = ['raster-opacity'];
          break;

        default:
          break;
        }

        for (let i of t)
          MAPBOX.setPaintProperty(this.ds.id, i, parseFloat(o));
      }
    }
    );

    const b = qs('.opacity-box', e);

    qs('.slider', e).append(grad.svg);
    qs('.icon', e).onclick = _ => b.style.display = 'block';
    b.onmouseleave = _ => b.style.display = 'none';

    return e;
  };

  svg() {
    const ds = this.ds;
    let e, cs;

    if (ds.colorscale && ds.colorscale.stops) {
      cs = ea_svg_color_steps(ds.colorscale.fn, ds.colorscale.stops);
    }
    else {
      if (ds.parent)
        cs = ea_svg_color_steps(ds.parent.colorscale.fn, ds.parent.colorscale.stops);
    }

    switch (ds.datatype) {
    case 'points':
      e = ea_svg_points_symbol.call(ds);
      break;

    case 'lines':
      e = ea_svg_lines_symbol.call(ds);
      break;

    case 'polygons':
      e = (ds.vectors.config.color_stops && ds.vectors.config.color_stops.length && ds.parent) ?
        cs :
        ea_svg_polygons_symbol.call(ds);
      break;

    case 'raster':
      e = cs;
      break;

    default:
      warn("dsinput.svg could not be set.", ds.id);
      break;
    }

    if (ds.items) {
      const el = ce('ul', null, { class: 'collection' });

      for (let d of ds.items) {
        let li = ce('li');

        li.append(d.input.svg_el, ce('div', d.name, { class: 'subheader' }));
        el.append(li);
      }

      return el;
    }

    return e;
  };

  ramp() {
    const d = this.ds;
    let t = null;
    let el = tmpl("#ramp");

    if (d.items) return;

    switch (d.datatype) {
    case "raster":
      el.append (
        ce('div', d.raster.config.domain.min * d.raster.config.factor + ""),
        ce('div', d.raster.config.domain.max * d.raster.config.factor + ""));
      break;

    case "polygons":
      if (d.vectors.config.color_stops && d.vectors.config.color_stops.length && d.parent) {
        el.append(
          ce('div', "0"),
          ce('div', "100"));
      }
      break;

    default:
      break;
    }

    return el;
  };
}

customElements.define('ds-input', dsinput);
