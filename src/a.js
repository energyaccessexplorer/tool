/*
 * empty array means it'll be treated as an editable array
 * non-empty arrays mean allowed values (default: first)
 */

function ea_nanny_init() {
  window.ea_nanny = new nanny(ea_nanny_steps);

  if (![null, "inputs"].includes(U.view)) return;
  if (U.inputs.length > 0) return;

  const w = localStorage.getItem('needs-nanny');
  if (!w || !w.match(/false/)) ea_nanny.start();
};

function ea_nanny_force_start() {
  U.params = {
    inputs: [],
    output: 'eai',
    view: 'inputs'
  };

  DS.list.filter(d => d.on).forEach(d => d.active(false, false));

  O.view = 'inputs';
  ea_controls_select_tab(qs('#controls-tab-census'), "census");
  ea_modal.hide();

  O.view = U.view;

  ea_nanny.start();
};
