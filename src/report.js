function ea_report() {
  const canvas = ea_mapbox.getCanvas();
  const r = canvas.width/canvas.height;

  async function svg_canvas_data(svg, width, height) {
    let tmp_canvas = document.createElement('canvas');
    tmp_canvas.width = width;
    tmp_canvas.height = height;

    let context = tmp_canvas.getContext("2d");
    let i = 0;

    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

	let blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
	let img = new Image();

	let url = URL.createObjectURL(blob);

    load_image = u => new Promise((resolve, reject) => {
      img.onload = _ => resolve(u);
      img.onerror = _ => reject(u);
      img.src = u;
    });

    await load_image(url);

    context.drawImage(img, 0, 0, width, height);
    const du = tmp_canvas.toDataURL("image/png");

    URL.revokeObjectURL(url);
    tmp_canvas.remove();

    return du;
  };

  async function gen_pdf() {
    const doc = new jsPDF('p', 'pt', 'a4');
    const lp = 10;
    let c = 24;

    function reset_font() {
      doc.setFont("times");
      doc.setFontType('normal');
      doc.setFontSize(12);
    };

    reset_font();

    // Title
    //
    doc.setFont("helvetica");
    doc.setFontType('bold');
    doc.setFontSize(18);
    doc.text(ea_geography.name, lp, c);
    c += 6;

    // An image...
    //
    let s = 150;
    doc.addImage(canvas.toDataURL("image/jpeg"), "JPEG", lp, c, s, s/r);
    c += s/r;

    // List of datasets
    //
    reset_font();

    const dslist = DS.all.filter(d => d.active).map(d => {
      let u = "";

      if (d.category.unit) u = `<code>(${d.category.unit})</code>`;

      // TODO: We should be showing a list of the children datasets and values
      //
      if (d.multifilter) d.domain = [];

      doc.fromHTML(`<li> ${d.name} ${u} ${d.domain.join(' - ')}</li>`, lp, c, {});
      c += 16;
    });

    c += 10;

    // an HTML Table
    //
    doc.setFont("courier");
    doc.setFontSize(10);

    const table = qs('table.summary.tab');
    if (table) doc.autoTable({
      html: 'table.summary.tab',
      startY: c,
      styles: {
        cellPadding: 0.5,
        fontSize: 8
      }
    });
    c += 100;

    reset_font();

    const pies = document.querySelectorAll('.pie-svg-container svg');

    let w = 120;
    let h = 120;

    await Promise.all(
      Object.keys(ea_indexes)
        .map(async (x,i) => {
          let t = await svg_canvas_data(pies[i], w, h);
          doc.addImage(t, "PNG", (i * (w + 10)) + lp, c, w, h);
        })
    );

    doc.save("report.pdf");
  };

  if (typeof jsPDF === 'undefined') {
    const s0 = document.createElement('script');
    const s1 = document.createElement('script');

    s0.src = "/maps-and-data/lib/jspdf.js";
    s1.src = "/maps-and-data/lib/jspdf-autotable.js";

    s0.onload = _ => document.head.append(s1);
    s1.onload = gen_pdf;

    document.head.append(s0);
  } else {
    gen_pdf();
  };
};
