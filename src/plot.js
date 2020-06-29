function ea_plot(opts) {
  const {canvas, data, width, height, nodata, colorscale} = opts;

  const ctx = canvas.getContext("2d");
  const imagedata = ctx.createImageData(width, height);
  const imgd = imagedata.data;

  canvas.width = width;
  canvas.height = height;

  for (let i = p = 0; i < data.length; i += 1, p += 4) {
    if (data[i] === nodata) continue;

    const c = colorscale.fn(data[i]);

    if (!c) continue;

    imgd[p] = c[0];
    imgd[p+1] = c[1];
    imgd[p+2] = c[2];
    imgd[p+3] = 255;
  }

  ctx.putImageData(imagedata, 0, 0);

  return canvas;
};

/*
 * ea_plot_outputcanvas
 *
 * @param "raster" []numbers
 * @param "canvas" a canvas element (if null, will default to canvas#output)
 */

function ea_plot_outputcanvas(data, canvas = null) {
  const A = DST.get('boundaries');

  if (!data.length) {
    warn("ea_plot_outputcanvas: no raster given. Filling up with a blank (transparent) one...");
    data = new Float32Array(A.raster.data.length).fill(-1);
  };

  ea_plot({
    canvas: canvas || qs('canvas#output'),
    data: data,
    width: A.raster.width,
    height: A.raster.height,
    nodata: -1,
    colorscale: ea_analysis_colorscale,
  });
};

/*
 * ea_coordinates_raster
 *
 * Transform a set of coordinates to the "relative position" inside a raster
 * that is bound to an area
 *
 * NOTE: mercator only.
 *
 * @param "coords" int[2]. Coordinates in Longitude/Latitude to be transformed.
 * @param "bounds" int[2][2]. Bounding box containing the raster data.
 * @param "raster" { width int, height int, novalue numeric, array numeric[] }
 *        full description.
 */

function ea_coordinates_in_raster(coords, bounds, raster) {
  if (coords.length !== 2)
    throw Error(`ea_coordinates_raster: expected and array of length 2. Got ${coords}`);

  const hs = d3.scaleLinear().domain([bounds[0][0], bounds[1][0]]).range([0, raster.width]);
  const vs = d3.scaleLinear().domain([bounds[1][1], bounds[2][1]]).range([0, raster.height]);

  const plng = Math.floor(hs(coords[0]));
  const plat = Math.floor(vs(coords[1]));

  let a = null;

  if ((plng > 0 && plng < raster.width &&
       plat > 0 && plat < raster.height )) {
    a = { x: coords[0], y: coords[1] };

    const v = raster.data[(plat * raster.width) + plng];
    a.value = v === raster.nodata ? null : v;
  }

  return a;
};
