let ea_nanny_current_step = 0;

function ea_nanny_el_wait_action(el, action, callback) {
  if (!el) throw TypeError, `Expected an element, got ${typeof el}: ${el}`;

  let l;
  el.addEventListener(action, l = function() {
    if (typeof callback === 'function') callback();
    el.removeEventListener(action, l);
  });
};

function ea_nanny_pick_element(query, opts) {
  let x,y;
  const el = document.querySelector(query);

  if (!el) throw DOMError, `ea_nanny_pick_element: No such element found with '${query}'`;

  y = el.offsetTop;
  x = el.offsetLeft;

  let body;

  if (opts.message instanceof HTMLElement)
    body = opts.message;
  else
    body = elem(opts.message, 'p');

  const marker = elem(`
<aside class="nanny-marker">
  <span class="nanny-caret"></span>

  <p><strong>${opts.title}</strong></p>
</aside>`);

  marker.appendChild(body);
  document.body.appendChild(marker);

  let orient, numx, numy;
  orient = opts.orient.match(/(.*)\ (.*)/);

  if (orient) {
    numx = parseInt(orient[1].match(/([0-9]+)/));
    numy = parseInt(orient[2].match(/([0-9]+)/));
  }

  let l,t;

  if (orient[1] == "right")
    l = x + el.offsetWidth;
  else if (orient[1] == "center")
    l = (x + (el.offsetWidth / 2) - (marker.clientWidth / 2));
  else if (!!numx)
    l = x + parseInt(numx);
  else
    l = x;

  if (orient[2] == "bottom")
    t = (y + el.offsetHeight - marker.clientHeight);
  else if (orient[2] == "middle")
    t = (y + (el.offsetHeight / 2) - (marker.clientHeight / 2));
  else if (!!numy)
    t = y + parseInt(numy);
  else
    t = y;

  marker.style.left = l + "px"
  marker.style.top = t + "px"

  return marker;
};

function ea_nanny_next() {
  ea_nanny_current_step += 1;

  if (ea_nanny_steps[ea_nanny_current_step])
    ea_nanny_steps[ea_nanny_current_step]();

  else
    ea_nanny_finish();
};

function ea_nanny_start() {
  if (typeof ea_nanny_steps === 'undefined') return;

  if (ea_state_sync().inputs.length > 1) return;

  const w = localStorage.getItem('needs-nanny');

  if (!w || !w.match(/false/)) {
    ea_nanny_steps[0]();
    ea_modal.show();
  }
};

function ea_nanny_finish() {
  console.log("Nanny's done.");
  ea_modal.hide();
};
