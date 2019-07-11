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
  const el = document.querySelector(query);

  if (!el) throw DOMError, `ea_nanny_pick_element: No such element found with '${query}'`;

  const elbox = el.getBoundingClientRect();

  let body;

  if (opts.message instanceof HTMLElement)
    body = opts.message;
  else
    body = elem(opts.message || "", 'p');

  const marker = elem(`
<aside class="nanny-marker">
  <span class="nanny-caret"></span>

  <p><strong>${opts.title}</strong></p>
</aside>`);

  marker.appendChild(body);
  document.body.appendChild(marker);

  const caret = marker.querySelector('.nanny-caret');

  let x = elbox.x;
  let y = elbox.y;

  function halign() {
    switch (opts.align) {
    case "start":
      x += 0;
      break;

    case "end":
      x += elbox.width - marker.clientWidth;
      break;

    case "middle":
    default:
      x += (elbox.width / 2) - (marker.clientWidth / 2);
      break;
    }
  };

  function valign() {
    switch (opts.align) {
    case "start":
      y -= marker.clientHeight / 2;
      break;

    case "end":
      y += elbox.height - (marker.clientHeight / 2);
      break;

    case "middle":
    default:
      y = elbox.y + (elbox.height / 2) - (marker.clientHeight / 2);
      break;
    }
  };

  const caretsize = 100;
  const bc = "rgba(0,0,0,1)";

  switch (opts.position) {
  case "N":
  case "north": {
    y -= marker.clientHeight;
    halign();

    caret.style['border-width'] = (marker.clientWidth / 2) + "px";
    caret.style['border-top-color'] = bc;
    caret.style['transform'] = `scale(1, 0.5)`;
    caret.style['top'] = (marker.clientHeight - (marker.clientWidth / 4) - 0.5) + "px";

    break;
  }

  case "E":
  case "east": {
    x += elbox.width;
    valign();

    caret.style['border-width'] = (marker.clientHeight / 2) + "px";
    caret.style['border-right-color'] = bc;
    caret.style['transform'] = `scale(0.5, 1)`;
    caret.style['left'] = -((marker.clientHeight * (3/4)) - 0.5) + "px";

    break;
  }

  case "S":
  case "south": {
    y = elbox.y + marker.clientHeight;
    halign();

    caret.style['border-width'] = (marker.clientWidth / 2) + "px";
    caret.style['border-bottom-color'] = bc;
    caret.style['transform'] = `scale(1, 0.25)`;
    caret.style['top'] = -((marker.clientWidth * (5/8)) - 0.25) + "px";

    break;
  }

  case "W":
  case "west": {
    x -= marker.clientWidth;
    valign();

    caret.style['border-width'] = (marker.clientHeight / 2) + "px";
    caret.style['border-left-color'] = bc;
    caret.style['transform'] = `scale(0.5, 1)`;
    caret.style['left'] = marker.clientWidth - ((marker.clientHeight * (1/4)) + 0.5) + "px";

    break;
  }

  case "C":
  case "CENTER": {
    caret.style['display'] = 'none';
    opts.align = 'middle';
    valign();
    halign();
    break;
  }

  default:
    break;
  }

  marker.style.left = x + "px"
  marker.style.top = y + "px"

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

  const s = ea_state_sync();

  if (s.inputs.length > 1) return;
  if (s.mode !== "inputs") return;

  const w = localStorage.getItem('needs-nanny');

  if (!w || !w.match(/false/)) {
    setTimeout(_ => ea_nanny_steps[(ea_nanny_current_step = 0)](), 1000)
  }
}

function ea_nanny_finish() {
  console.log("Nanny's done.");
  ea_modal.hide();
};
