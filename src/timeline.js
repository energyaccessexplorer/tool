async function ea_timeline_init() {
  await until(_ => TIMELINE_DATES.length > 0);

  const steps = TIMELINE_DATES.map(x => parseInt(x.replace('(^[0-9]{4}-)', '\1')));

  const parent = qs('#timeline');
  const padding = 100;

  const tl = ea_svg_timeline_slider({
    steps: steps,
    width: qs('#maparea').clientWidth - padding,
    init: steps.length - 1,
    parent: parent,
    drag: x => O.timeline = TIMELINE_DATES.find(i => i.match(x))
  });

  tl.svg.style.left = (padding / 2) + "px";
  parent.append(tl.svg);

  return tl;
};

function ea_timeline_lines_draw(datasets) {
  const series = datasets.reduce((a,c) => {
    return a.concat(c.csv.data.filter(r => r['District'] === U.subgeoname).map(r => {
      return {
        values: TIMELINE_DATES.map(k => (r[k] === "" ? undefined : +r[k])),
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
      values: TIMELINE_DATES.map(d => i.csv.data.map(r => +r[d])).map(x => x.reduce((a,c) => a + c, 0) / x.length)
    }
  });

  const ml = ea_svg_multiline({
    data: {
      series: series,
      dates: TIMELINE_DATES.map(d3.utcParse("%Y-%m-%d"))
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

function ea_timeline_lines_update(inputs) {
  if (!GEOGRAPHY.timeline) return;

  if (inputs.length) {
    const datasets = DS.list.filter(d => d.on && d.timeline && maybe(d, 'csv', 'data'));

    if (TIMELINE_DISTRICT)
      ea_timeline_lines_draw(datasets, TIMELINE_DISTRICT);
  } else {
    const rp = qs('#right-pane');
    qs('#district-header', rp).innerText = "";

    let lines = qs('#timeline-lines');
    if (lines) lines.remove();
  }
};

function ea_timeline_date(t) {
  return t || TIMELINE_DATES.slice(-1)[0];
}

async function ea_timeline_datasets_polygons_csv() {
  await until(_ => this.csv.data);

  this.domain[0] = d3.min([].concat(...TIMELINE_DATES.map(d => this.csv.data.map(r => +r[d]))));
  this.domain[1] = d3.max([].concat(...TIMELINE_DATES.map(d => this.csv.data.map(r => +r[d]))));

  this._domain = JSON.parse(JSON.stringify(this.domain));
  this.domain_init = JSON.parse(JSON.stringify(this.domain));
};

function ea_timeline_filter_valued_polygons() {
  const ul = qs('#filtered-subgeographies');
  ul.innerHTML = "";

  const datasets = DS.list.filter(d => d.on && maybe(d.csv, 'data') && d.datatype.match("-(fixed|timeline)"));

  function m(d,r) {
    let c;
    if (d.datatype.match("-timeline"))
      c = TIMELINE_DATES.slice(0).reverse().find(x => parseInt(r[x]) > 0);
    else if (d.datatype.match("-fixed"))
      c = d.config.column;

    return +r[c] >= d._domain[0] && +r[c] <= d._domain[1];
  };

  const arr = datasets.map(d => d.csv.data.filter(r => m(d,r)).map(r => +r[d.csv.key]));

  if (!arr.length) return;

  const result = arr[0].filter(e => arr.every(a => a.includes(e)));

  const source = MAPBOX.getSource('filtered-source');

  const b = DST['boundaries'];
  const fs = source._data.features;

  const names = [];

  for (let i = 0; i < fs.length; i += 1) {
    const x = result.includes(+fs[i].properties[b.vectors.key]);

    fs[i].properties.__hidden = !x;

    if (x) {
      ul.append(ce('li', fs[i].properties['District']));
      names.push(fs[i].properties['District']);
    }
  }

  source.setData(source._data);
};
