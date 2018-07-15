function ea_countries_setup() {
  let b = [[-180, -85], [180, 85]];
  let width, height;

  const p = document.querySelector('#playground');
  p.style['height'] = `calc(${window.innerHeight}px - 3.5em)`;

  width = window.innerWidth;
  height = p.clientHeight;

  const svg = d3.select('#svg-map')
        .attr('width', width)
        .attr('height', height);

  const maparea = document.querySelector('#maparea');
  maparea.style['width'] = width + "px";
  maparea.style['height'] = height + "px";

  const coord_tooltip = document.querySelector('body')
        .appendChild(elem(`<div id="coord-tooltip"></div>`));

  const cs  = document.querySelector('#country-search');
  const csi = cs.querySelector('#country-search-input');
  const css = cs.querySelector('#country-search-flag');

  d3.queue()
    .defer(d3.json, ea_path_root + '/lib/world-50m.json')
    .defer(d3.json, ea_path_root + '/lib/countries.json')
    .defer(d3.csv,  ea_path_root + '/data/countries-overview.csv')
    .await((error, geo, countries, countries_overviews) => {
      var topo = topojson.feature(geo, geo.objects.countries);

      if (error) {
        ea_ui_flash('error', error.target.statusText, error.target.responseURL);
        console.log(error);
      }

      ea_map = ea_map_svg(svg, geo, 'countries', { center: [0,0], scale: 350 });

      ea_map_load_features({
        map: ea_map,
        features: topo.features,
        cls: 'land',
        scale: 0,
        classed: (v) => typeof countries_overviews.find(c => c.ccn3 === v) !== 'undefined',
        mousedown: (v) => ea_countries_overview(countries.find(c => c.ccn3 === v), countries_overviews),
        mouseover: (v) => {
          const x = countries.find(c => c.ccn3 === v);

          if (!x) return v;

          csi.value = x.name.common;
          css.innerHTML = (`<img class="flag"
                                 src="https://cdn.rawgit.com/mledoze/countries/master/data/${x.cca3.toLowerCase()}.svg" />`);

          return v;
        },
      }).style('fill', '#A98B6F');

      ea_ui_app_loading(false);

      // mapbox_setup(b);
    });
}

function ea_countries_overview(c, collection) {
  var r = collection.find(i => i.country === c.name.common)

  var co = document.querySelector('#country-overview');
  co.innerHTML = `<h2>${c.name.common}</h2>`;

  var demo, pop, area, urban_rural, pol, gdp, pies, ease, dev;

  if (r) {
    demo = elem('<h4>Demographics</h4>');
    dev = elem('<h4>Development</h4>');

    if (+r['population'] > 0)
      pop = elem(`<div>Population: ${(+r['population']).toLocaleString()} Million</div>`);

    if (+r['area'] > 0)
      area = elem(`<div>Area: ${(+c['area']).toLocaleString()} km<sup>2</sup></div>`);

    if (+r['urban-perc'] + +r['rural-perc'] === 100)
      urban_rural = elem(`<div><br>
<div style="display: flex; width: 300px; color: transparent;">
  <div style="width: ${((+r['urban-perc']) / 100) * 300}px; background-color: brown;">Urban:&nbsp;${r['urban-perc']}%</div>
  <div style="width: ${((+r['rural-perc']) / 100) * 300}px; background-color: lightgreen;">Rural:&nbsp;${r['rural-perc']}%</div>
</div>

<div style="display: flex; width: 300px; justify-content: space-between;">
  <div>Urban:&nbsp;${r['urban-perc']}%</div>
  <div>Rural:&nbsp;${r['rural-perc']}%</div>
</div>
</div>`);

    if (+r['energy-access-policy-support'] > 0)
      pol = elem(`<div>Policy support for energy access: ${(r['energy-access-policy-support'])}/100</div>`);

    if (+r['energy-access-comprehensive-policy-support'] > 0)
      gdp = elem(`<div>GDP per capita: USD ${(+r['gdp-per-capita']).toFixed(2).toLocaleString()}</div>`)

    if (+r['electrification-rate-national'] > 0)
      pies = elem(`<div>
<h4>Electrification Rate</h4>
<h5>National: ${r['electrification-rate-national']}%</h5>
<div class="pie-charts-legends" style="display: flex; width: 300px; justify-content: space-around;"></div>
<div class="pie-charts" style="display: flex; width: 300px; justify-content: space-around;"></div>
</div>`);

    if (+r['ease-business'] > 0)
      ease = elem(`<div>Ease of doing business: ${r['ease-business']} / 190</div>`);

    [demo, area, pop, urban_rural, gdp, pies, dev, pol, ease].forEach(t => t ? co.appendChild(t) : null);

    if (+r['electrification-rate-urban'] > 0) {
      co.querySelector('.pie-charts-legends')
        .appendChild(elem(`<h5>Urban:&nbsp;${r['electrification-rate-urban']}%</h5>`));

      ea_svg_pie(
        `#${ co.id } .pie-charts`,
        [[+r['electrification-rate-urban']], [100 - +r['electrification-rate-urban']]],
        50,
        0,
        ["#3A75C4", "lightgray"],
        "",
        true
      ).change(0);
    }

    if (+r['electrification-rate-rural'] > 0) {
      co.querySelector('.pie-charts-legends')
        .appendChild(elem(`<h5>Rural:&nbsp;${r['electrification-rate-rural']}%</h5>`));

      ea_svg_pie(
        `#${ co.id } .pie-charts`,
        [[+r['electrification-rate-rural']], [100 - (+r['electrification-rate-rural'])]],
        50,
        0,
        ["#3A75C4", "lightgray"],
        "",
        true
      ).change(0);
    }

  } else {
    co.innerHTML = `<strong>${c.name.common}</strong> not included`;
  }
}

function ea_countries_init() {

};
