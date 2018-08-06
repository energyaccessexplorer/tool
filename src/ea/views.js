function ea_views_init() {
  const el = document.querySelector('#views');

  let views = {
    datasets: 'inputs',
    heatmaps: 'outputs'
  };

  Object.keys(views).forEach(t => {
    const btn = elem(`<div class="view">${views[t]}</div>`);

    btn.addEventListener('mouseup', function(e) {
      el.querySelectorAll('.view').forEach(e => e.classList.remove('active'));

      btn.classList.add('active');

      ea_overlord({
        type: "mode",
        target: t,
        caller: "ea_views_init",
      });
    });

    if (location.get_query_param('mode') === t) btn.classList.add('active');

    el.appendChild(btn);
  })
}
