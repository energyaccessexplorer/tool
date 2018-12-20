function elem(str) {
  const d = document.createElement('div');
  d.innerHTML = str;

  return d.firstElementChild;
};

function fake_download(blob) {
  const a = document.createElement('a');
  document.body.appendChild(a);

  a.style = "display:none;";

  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "ea_download";
  a.click();

  window.URL.revokeObjectURL(url);
};

function ea_state_sync() {
  let mode, output, inputs, preset;

  let mode_param = location.get_query_param('mode');
  let output_param = location.get_query_param('output');
  let inputs_param = location.get_query_param('inputs');
  let preset_param = location.get_query_param('preset');

  function set_mode_param(m) {
    history.replaceState(null, null, location.set_query_param('mode', (m || mode)));
  };

  function set_output_param(o) {
    history.replaceState(null, null, location.set_query_param('output', (o || output)));
  };

  function set_inputs_param(i) {
    history.replaceState(null, null, location.set_query_param('inputs', (i || inputs).toString()));
  };

  function set_preset_param(p) {
    document.querySelector('#controls-preset').value = (p || 'custom');
    history.replaceState(null, null, location.set_query_param('preset', (p || 'custom')));
  };

  if (Object.keys(ea_indexes).indexOf(output_param) > -1) {
    output = output_param;
  } else {
    output = "eai";
    set_output_param();
  }

  if (!inputs_param) {
    inputs = ['boundaries'];
    set_inputs_param();
  } else {
    inputs = inputs_param.split(',');
    if (!inputs.includes('boundaries')) inputs.unshift('boundaries');
  }

  if (Object.keys(ea_views).indexOf(mode_param) > -1) {
    mode = mode_param;
  } else {
    mode = 'outputs';
    set_mode_param();
  }

  if (['market','planning', 'investment', 'custom'].indexOf(preset_param) > -1) {
    preset = preset_param;
  } else {
    preset = 'custom';
    set_preset_param();
  }

  return {
    mode: mode,
    set_mode_param: set_mode_param,
    output: output,
    set_output_param: set_output_param,
    inputs: inputs,
    set_inputs_param: set_inputs_param,
    preset: preset,
    set_preset_param: set_preset_param,
  };
};

function ea_canvas_plot(A, canvas) {
  if (!(A.id && A.raster)) throw `${A.id} is not a A! Bye.`;

  ea_current_analysis = A;

  const plot = new plotty.plot({
    canvas: canvas,
    data: A.raster,
    width: A.width,
    height: A.height,
    domain: A.domain,
    noDataValue: A.nodata,
    colorScale: A.color_scale,
  });

  plot.render();

  return plot;
};

function ea_summary() {
  const summary = {};

  for (var k of Object.keys(ea_indexes)) {
    let a = ea_analysis(k);

    summary[k] = {
      "low":      a.raster.filter(x => x >= 0   && x < 0.2).length,
      "low-med":  a.raster.filter(x => x >= 0.2 && x < 0.4).length,
      "med":      a.raster.filter(x => x >= 0.4 && x < 0.6).length,
      "med-high": a.raster.filter(x => x >= 0.6 && x < 0.8).length,
      "high":     a.raster.filter(x => x >= 0.8 && x <= 1).length,
    };
  }

  const table = elem(`
<table class="summary">
<thead>
  <tr><th></th> <th>0-20</th> <th>20-40</th> <th>40-60</th> <th>60-80</th> <th>80-100</th></tr>
</thead>

<tbody></tbody>
</table`);

  const tbody = table.querySelector('tbody');

  for (var k of Object.keys(summary)) {
    let tr = document.createElement('tr')

    tr.innerHTML = `
<td class="index-name">${ea_indexes[k]}</td>
<td>${summary[k]['low']}</td>
<td>${summary[k]['low-med']}</td>
<td>${summary[k]['med']}</td>
<td>${summary[k]['med-high']}</td>
<td>${summary[k]['high']}</td>
`;

    tbody.appendChild(tr);
  }

  ea_modal
    .header('Index Summaries')
    .content(table)();

  return summary;
};
