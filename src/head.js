function qs(el, str) {
  if (!el) throw Error(`qs: got ${el}. Expected an HTMLElement.`);

  return (el.shadowRoot) ?
    el.shadowRoot.querySelector(str) :
    el.querySelector(str);
};

function ce(str) {
  return document.createElement(str);
};

function tmpl(el, shadow = false) {
  if (typeof el === 'string') el = qs(document, el);

  if (!el) throw Error(`tmpl: Expected 'el' to be a DOM Element.`);

  const r = el.content.cloneNode(true);
  return (shadow ? r : r.firstElementChild);
};

function elem(str, p) {
  var d = document.createElement(p ? p : 'div');
  d.innerHTML = str;

  return p ? d : d.firstElementChild;
};

function elem_empty(e) {
  if (e instanceof HTMLElement)
    while (e.lastChild) e.removeChild(e.lastChild);
  else
    throw "Argument: argument is not HTMLElment";
};

function attach(el) {
  const shadow = this.attachShadow({ mode: 'open' })
  shadow.append(el);

  return shadow;
};

function slot(name, content) {
  let el = document.createElement('span');
  el.setAttribute('slot', name);

  if (content instanceof HTMLElement
      || content instanceof SVGSVGElement)
    el.append(content);
  else if (typeof content === 'object')
    throw Error(`slot: Expected a HTMLElement or something stringy. Got an 'object'`);
  else
    el.innerHTML = content;

  return el;
};

function slot_populate(data, extra = {}) {
  for (let k in data) {
    if (typeof data[k] === 'object') continue;
    let s = qs(this, `slot[name=${k}]`);
    if (s) this.append(slot(k, data[k]));
  }

  if (typeof extra !== 'object') return;

  for (let k in extra) {
    if (!extra[k]) continue;
    // this.append(slot(k, extra[k]));
    qs(this, `[name=${k}]`).append(slot(k, extra[k]));
  }
};
