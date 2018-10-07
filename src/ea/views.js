function ea_views_init() {
  const el = document.querySelector('#views');

  let views = ['inputs', 'outputs'];

  views.forEach(v => {
    const btn = elem(`<div class="view">${v}</div>`);

    btn.addEventListener('mouseup', function(e) {
      el.querySelectorAll('.view').forEach(e => e.classList.remove('active'));

      btn.classList.add('active');

      ea_overlord({
        type: "mode",
        target: v,
        caller: "ea_views_init",
      });
    });

    if (location.get_query_param('mode') === v) btn.classList.add('active');

    el.appendChild(btn);
  })
}
