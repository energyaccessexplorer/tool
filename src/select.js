function ea_select_topo_flag(c) {
  let cca3 = c.cca3.toLowerCase();

  const width = 200;
  const padding = 1;

  const svg = d3.select(document.createElementNS("http://www.w3.org/2000/svg", "svg"))
        .attr('width',  width)
        .attr('height', width + 100);

  const geopath = d3.geoPath()
        .projection(d3.geoMercator());

  svg.append('defs')
    .append('pattern')
    .attr('id', `flag-${cca3}`)
    .attr('patternUnits', 'objectBoundingBox')
    .attr('width', 1)
    .attr('height', 1)

    .append('image')
    .attr('href', `../mledoze-countries/data/${cca3}.svg`)
    .attr('height', 30)
    .attr('preserveAspectRatio', "xMaxYMin slice")

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
  let b = [[-180, -85], [180, 85]];

  const playground = document.querySelector('#playground');

  let curr_c = null;

  Promise.all([
    d3.json(ea_settings.database + '/countries?online'),
    d3.json('../lib/countries.json'),
  ])
    .then(results => {
      const countries_online = results[0];
      const countries = results[1];

      for (let co of countries_online) {
        let ko = countries.find(c => +c.ccn3 === co.ccn3);
        let d = elem(`
<div class="country-item" ripple
     iso3="${ko.ccn3}">
  <h2 class="country-name">${ko.name.common}</h2>
</div>`);

        d.addEventListener('mouseup', function() {
          setTimeout(_ => ea_countries_action_modal(countries.find(c => c.ccn3 === ko.ccn3)), 350);
        });

        d.append(ea_select_topo_flag(co))
        playground.append(d);
      }

      ea_ui_app_loading(false);
    })
    .catch(error => {
      ea_flash
        .type('error')
        .title(error)();

      console.error(error);
    });
};
