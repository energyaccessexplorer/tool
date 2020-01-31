function ea_select_topo_flag(c) {
  let cca3 = c.cca3.toLowerCase();

  const width = MOBILE ? 100 : 200;
  const padding = 1;

  const config = c.configuration.flag || {
    'x': 0,
    'y': 0,
    'height': 30,
    'aspect-ratio': "xMidYMid slice"
  };

  const svg = d3.select(document.createElementNS("http://www.w3.org/2000/svg", "svg"))
        .attr('width',  width)
        .attr('height',  width);

  const geopath = d3.geoPath()
        .projection(d3.geoMercator());

  svg.append('defs')
    .append('pattern')
    .attr('id', `flag-${cca3}`)
    .attr('patternUnits', 'objectBoundingBox')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', 1)
    .attr('height', 1)

    .append('image')
    .attr('href', `../mledoze-countries/data/${cca3}.svg`)
    .attr('x', config['x'] || 0)
    .attr('y', config['y'] || 0)
    .attr('width', config['width'])
    .attr('height', config['height']);

  const g = svg.append('g');

  fetch(`../mledoze-countries/data/${cca3}.topo.json`)
    .then(r => r.json())
    .then(topo => {
      const path = g.selectAll(`path`)
            .data(topojson.feature(topo, topo.objects[cca3 + '.geo']).features)
            .enter().append('path')
            .attr('stroke', 'none')
            .attr('fill', `url(#flag-${cca3})`)
            .attr('d', geopath);

      const box = path.node().getBBox();
      const s = (box.height > box.width) ? (box.height - box.width)/2 : 0;

      const factor = Math.min(
        width / (box.width + (padding * 2)),
        width / (box.height + (padding * 2))
      );

      g.attr('transform', `scale(${factor})translate(${(-box.x + padding + s)}, ${(-box.y + padding)})`);
    });

  return svg.node();
};

async function ea_select_geography(c) {
  const coll = await ea_api("geographies", {
    "online": "eq.true",
    "datasets_count": "gt.0",
    "parent_id": `eq.${c.id}`
  });

  const data = {};
  for (let x of coll) data[x.name] = x.name;

  const sl = new selectlist(`geographies-select-` + c.id, data, {
    'change': function(e) {
      const x = coll.find(x => x.name === this.value);
      if (x) location = location = `/tool/a?id=${x.id}`;
    }
  });

  if (coll.length === 0) {
    location = `/tool/a?id=${c.id}`;
    return;
  }

  let content = ce('div');
  content.append(
    ce('p', `We have several geographies for ${c.name}. Please do select one.`),
    sl.el
  );

  ea_modal.set({
    header: c.name,
    content: content,
    footer: null
  }).show();

  sl.input.focus();
};

function ea_select_setup() {
  const playground = qs('#playground');

  MOBILE = window.innerWidth < 1152;

  let curr_c = null;

  ea_api("geographies", { "online": "eq.true", "adm": "eq.0" })
    .then(countries_online => {
      for (let co of countries_online) {
        const d = ce('div', ce('h2', co.name, { class: 'country-name' }), { class: 'country-item', ripple: "" });
        d.onclick = _ => setTimeout(_ => ea_select_geography(co), 350);

        d.append(ea_select_topo_flag(co));
        playground.append(d);
      }

      ea_loading(false);
    })
    .catch(error => {
      ea_flash.push({
        type: 'error',
        title: "Fetch error",
        message: error
      });

      throw error;
    });
};
