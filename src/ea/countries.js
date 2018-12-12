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

  const cf  = document.querySelector('#country-float');
  const cfn = cf.querySelector('#country-float-name');
  const cff = cf.querySelector('#country-float-flag');

  let curr_c = null;

  Promise.all([
    d3.json(ea_settings.database + '/countries?online'),
    d3.json(ea_settings.app_base + '/lib/world-50m.json'),
    d3.json(ea_settings.app_base + '/lib/countries.json'),
    d3.csv(ea_settings.app_base + '/data/countries-overview.csv')
  ])
    .then(results => {
      let geo = results[1];

      window.countries_online = results[0];
      window.countries = results[2];
      window.countries_overviews = results[3];

      const topo = topojson.feature(geo, geo.objects.countries);

      ea_map = ea_map_svg(svg, geo, 'countries', { center: [0,0], scale: 350 });

      ea_map_load_features({
        "map": ea_map,
        "features": topo.features,
        "cls": "land",
        "scale": 0,
        "classed": v => typeof countries_overviews.find(c => c.ccn3 === v) !== 'undefined',
        "mousedown": v => ea_countries_overview(countries.find(c => c.ccn3 === v), countries_overviews, countries_online),
        "mouseenter": v => {
          let x = countries.find(c => c.ccn3 === v);

          if (!x) return v;

          cf.style.display = '';
          cfn.style.display = '';

          ea_map.svg.select(`.land#land-${v}`).classed('active', true);

          if (curr_c === x) return;
          else curr_c = x;

          cfn.value = x.name.common;
          cff.innerHTML = (`<img class="flag"
                                 src="https://cdn.rawgit.com/mledoze/countries/master/data/${x.cca3.toLowerCase()}.svg" />`);

          const px = Math.min(window.innerWidth - cf.offsetWidth - 105, (d3.event.pageX + 7));
          const py = Math.min(window.innerHeight - cf.offsetHeight, (d3.event.pageY + 15));

          cf.style.left = `${ px }px`;
          cf.style.top =  `${ py }px`;

          return v;
        },
        "mouseleave": v => {
          ea_map.svg.select(`.land#land-${v}`).classed('active', false);
          cf.style.display = 'none';
        },
      });

      ea_ui_app_loading(false);
    })
    .catch(error => {
      flash()
        .type('error')
        .title(error)();

      console.log(error);
    });
};

function ea_countries_overview(c, collection, online) {
  const r = collection.find(i => i.country === c.name.common);

  const co = elem('<div class="country-overview">');

  let demo, pop, area, urban_rural, pol, gdp, pies, ease, dev, btn, rate;

  if (r) {
    if (+r['population'] > 0)
      pop = elem(`
<div class="overview-line">
  <strong>Population:</strong> ${(+r['population']).toLocaleString()} Million
</div>`);

    if (+r['area'] > 0)
      area = elem(`
<div class="overview-line">
  <strong>Area:</strong> ${(+c['area']).toLocaleString()} km<sup>2</sup>
</div>`);


    if (+r['urban-perc'] + +r['rural-perc'] === 100)
      urban_rural = elem(`
<div><br>
  <div style="display: flex; width: 300px; justify-content: space-around;">
    <h5>Urban:&nbsp;${r['urban-perc']}%</h5>
    <h5>Rural:&nbsp;${r['rural-perc']}%</h5>
  </div>
</div>`);

    if (+r['energy-access-policy-support'] > 0)
      pol = elem(`
<div class="overview-line">
  <strong>Policy support for energy access:</strong> ${(r['energy-access-policy-support'])}/100
</div>`);

    if (+r['energy-access-comprehensive-policy-support'] > 0)
      gdp = elem(`<div>GDP per capita: USD ${(+r['gdp-per-capita']).toFixed(2).toLocaleString()}</div>`);

    pies = elem(`
<div class="overview-line">
  <div class="pie-charts-legends" style="display: flex; width: 300px; justify-content: space-around;"></div>
  <div class="pie-charts" style="display: flex; width: 300px; justify-content: space-around;"></div>
</div>`);


    if (+r['electrification-rate-national'] > 0)
      rate = elem(`
<div class="overview-line">
  <strong>Electrification Rate:</strong> ${r['electrification-rate-national']}%
</div>`);

    if (+r['ease-business'] > 0)
      ease = elem(`
<div class="overview-line">
  <strong>Ease of doing business:</strong> ${r['ease-business']}/190
</div>`);

    if (online.map(x => x['ccn3']).indexOf(+r['ccn3']) > -1)
      btn = elem(`<button id="eae" onclick="window.location = '/maps-and-data/tool?ccn3=${r['ccn3']}'">Click to launch tool</a>`);

    [pop, urban_rural, pies, gdp, dev, area, pol, rate, ease, btn].forEach(t => t ? co.appendChild(t) : null);

    if (+r['electrification-rate-urban'] > 0) {
      co.querySelector('.pie-charts-legends')
        .appendChild(elem(`
<div class="overview-line">
  Electrified:&nbsp;<strong>${r['electrification-rate-urban']}%</strong>
</div>`));

      ea_svg_pie(
        co.querySelector('.pie-charts'),
        [[+r['electrification-rate-urban']], [100 - +r['electrification-rate-urban']]],
        50,
        0,
        [
          getComputedStyle(document.body).getPropertyValue('--the-light-green'),
          getComputedStyle(document.body).getPropertyValue('--the-green')
        ],
        "",
        true
      ).change(0);
    }

    if (+r['electrification-rate-rural'] > 0) {
      co.querySelector('.pie-charts-legends')
        .appendChild(elem(`
<div class="overview-line">
  Electrified:&nbsp;<strong>${r['electrification-rate-rural']}%</strong>
</div>`));

      ea_svg_pie(
        co.querySelector('.pie-charts'),
        [[+r['electrification-rate-rural']], [100 - (+r['electrification-rate-rural'])]],
        50,
        0,
        [
          getComputedStyle(document.body).getPropertyValue('--the-light-green'),
          getComputedStyle(document.body).getPropertyValue('--the-green')
        ],
        "",
        true
      ).change(0);
    }

  } else {
    co.innerHTML = `<strong>${c.name.common}</strong> not included`;
  }

  modal()
    .header(`<h2 id="country-name" style="margin: 0 auto; text-align: center;">${c.name.common}</h2>`)
    .content(co)()
};
