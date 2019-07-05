function ea_indexes_list(target) {
  let nodes;

  const indexes_list = document.querySelector('#indexes-list');
  elem_empty(indexes_list);

  function i_elem(t, v, x) {
    const d = elem(`
<li bind="${t}" ripple
    class="element">
  <div class="radio"></div>
  <span>${v}</span>
</li>`);

    return d;
  };

  function trigger_this() {
    let e = document.createEvent('HTMLEvents');

    for (n of nodes) {
      e.initEvent((this === n) ? "select" : "unselect", true, true);
      n.querySelector('.radio svg').dispatchEvent(e);
    }

    ea_overlord({
      "type": 'index',
      "target": this.getAttribute('bind'),
      "caller": 'ea_indexes_list'
    });
  };

  nodes = Object.keys(ea_indexes).map((t,i) => {
    let node = i_elem(t, ea_indexes[t], ea_indexes_descriptions[t]);

    let ler = node.querySelector('.radio');
    ler.appendChild(ea_svg_radio(t === target));

    node.addEventListener('mouseup', _ => setTimeout(_ => trigger_this.call(node), 10));

    indexes_list.appendChild(node);

    return node;
  });
};
