function ea_presets_init(v) {
  const el = document.querySelector('#controls-preset');

  Object.keys(ea_presets).forEach(k => el.appendChild(elem(`<option value="${k}">${ea_presets[k]}</option>`)));

  el.value = v || "custom";
  el.querySelector('option[value="custom"]').innerText = "Select a preset";

  el.addEventListener('change', function(e) {
    ea_overlord({
      type: "preset",
      value: this.value,
      caller: "ea_presets_init change"
    });
  });
};

function ea_presets_set(d, v) {
  let p = d.presets[v];

  if (p) {
    d.active = true;
    if (d.checkbox_change) d.checkbox_change(true);

    d.weight = p.weight;
    if (d.weight_change) d.weight_change(p.weight);

    d.init_domain = [p.min, p.max];
  } else {
    d.active = false;
    if (d.checkbox_change) d.checkbox_change(false);

    d.weight = 2;
    if (d.weight_change) d.weight_change(2);

    d.init_domain = null;
  }

  return d.active;
};
