function ea_cards_init(arr) {
  const pane = qs('#cards-pane');
  const list = qs('#cards-list', pane);

  sortable('#cards-list', {
    "items": 'ds-card',
    "forcePlaceholderSize": true,
    "placeholder": '<div style="margin: 1px; background-color: rgba(0,0,0,0.3);"></div>',
  })[0]
    .addEventListener(
      'sortupdate',
      e => {
        ea_overlord({
          "type": 'sort',
          "target": e.detail.destination.items.map(i => i.getAttribute('bind')),
          "caller": 'ea_cards_init',
        })
      });

  ea_cards(arr.reverse());
};

function ea_cards(list) {
  const cards = qs('#cards-pane');
  const cards_list = qs('#cards-list', cards);

  const ldc = list.map(i => DS.get(i).card);
  const empty = cards_list.children.length === 0;

  if (!empty) sortable('#cards-list', 'disable');

  for (let i of ldc)
    if (!cards_list.contains(i)) cards_list.prepend(i)

  if (!empty) sortable('#cards-list', 'enable');
};

async function ea_cards_sort(list) {
  for (let i of list.slice(0).reverse())
    await DS.get(i).raise();
};

class dscard extends HTMLElement {
  constructor(d) {
    if (!(d instanceof DS)) throw Error(`dscard: Expected a DS. Got ${d}.`);
    super();

    this.ds = d;

    if (d.disabled) return undefined;

    attach.call(this, shadow_tmpl('#ds-card-template'));

    this.svg_el = this.svg();

    this.render();

    return this;
  };

  render() {
    this.setAttribute('bind', this.ds.id);

    slot_populate.call(this, this.ds, {
      "svg": this.svg_el,
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
    const it = qs('[slot=svg]', this);

    elem_empty(it);
    it.append(this.svg_el = tmp);
  };

  line_legends(legends) {
    const it = qs('[slot=svg]', this);

    elem_empty(it);

    const ul = ce('div', null, { style: "font-size: smaller;" });

    for (let l of legends) {
      const svg = d3.create("svg")
            .attr("width", 24)
            .attr("height", 24)
            .attr("style", "vertical-align: middle;")
            .attr("viewBox", "-3 0 32 32");

      svg
        .append('path')
        .attr('d', "M 0.5625,23.71875 C 2.0625,8.0625 14.439788,10.706994 17.625,7.5 20.810212,4.2930056 23.71875,0.375 23.71875,0.375")
        .attr('fill', 'none')
        .attr('stroke', l['stroke'] || 'black')
        .attr('stroke-width', l['stroke-width'] || 1);

      const li = ce('div');
      li.append(svg.node(), ce('span', '&nbsp;&nbsp;&nbsp;'), l.params.map(p => l[p]).join(", "));

      ul.append(li);
    }

    it.append(ul);
  };

  opacity() {
    let o = 1;
    const e = tmpl('#opacity-control');
    const r = tmpl('#ramp');
    r.append(ce('div', '0%'), ce('div', 'Opacity'), ce('div', '100%'));

    qs('.opacity-box', e).append(r);

    const grad = ea_svg_interval({
      init: [null, 100],
      domain: [0, 100],
      single: true,
      callback2: x => o = x/100,
      end_callback: _ => {
        let t = null;

        switch (this.ds.datatype) {
        case 'points': {
          t = ['circle-opacity', 'circle-stroke-opacity'];
          break;
        }

        case 'lines': {
          t = ['line-opacity'];
          break;
        }

        case 'polygons': {
          t = ['fill-opacity'];
          break;
        }

        case 'raster': {
          t = ['raster-opacity'];
          break;
        }

        default:
          break;
        }

        for (let i of t)
          MAPBOX.setPaintProperty(this.ds.id, i, parseFloat(o));
      }
    });

    const b = qs('.opacity-box', e);

    qs('.slider', e).append(grad.svg);
    qs('svg', e).onclick = _ => b.style.display = 'block';
    b.onmouseleave = _ => b.style.display = 'none';

    return e;
  };

  svg() {
    const ds = this.ds;
    let d = ce('div');
    let e = maybe(ds.colorscale, 'svg') || ce('div');

    switch (ds.datatype) {
    case 'points':
      e = ea_svg_points_symbol.call(ds);
      break;

    case 'lines': {
      e = ea_svg_lines_symbol.call(ds);
      break;
    }

    case 'polygons': {
      if (ds.id.match('boundaries-')) {
        e.append(ea_svg_color_steps(ds.colorscale.stops));

        let r = tmpl('#ramp');
        r.append(ce('div', "0"), ce('div', "%"), ce('div', "100"));
        d.append(r);
      }

      else if (ds.category.timeline) {
        const r = tmpl("#ramp");

        r.append(
          ce('div', (maybe(ds.csv, 'data', 'min') || 0) + ""),
          ce('div', ds.unit),
          ce('div', (maybe(ds.csv, 'data', 'max') || 100) + "")
        );

        e.append(
          ea_svg_color_steps(ds.csv.config.color_stops), r,
          ce('div', null, { style: "display: inline-block; width: 64px; height: 5px; background-color: rgba(155,155,155,1); margin: 15px 15px 0 0;" }),
          ce('div', "Not Available", { style: "display: inline-block; font-size: x-small;" })
        );
      }

      else {
        e = ea_svg_polygons_symbol.call(ds);
      }

      break;
    }

    case 'raster': {
      let r = tmpl("#ramp");
      r.append (
        ce('div', ds.raster.config.domain.min * ds.raster.config.factor + ""),
        ce('div', ds.raster.config.domain.max * ds.raster.config.factor + ""));

      d.append(r);

      break;
    }

    default: {
      warn("dscard.svg could not be set.", ds.id);
      break;
    }
    }

    if (ds.items) {
      const el = ce('ul', null, { class: 'collection' });

      for (let d of ds.items) {
        let li = ce('li');

        li.append(d.card.svg_el, ce('div', d.name, { class: 'subheader' }));
        el.append(li);
      }

      return el;
    }

    d.prepend(e);

    return d;
  };
}

customElements.define('ds-card', dscard);
