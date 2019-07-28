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
  sortable('#inputs-list', 'disable');

  const inputs = qs('#inputs-pane');
  const inputs_list = qs('#inputs-list', inputs);

  const ldc = list.map(i => DS.get(i).input_el);

  const init = inputs_list.children.length === 0;

  for (let i of ldc)
    if (!inputs_list.contains(i)) { (init ? inputs_list.append(i) : inputs_list.prepend(i)) }

  for (let i of inputs_list.children)
    if (!list.includes(i.ds.id)) inputs_list.removeChild(i);

  sortable('#inputs-list', 'enable');
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

  refresh() {
    const tmp = this.svg();
    qs('[slot=svg]', this).replaceChild(tmp, this.svg_el);
    this.svg_el = tmp;
  };

  opacity() {
    const e = tmpl('#opacity-control');
    let o = 1;

    const grad = ea_svg_interval(
      true, null, {
        callback1: null,
        callback2: x => o = x,
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
            ea_mapbox.setPaintProperty(this.ds.id, i, parseFloat(o));
        }
      }
    );

    const b = qs('.box', e);

    qs('.slider', e).append(grad.svg);
    qs('.icon', e).onclick = _ => b.style.display = 'block';
    b.onmouseleave = _ => b.style.display = 'none';

    return e;
  };

  svg() {
    const d = this.ds;
    let e, cs;

    if (d.scale_stops)
      cs = ea_svg_color_steps(d.color_scale_fn, d.scale_stops);
    else {
      if (d.parent)
        cs = ea_svg_color_steps(d.parent.color_scale_fn, d.parent.scale_stops);
    }

    if (!cs) console.log("No color_scale_svg for", d.id);

    switch (d.datatype) {
    case 'points':
      e = ea_svg_points_symbol.call(d);
      break;

    case 'lines':
      e = ea_svg_lines_symbol.call(d);
      break;

    case 'polygons':
      e = (d.vectors.color_stops && d.vectors.color_stops.length && d.parent) ?
        cs :
        ea_svg_polygons_symbol.call(d);
      break;

    case 'raster':
      e = cs;
      break;

    default:
      console.warn("dsinput.svg could not be set.", d.id);
      break;
    }

    if (d.collection) {
      const el = ce('ul', null, { class: 'collection' });

      for (let i of d.config.collection) {
        let x = DS.get(i);
        let li = ce('li');

        li.append(x.input_el.svg(), ce('div', x.name, { class: 'subheader' }));
        el.append(li);
      }

      return el;
    }

    return e;
  };

  ramp() {
    const d = this.ds;
    let t = null;
    let el = null;

    if (d.collection) return;

    switch (d.datatype) {
    case "raster":
      el = tmpl("#ramp-label-min-max");
      qs('[bind=min]', el).innerText = d.heatmap.domain.min * d.heatmap.factor;
      qs('[bind=max]', el).innerText = d.heatmap.domain.max * d.heatmap.factor;
      break;

    case "polygons":
      el = (d.vectors.color_stops && d.vectors.color_stops.length && d.parent) ?
        tmpl("#ramp-label-0-100") :
        null;
      break;

    default:
      break;
    }

    return el;
  };
}

customElements.define('ds-input', dsinput);
