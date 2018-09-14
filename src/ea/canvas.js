function ea_canvas_setup(dummy) {
  const i = dummy.image;

  // STRANGE: force the canvas to 2d...
  //
  ea_canvas.getContext('2d');
};

function ea_canvas_draw(et, tmp) {
  if (typeof ea_plot_imagedata === 'undefined' || ea_plot_imagedata === null) return;

  const w = ea_canvas.width;
  const h = ea_canvas.height;

  const f = (h/ea_map.height); // TODO: review this. maybe w should be used on "tall" countries

  tmp.getContext('2d')
    .putImageData(ea_plot_imagedata, 0, 0);

  ea_plot.ctx.clearRect(0, 0, w, h);

  ea_plot.ctx.save();
  ea_plot.ctx.translate(f * et.x, f * et.y);
  ea_plot.ctx.scale(et.k, et.k);
  ea_plot.ctx.drawImage(tmp, 0, 0);
  ea_plot.ctx.restore();
};

function ea_canvas_plot(ds) {
  if (!ds) return;

  const plot = new plotty.plot({
    canvas: ea_canvas,
    data: ds.raster,
    width: ds.width,
    height: ds.height,
    domain: ds.domain,
    noDataValue: ds.nodata,
    colorScale: ds.color_scale,
  });

  ea_plot = plot;

  plot.render();

  return plot;
};
