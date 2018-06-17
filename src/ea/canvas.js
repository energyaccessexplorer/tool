function ea_canvas_setup(dummy) {
  var w = dummy.image.getWidth();
  var h = dummy.image.getHeight();

  ea_canvas.setAttribute("width", w);
  ea_canvas.setAttribute("height", h);

  // STRANGE: force the canvas to 2d...
  ea_canvas.getContext('2d');
}

function ea_canvas_draw(et, tmp) {
  if (typeof fullimagedata === 'undefined' || fullimagedata === null) return;

  var w = ea_canvas.width;
  var h = ea_canvas.height;

  const f = (w/ea_settings.width);

  tmp.getContext('2d')
    .putImageData(fullimagedata, 0, 0);

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
    colorScale: "bluered"
  });

  plot.render();

  fullimagedata = plot.ctx.getImageData(0, 0, ds.width, ds.height);

  ea_plot = plot;

  return plot;
}
