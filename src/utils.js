function ea_fake_download(blob) {
  // var b = new Blob([byteBuf], {type: "image/png"});

  var a = document.createElement('a');
  document.body.appendChild(a);

  a.style = "display:none;";

  var url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "testies.tif";
  a.click();

  window.URL.revokeObjectURL(url);
}

function tiff_plot(r,i) {
  const plot = new plotty.plot({
    canvas,
    data: r,
    width: i.getWidth(),
    height: i.getHeight(),
    domain: [0.7,1],
    // noDataValue: ,
    colorScale: "bluered"
  });

  plot.render();
}
