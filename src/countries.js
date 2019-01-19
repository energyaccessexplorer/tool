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

  let curr_c = null;

  // We save a copy of this. Fetching from carto makes offline development
  // impossible and it's sometimes super slow.
  //
  // let overviews_query = (`https://wri-rw.carto.com/api/v2/sql?q=select
  // LPAD(ccn3::text, 3, 0::text) as ccn3
  // , country
  // , population
  // , area_km2 as area
  // , gdp_percap_7_5_18 as "gdp-per-capita"
  // , urban_p_pop as "urban-perc"
  // , rural_p_pop as "rural-perc"
  // , urban_elec_rate as "electrification-rate-urban"
  // , rural_elec_rate as "electrification-rate-rural"
  // , total_elec_rate as "electrification-rate-national"
  // , policy_pct as "energy-access-policy-support"
  // , ease_of_business as "ease-business"
  // from country_indicators
  // `).replace("\n", ' ');
  //
  // d3.json(overviews_query).then(function(obj) {
  //   var a = document.createElement('a');
  //   a.style = "display:none;";
  //   document.body.appendChild(a);
  //
  //   var blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
  //   var url = URL.createObjectURL(blob);
  //   a.href = url;
  //   a.download = "countries-overviews.json";
  //   a.click();
  //
  //   window.URL.revokeObjectURL(url);
  // });

  Promise.all([
    d3.json(ea_settings.database + '/countries?online'),
    d3.json('../lib/world-50m.json'),
    d3.json('../lib/countries.json'),
    d3.json('../lib/country-overviews.json')
  ])
    .then(results => {
      let geo = results[1];

      window.countries_online = results[0];
      window.countries = results[2];
      window.countries_overviews = results[3].rows;

      const dropdown = document.querySelector('#country-dropdown');
      const button = document.querySelector('#country-select');

      dropdown.style.height = (document.querySelector('#maparea').clientHeight - 120) + "px";

      countries_overviews.forEach(c => {
        let cc = countries.find(x => x.ccn3 === c.ccn3);

        let e = elem(`
<div class="country-dropdown-element" bind="${cc.ccn3}">
  <div class="country-dropdown-name">${cc.name.common}</div>
</div>`);

        e.addEventListener(
          'click',
          _ => ea_countries_overview(
            countries.find(x => x.ccn3 === c.ccn3),
            countries_overviews,
            countries_online
          )
        );

        dropdown.appendChild(e);
      });

      dropdown.addEventListener('mouseleave', _ => dropdown.style.display = 'none');
      dropdown.addEventListener('mouseenter', _ => dropdown.style.display = 'block');

      button.addEventListener('click', _ => dropdown.style.display = 'block');
      button.addEventListener('mouseleave', _ => dropdown.style.display = 'none');
      button.addEventListener('mouseenter', _ => dropdown.style.display = 'block');

      const input = button.querySelector('input');

      const elements = dropdown.querySelectorAll('.country-dropdown-element');

      input.addEventListener('keyup', e => {
        dropdown.style.display = 'block'

        if (e.code === "Enter") {
          for (x of elements) {
            if (x.style.display === 'block') {
              let ccn3 = x.getAttribute('bind');

              if (ccn3)  {
                ea_countries_overview(
                  countries.find(t => t.ccn3 === ccn3),
                  countries_overviews,
                  countries_online
                )
              }

              break;
            }
          };
        }

        let i = input.value;

        if (i === '') {
          elements.forEach(e => e.style.display = 'block');
          return;
        }

        elements.forEach(e => {
          let cname = e.querySelector('.country-dropdown-name').innerText;
          e.style.display = (cname.toLowerCase().indexOf(i.toLowerCase()) != -1) ? 'block' : 'none';
        });
      });

      // button.addEventListener('mouseleave', _ => dropdown.style.display = 'none');

      const topo = topojson.feature(geo, geo.objects.countries);

      ea_map = ea_countries_map_svg(svg, geo, 'countries', { center: [0,0], scale: 350 });

      ea_countries_map_load_features({
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

      for (let co of countries_overviews) {
        let o = ea_map.svg.select(`.land#land-${co.ccn3}`);
        o.raise();
      }

      for (let co of countries_online) {
        let o = ea_map.svg.select(`.land#land-${co.ccn3}`);
        o.classed('online', true);
        o.raise();
      }

      ea_ui_app_loading(false);
    })
    .catch(error => {
      ea_flash
        .type('error')
        .title(error)();

      console.log(error);
    });
};

function ea_countries_overview(c, list, online) {
  const r = list.find(i => +i.ccn3 === +c.ccn3);

  let co, demo, pop, area, urban_rural, pol, gdp, pies, ease, dev, btn, rate;

  function ovline(n,v) {
    return elem(`<div class="overview-line"><strong>${n}:</strong> ${v}</div>`);
  };

  if (r) {
    co = elem('<div class="country-overview">');

    if (+r['population'] > 0)
      pop = ovline("Population", `${(+r['population']).toLocaleString()} Million`);

    if (+r['area'] > 0)
      area = ovline("Area", `${(+c['area']).toLocaleString()} km<sup>2</sup>`);

    if (+r['urban-perc'] + +r['rural-perc'] === 100)
      urban_rural = elem(`
<div style="display: flex; justify-content: space-around; text-align: center; text-transform: uppercase; color: var(--the-green);">
  <strong style="margin: 0.5em;">Urban:&nbsp;${r['urban-perc']}%</strong>
  <strong style="margin: 0.5em;">Rural:&nbsp;${r['rural-perc']}%</strong>
</div>
`);

    if (+r['energy-access-policy-support'] > 0)
      pol = ovline("Policy support for energy access", `${(r['energy-access-policy-support'])}/100`);

    if (+r['gdp-per-capita'] > 0)
      gdp = ovline("GDP per capita", `USD ${(+r['gdp-per-capita']).toFixed(2).toLocaleString()}`);

    pies = elem(`<div class="pie-charts" style="display: flex; justify-content: space-around; margin-bottom: 40px;"></div>`);

    if (+r['electrification-rate-national'] > 0)
      rate = ovline("Electrification Rate", `${r['electrification-rate-national']}%`);

    if (+r['ease-business'] > 0)
      ease = ovline("Ease of doing business", `${r['ease-business']}/190`);

    if (online.map(x => x['ccn3']).indexOf(+r['ccn3']) > -1) {
      btn = elem(`<button class="big-green-button">Continue</button>`);
      btn.addEventListener('click', _ => ea_countries_action_modal(r));
    }

    [pop, urban_rural, pies, gdp, dev, area, pol, rate, ease, btn].forEach(t => t ? co.appendChild(t) : null);

    let w = elem('<div style="display: flex; justify-content: space-around; width: 240px; border-right: 1px solid lightgray; padding: 0 1em;">');
    co.querySelector('.pie-charts').appendChild(w);

    if (+r['electrification-rate-urban'] > 0) {
      w.appendChild(elem(`<span class="small">Electrified:&nbsp;<strong>${r['electrification-rate-urban']}%</strong></span>`));

      let eru = ea_svg_pie(
        [
          [100 - +r['electrification-rate-urban']],
          [+r['electrification-rate-urban']]
        ],
        50, 0,
        [
          getComputedStyle(document.body).getPropertyValue('--the-light-green'),
          getComputedStyle(document.body).getPropertyValue('--the-green')
        ],
        ""
      );

      w.appendChild(eru.svg);
      eru.change(0);
    }

    w = elem('<div style="display: flex; justify-content: space-around; width: 240px; padding: 0 1em;">');
    co.querySelector('.pie-charts').appendChild(w);

    if (+r['electrification-rate-rural'] > 0) {
      w.appendChild(elem(`<span class="small">Electrified:&nbsp;<strong>${r['electrification-rate-rural']}%</strong></span>`));

      let err = ea_svg_pie(
        [
          [100 - (+r['electrification-rate-rural'])],
          [+r['electrification-rate-rural']]
        ],
        50, 0,
        [
          getComputedStyle(document.body).getPropertyValue('--the-light-green'),
          getComputedStyle(document.body).getPropertyValue('--the-green')
        ],
        ""
      );

      w.appendChild(err.svg);
      err.change(0);
    }

    ea_modal
      .header(`<div style="text-transform: uppercase; color: var(--the-white)">${c.name.common}</div>`)
      .content(co)();

  } else {
    ea_flash
      .type(null)
      .timeout(2000)
      .title(c.name.common)
      .message("Is not included in the project")();
  }
};

function ea_countries_action_modal(c) {
  let preset = "";

  const content = elem(`
<div>
  <h2>What group do you belong to?</h2>
  <p>Picking a group will lead you to pre-set data selections and settings appropriate for your group's interests.</p>
</div>
  `);

  const pbtns = elem(`<div class="presets-buttons" style="display: flex; justify-content: space-around;">`);

  for (let p in ea_presets) {
    let b = elem(`
<div class="thumbnail pop-hover" style="background-image: url(); background-color: #999; width: 15em; height: 15em; font-size: 0.84em;">
  <h3>${ea_presets[p].short}</h3>
  <p>${ea_presets[p].long}</p>
</div>
`);

    b.addEventListener("click", async _ => {
      for (let x of pbtns.querySelectorAll('.thumbnail'))
        await x.classList.remove('selected');

      b.classList.add('selected');
      preset = p;
    });

    pbtns.appendChild(b);
  }

  const btn = elem(`<button class="big-green-button">Click to launch the tool</button>`);
  btn.addEventListener('click', _ => window.location = `/maps-and-data/tool?ccn3=${c['ccn3']}&preset=${preset}`);

  content.appendChild(pbtns);
  content.appendChild(btn);

  ea_modal().remove();

  ea_modal
    .header(`<div style="text-transform: uppercase; color: var(--the-white)">${c['country']}</div>`)
    .content(content)();
};

function ea_countries_map_svg(svg, topofile, name, options) {
  let width, height;

  let projection, geopath, scale;

  let opts = options || {};

  const map = svg.select('#map');
  const land = map.append('g').attr('id', "land")
        .attr('fill', "none");

  switch (topofile.type) {
  case "FeatureCollection": {
    topo = topofile
    break;
  }

  case "Topology": {
    topo = topojson.feature(topofile, topofile.objects[name]);
    break;
  }

  default: {
    console.warn("Don't know what to do with topofile type:", topofile.type)
    ea_flash
      .type('error')
      .message(topofile.type)();
    break;
  }
  }

  width = +svg.attr('width');
  height = +svg.attr('height');

  projection = d3.geoMercator();

  projection
    .scale(1)
    .center([0,0])
    .translate([0,0]);

  geopath = d3.geoPath()
    .projection(projection);

  const b = geopath.bounds(topo);
  const geo_width = (b[1][0] - b[0][0]);
  const geo_height = (b[1][1] - b[0][1]);

  scale = 1 / (Math.max(geo_width / width, geo_height / height));
  translate = [width/2 , height/2];

  projection
    .scale(opts.scale || scale)
    .center(opts.center || [0,0])
    .translate(opts.translate || translate)

  const _map = {
    topo: topo,
    projection: projection,
    geopath: geopath,
    svg: svg,
    map: map,
    init: null,
    land: land,
    scale: scale,
    width: width,
    height: height,
  };

  // ZOOM AND MOUSE EVENTS
  //
  {
    const comfy = 4/5;
    let mask;
    let zt = d3.zoomIdentity;
    const tooltip = d3.select('#coord-tooltip');

    let mouseenter = _ => tooltip.style('display', "block");

    let mouseleave = _ => tooltip.style('display', "none");

    let mousemove = _ => {
      const p = projection.invert(zt.invert(d3.mouse(svg.node())))

      tooltip
        .html(`${ p[0].toFixed(4) }, ${ p[1].toFixed(4) }`)
        .style('left', `${ (d3.event.pageX + 7) }px`)
        .style('top', `${ (d3.event.pageY + 15) }px`);
    };

    let zoomstart = _ => {
      if (!mask || mask.empty()) mask = d3.select('#mask');
    };

    let zoomend = _ => {
      let k;

      if (d3.event)
        k = d3.event.transform.k;
      else
        k = comfy;
    };

    let zooming = _ => {
      let et;

      if (d3.event)
        et = zt = d3.event.transform;
      else
        et = zt = d3.zoomIdentity.translate(width/10, height/10).scale(comfy);

      const nw = projection.invert(et.invert([0,0]));
      const se = projection.invert(et.invert([width, height]));

      if (typeof ea_mapbox !== 'undefined' && ea_mapbox !== null)
        ea_mapbox.fitBounds([[nw[0], se[1]], [se[0], nw[1]]], { animate: false });

      map.attr("transform", et);
      mask.attr("transform", et);
    };

    let zoom = d3.zoom()
        .translateExtent([[0, 0], [width, height]])
        .scaleExtent([comfy, 200])
        .on("start", zoomstart)
        .on("zoom", zooming)
        .on("end", zoomend);

    svg.call(zoom)
      .on('mousemove', mousemove)
      .on('mouseenter', mouseenter)
      .on('mouseleave', mouseleave);

    zoom.scaleBy(svg, comfy);
    zoom.translateTo(svg, _map.width/10, _map.height/10);

    _map.init = _ => {
      var d = d3.dispatch("init");

      d.on("init", _ => {
        zoomstart();
        zooming();
        zoomend();
      });

      d.call("init");
    }
  }

  return _map;
};

function ea_countries_map_load_features(o) {
  if (!o.map)
    throw "Argument Error: o.map is missing";

  if (!o.map.map)
    throw "Argument Error: o.map.map is missing";

  if (!o.map.geopath)
    throw "Argument Error: o.map.geopath is missing";

  if (!o.features)
    throw "Argument Error: o.features is missing";

  if (o.features.some(f => f.type !== "Feature")) {
    console.log(o.features);
    throw "Argument Error: o.features is not an array of Features";
  }

  let container = o.map.map.select(`#${o.cls}`);
  let paths;

  if (container.empty())
    container = o.map.map.append('g').attr('id', o.cls);

  container.selectAll(`path.${ o.cls }`).remove();

  paths = container.selectAll(`path.${ o.cls }`)
    .data(o.features).enter()
    .append('path')
    .attr('class', (o.cls || ''))
    .attr('id', d => o.cls + "-" + (d.gid || d.id || null))
    .attr('d', o.map.geopath)
    .attr('stroke-width', o.scale ? (0.5/o.scale) : 0);

  if (typeof o.classed === 'function')
    paths.classed("selectable", d => o.classed(d.gid || d.id || null));

  if (typeof o.mouseover === 'function')
    paths.on('mouseover', d => o.mouseover(d.gid || d.id || ''));

  if (typeof o.mouseenter === 'function')
    paths.on('mouseenter', d => o.mouseenter(d.gid || d.id || ''));

  if (typeof o.mouseleave === 'function')
    paths.on('mouseleave', d => o.mouseleave(d.gid || d.id || ''));

  if (typeof o.mousedown === 'function')
    paths.on('mousedown', d => o.mousedown(d.gid || d.id || ''));

  return container;
};
