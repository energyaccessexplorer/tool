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
    dragging: function(x) {
      const t = TIMELINE_DATES.find(i => i.match(x));

      if (TIMELINE_CURRENT_DATE === t) return;
      else TIMELINE_CURRENT_DATE = t;

      O.timeline = t;
    }
  });

  tl.svg.style.left = (padding / 2) + "px";
  parent.append(tl.svg);

  return tl;
};

function ea_timeline_lines_draw(datasets, district) {
  const series = datasets.reduce((a,c) => {
    return a.concat(c.csv.data.filter(r => r['District'] === district).map(r => {
      return {
        values: TIMELINE_DATES.map(k => (r[k] === "" ? undefined : +r[k])),
        name: c.id,
        color: c.colorscale.stops.slice(-1)
      };
    }));
  }, []);

  if (TIMELINE_LINES)
    TIMELINE_LINES.svg.remove();

  const average = datasets.map(i => {
    return {
      name: i['id'],
      values: TIMELINE_DATES.map(d => i.csv.data.map(r => +r[d])).map(x => x.reduce((a,c) => a + c, 0) / x.length)
    }
  });

  TIMELINE_LINES = ea_svg_multiline({
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
            ce('td', (Math.round(average.find(x => x.name === m.name).values[i] * 100) / 100).toString())
          ]]
        ]
      ]);
    }
  });

  const rp = qs('#right-pane');

  qs('#district-header', rp).innerText = district;
  qs('#district-graph', rp).append(TIMELINE_LINES.svg);
};

function ea_timeline_date(t) {
  return t || TIMELINE_CURRENT_DATE || TIMELINE_DATES.slice(-1)[0];
}

async function ea_timeline_datasets_polygons_csv() {
  await until(_ => this.csv.data);

  this.domain[0] = d3.min([].concat(...TIMELINE_DATES.map(d => this.csv.data.map(r => +r[d]))));
  this.domain[1] = d3.max([].concat(...TIMELINE_DATES.map(d => this.csv.data.map(r => +r[d]))));

  this._domain = JSON.parse(JSON.stringify(this.domain));
  this.domain_init = JSON.parse(JSON.stringify(this.domain));
};

function ea_timeline_filter_valued_polygons() {
  const datasets = DS.list.filter(d => d.on && maybe(d.csv, 'data') && d.datatype.match("-(fixed|timeline)"));

  function m(d,r) {
    const c = d.config.column;

    if (d.timeline)
      return +r[TIMELINE_CURRENT_DATE] >= d._domain[0] && +r[TIMELINE_CURRENT_DATE] <= d._domain[1];
    else if (c)
      return +r[c] >= d._domain[0] && +r[c] <= d._domain[1];
  };

  const arr = datasets.map(d => d.csv.data.filter(r => m(d,r)).map(r => +r[d.csv.key]));

  if (!arr.length) return;

  const result = arr[0].filter(e => arr.every(a => a.includes(e)));

  const source = MAPBOX.getSource('filtered-source');

  const b = DST['boundaries'];
  const fs = source._data.features;

  for (let i = 0; i < fs.length; i += 1)
    fs[i].properties.__hidden = !result.includes(+fs[i].properties[b.vectors.key]);

  source.setData(source._data);
};
