UUID_REGEXP = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";

function qs(str, el) {
  if (!el) el = document;
  else if (!(el instanceof Node))
    throw Error(`qs: Expected a Node. got ${el}.`);

  return (el.shadowRoot) ?
    el.shadowRoot.querySelector(str) :
    el.querySelector(str);
};

function ce(str, content, attrs = {}) {
  const el = document.createElement(str);
  for (let o in attrs) el.setAttribute(o, attrs[o]);

  if (content instanceof Element) el.append(content);
  else if (content) el.innerHTML = content;

  return el;
};

function shadow_tmpl(el) {
  if (typeof el === 'string') el = qs(el);

  if (!el) throw Error(`shadow_tmpl: Expected 'el' to be a DOM Element.`);

  return el.content.cloneNode(true);
};

function tmpl(el, data = null) {
  if (typeof el === 'string') el = qs(el);

  if (!el) throw Error(`tmpl: Expected 'el' to be a DOM Element.`);

  const r = el.content.cloneNode(true);

  if (!data) return r.firstElementChild;

  for (let e of r.querySelectorAll('[bind]')) {
    let v = e.getAttribute('bind');
    if (data[v]) e.innerText = data[v];
  }

  return r.firstElementChild;
};

function elem(str, p) {
  var d = document.createElement(p ? p : 'div');
  d.innerHTML = str;

  return p ? d : d.firstElementChild;
};

function elem_empty(e) {
  if (e instanceof Node)
    while (e.lastChild) e.removeChild(e.lastChild);
  else
    throw "Argument: argument is not a Node";
};

function attach(el) {
  const shadow = this.attachShadow({ mode: 'open' });
  shadow.append(el);

  return shadow;
};

function slot(name, content) {
  let el = document.createElement('span');
  el.setAttribute('slot', name);

  if (content instanceof Element)
    el.append(content);
  else if (typeof content === 'object')
    throw Error(`slot: Expected an Element or something stringy. Got an ${content}`);
  else
    el.innerHTML = content;

  return el;
};

function slot_populate(data, extra = {}) {
  for (let k in data) {
    if (typeof data[k] === 'object') continue;
    let s = qs(`slot[name=${k}]`, this);
    if (s) this.append(slot(k, data[k]));
  }

  if (typeof extra !== 'object') return;

  for (let k in extra) {
    if (!extra[k]) continue;
    // this.append(slot(k, extra[k]));
    qs(`[name=${k}]`, this).append(slot(k, extra[k]));
  }
};
