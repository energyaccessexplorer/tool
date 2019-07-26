function ea_select_topo_flag(c) {
  let cca3 = c.cca3.toLowerCase();

  const width = 200;
  const padding = 1;

  const config = c.configuration.flag || {
    'x': 0,
    'y': 0,
    'height': 30,
    'aspect-ratio': "xMidYMid slice"
  }

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

function ea_select_setup() {
  const playground = document.querySelector('#playground');

  let curr_c = null;

  ea_client(ea_settings.database + '/geographies?online=eq.true&adm=eq.0')
    .then(countries_online => {
      for (let co of countries_online) {
        const d = ce('div', ce('h2', co.name, { class: 'country-name' }), { class: 'country-item', ripple: "" });
        d.onclick = _ => setTimeout(_ => ea_countries_action_modal(co), 350);

        d.append(ea_select_topo_flag(co))
        playground.append(d);
      }

      ea_ui_app_loading(false);
    })
    .catch(error => {
      ea_flash
        .type('error')
        .title(error)();

      throw error;
    });
};
