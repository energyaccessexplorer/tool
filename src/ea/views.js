function ea_views_init() {
  const el = document.querySelector('#views');

  let views = {
    datasets: 'inputs',
    heatmaps: 'outputs'
  };

  Object.keys(views).forEach(t => {
    const btn = elem(`<div class="view">${views[t]}</div>`);

    btn.addEventListener('mouseup', function(e) {
      ea_overlord({
        type: "mode",
        target: t,
        caller: "ea_views_init",
      });
    });

    el.appendChild(btn);
  })
}
