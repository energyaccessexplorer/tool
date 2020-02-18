function table_data(dict, prop, event) {
  const t = document.createElement('table');
  dict.forEach(d => {
    t.append(el_tree([
      ce('tr'), [
        ce('td', ce('strong', d.target + ": &nbsp;")),
        ce('td', prop[d.dataset].toString())
      ]
    ]));
  });

  return t;
};

async function fake_download(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.target = "_blank";
  a.download = name ? name : '';
  a.style.display = 'none';

  document.body.appendChild(a);

  await delay(0.1);

  a.click();
  a.remove();
};

function parseRGBA(str) {
  let c;

  if (!str) return [0, 0, 0, 255];

  if (str.match(/^#([A-Fa-f0-9]{3}){1,2}$/)) {
    c = str.substring(1).split('');

    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];

    c = '0x' + c.join('');

    return [(c>>16)&255, (c>>8)&255, c&255, 255];
  }
  else if (c = str.match(/^rgba?\(([0-9]{1,3}),\ ?([0-9]{1,3}),\ ?([0-9]{1,3}),?\ ?([0-9]{1,3})?\)$/)) {
    return [+c[1], +c[2], +c[3], +c[4] || 255];
  }

  else
    throw new Error(`parseRGBA: argument ${str} doesn't match`);
};

function has(element, attr) {
  return !(typeof element[attr] === 'undefined' || element[attr] === null);
};

function humanformat(s) {
  return s
    .replace('_', ' ')
    .replace('-', ' ')
    .replace(/^([a-z])/, x => x.toUpperCase())
    .replace(/\ ([a-z])/g, x => x.toUpperCase());
};
