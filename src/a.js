/*
 * empty array means it'll be treated as an editable array
 * non-empty arrays mean allowed values (default: first)
 */

function ea_nanny_init(state) {
  window.ea_nanny = new nanny(ea_nanny_steps);

  if (state.inputs.length > 0) return;
  if (state.view !== "inputs") return;

  const w = localStorage.getItem('needs-nanny');

  if (!w || !w.match(/false/)) ea_nanny.start();
};

function ea_nanny_force_start() {
  const url = new URL(location);
  url.searchParams.set('inputs', '');
  url.searchParams.set('output', 'eai');
  url.searchParams.set('view', 'inputs');

  history.replaceState(null, null, url);

  DS.list.filter(d => d.active).forEach(d => d.turn(false, false));

  O.view = 'inputs';
  ea_controls_select_tab(qs('#controls-tab-filters'), "filters");
  ea_modal.hide();

  O.refresh();

  ea_nanny.start();
};
