function ea_views_init() {
  const el = document.querySelector('#views');

  ['datasets', 'heatmaps'].forEach(t => {
    const btn = elem(`<div class="view">${t}</div>`);

    btn.addEventListener('mouseup', function(e) {
      ea_overlord({
        type: "mode",
        target: t,
      });
    });

    el.appendChild(btn);
  })
}
