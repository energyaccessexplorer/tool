UUID_REGEXP = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";

function qs(str, el) {
  if (!el) el = document;
  else if (!(el instanceof Node))
    throw Error(`qs: Expected a Node. got ${el}.`);

  return (el.shadowRoot) ?
    el.shadowRoot.querySelector(str) :
    el.querySelector(str);
};

function qsa(str, el, array = false) {
  if (!el) el = document;
  else if (!(el instanceof Node))
    throw Error(`qs: Expected a Node. got ${el}.`);

  const r = (el.shadowRoot) ?
    el.shadowRoot.querySelectorAll(str) :
        el.querySelectorAll(str);

  if (array) {
    const a = [];
    for (let i = r.length; i--; a.unshift(r[i]));
    return a;
  }

  return r;
};

function ce(str, content, attrs = {}) {
  const el = document.createElement(str);
  for (let o in attrs) el.setAttribute(o, attrs[o]);

  if (content instanceof Element) el.append(content);
  else if (typeof content === 'string') el.innerHTML = content;
  else if (Array.isArray(content) && content.every(x => x instanceof Element)) el.append(...content);

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

    if (data[v] instanceof Element)
      e.append(data[v]);
    else
      e.innerHTML = data[v];
  }

  for (let e of r.querySelectorAll('[bind-cond]')) {
    let v = e.getAttribute('bind-cond');
    if (undefined === data[v] || data[v] === null) e.remove();
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

function is_tree(t) {
  return (t[0] instanceof Element) &&
    (!t[1] || t[1] instanceof Array)
};

function el_tree(t) {
  const head = t[0];
  const tail = t[1];

  if (t instanceof Element) return t;

  if (!(head instanceof Element))
    throw 'el_tree: head is not a Element.';

  if (tail instanceof NodeList) {
    head.append(...tail);
    return head;
  }

  else if (tail instanceof Array) {
    if (tail.every(e => e instanceof Element)) // allows [p, [c1, c2, c3]]
      head.append(...tail);

    else if (is_tree(tail))        // allows [p, [c, []]]
      head.append(el_tree(tail));  //            ^---- a tree, not array of trees (the default)

    else                           // asume array of trees. [p, [[c1, []], [c2, []]]]
      tail.forEach(e => head.append(el_tree(e)));
  }

  else if (!t[1]) { }

  else {
    throw `el_tree: don't know what to do with ${typeof t[1]}, ${t[1]}`;
  }

  return t[0];
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

function log() {
  return console.log.apply(console, arguments);
};

function debug() {
  return console.trace.apply(console, arguments);
};

function warn() {
  return console.warn.apply(console, arguments);
};

function delay(s) {
  return new Promise(_ => setTimeout(_, s * 1000));
};
