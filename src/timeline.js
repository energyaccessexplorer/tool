async function ea_timeline_init() {
  await until(_ => GEOGRAPHY.timeline_dates.length > 0);

  const steps = GEOGRAPHY.timeline_dates.map(x => parseInt(x.replace('(^[0-9]{4}-)', '\1')));

  const parent = qs('#timeline');
  const padding = 100;

  const tl = ea_svg_timeline_slider({
    steps: steps,
    width: qs('#maparea').clientWidth - padding,
    init: steps.length - 1,
    parent: parent,
    drag: x => O.timeline = GEOGRAPHY.timeline_dates.find(i => i.match(x))
  });

  tl.svg.style.left = (padding / 2) + "px";
  parent.append(tl.svg);

  return tl;
};

function ea_timeline_lines_draw() {
  const datasets = DS.array.filter(d => d.on && d.datatype === 'polygons-timeline');

  if (!datasets.length) return;

  const series = datasets.reduce((a,c) => {
    return a.concat(c.csv.data.filter(r => r['District'] === U.subgeoname).map(r => {
      return {
        values: GEOGRAPHY.timeline_dates.map(k => (r[k] === "" ? undefined : +r[k])),
        id: c.id,
        name: el_tree([
          ce('span'), [
            ce('span', c.name),
            ce('span', "[" + c.category.unit + "]", { style: "margin-left: 1em; font-size: 0.8em;" }),
          ]
        ]),
        color: c.colorscale.stops.slice(-1)
      };
    }));
  }, []);

  let lines = qs('#timeline-lines');
  if (lines) lines.remove();

  const average = datasets.map(i => {
    return {
      id: i['id'],
      values: GEOGRAPHY.timeline_dates.map(d => i.csv.data.map(r => +r[d])).map(x => x.reduce((a,c) => a + c, 0) / x.length)
    }
  });

  const ml = ea_svg_multiline({
    data: {
      series: series,
      dates: GEOGRAPHY.timeline_dates.map(d3.utcParse("%Y-%m-%d"))
    },
    color: "green",
    width: 350,
    height: 250,
    message: function(m,i,a) {
      return el_tree([
        document.createElement('table'), [
          [ ce('tr'), [
            ce('td', ce('strong', "District value: &nbsp;")),
            ce('td', a.toString())
          ]],
          [ ce('tr'), [
            ce('td', ce('strong', "State Average: &nbsp;")),
            ce('td', (Math.round(average.find(x => x.id === m.id).values[i] * 100) / 100).toString())
          ]]
        ]
      ]);
    }
  });
  ml.svg.id = 'timeline-lines';

  const rp = qs('#right-pane');

  qs('#district-header', rp).innerText = U.subgeoname;
  qs('#district-graph', rp).append(ml.svg);
};

async function ea_timeline_lines_update() {
  if (!GEOGRAPHY.timeline) return;

  const datasets = DS.array.filter(d => d.on && d.datatype === 'polygons-timeline');

  if (datasets.length) {
    await Promise.all(datasets.map(d => until(_ => d.csv.data)));
    if (U.subgeoname) ea_timeline_lines_draw();
  } else {
    const rp = qs('#right-pane');
    qs('#district-header', rp).innerText = "";

    let lines = qs('#timeline-lines');
    if (lines) lines.remove();
  }
};

async function ea_timeline_datasets_polygons_csv() {
  await until(_ => this.csv.data);

  this.domain[0] = d3.min([].concat(...GEOGRAPHY.timeline_dates.map(d => this.csv.data.map(r => +r[d]))));
  this.domain[1] = d3.max([].concat(...GEOGRAPHY.timeline_dates.map(d => this.csv.data.map(r => +r[d]))));

  this._domain = JSON.parse(JSON.stringify(this.domain));
  this.domain_init = JSON.parse(JSON.stringify(this.domain));
};

function ea_timeline_filter_valued_polygons() {
  const ul = qs('#filtered-subgeographies');
  ul.innerHTML = "";

  const datasets = DS.array.filter(d => d.on && d.datatype.match("polygons-(fixed|timeline)"));

  const b = DST.get('boundaries');
  datasets.unshift(b);

  function matches(d) {
    return d.csv.data
      .filter(r => {
        let c;
        if (d.datatype.match("polygons-(timeline)"))
          c = GEOGRAPHY.timeline_dates.slice(0).reverse().find(x => +r[x] > 0);
        else if (d.datatype.match("polygons-(fixed|boundaries)"))
          c = d.config.column;

        return +r[c] >= d._domain[0] && +r[c] <= d._domain[1];
      })
      .map(r => +r[d.csv.key]);
  };

  const arr = datasets.filter(d => d.csv.data).map(matches);
  const result = arr[0].filter(e => arr.every(a => a.includes(e)));

  const source = MAPBOX.getSource('filtered-source');

  const names = [];
  const fs = source._data.features;
  for (let i = 0; i < fs.length; i += 1) {
    const x = result.includes(+fs[i].properties[b.vectors.key]);

    fs[i].properties.__hidden = U.subgeo ? (fs[i].id !== +U.subgeo) : !x;

    if (x) {
      ul.append(ce('li', fs[i].properties['District']));
      names.push(fs[i].properties['District']);
    }
  }

  source.setData(source._data);
};
