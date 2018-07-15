function ea_canvas_setup(dummy) {
  const i = dummy.image;

  ea_canvas.setAttribute("width", i.getWidth());
  ea_canvas.setAttribute("height", i.getHeight());

  // STRANGE: force the canvas to 2d...
  ea_canvas.getContext('2d');
}

function ea_canvas_draw(et, tmp) {
  if (typeof ea_plot_imagedata === 'undefined' || ea_plot_imagedata === null) return;

  const w = ea_canvas.width;
  const h = ea_canvas.height;

  const f = (w/ea_map.width);

  tmp.getContext('2d')
    .putImageData(ea_plot_imagedata, 0, 0);

  ea_plot.ctx.clearRect(0, 0, w, h);

  ea_plot.ctx.save();
  ea_plot.ctx.translate(f * et.x, f * et.y);
  ea_plot.ctx.scale(et.k, et.k);
  ea_plot.ctx.drawImage(tmp, 0, 0);
  ea_plot.ctx.restore();
}

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

  ea_plot_imagedata = plot.ctx.getImageData(0, 0, ds.width, ds.height);

  let tmp_canvas = document.createElement("canvas");
  tmp_canvas.setAttribute("width", ea_canvas.width);
  tmp_canvas.setAttribute("height", ea_canvas.height);

  ea_canvas_draw(d3.zoomTransform(ea_map.svg.node()), tmp_canvas);

  tmp_canvas.remove();

  return plot;
}
