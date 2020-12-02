/* global jspdf */

import DS from './ds.js';

import '../lib/jspdf.js';

import '../lib/jspdf-autotable.js';

const jsPDF = jspdf.jsPDF;

export function pdf() {
	const canvas = DST.get('population-density').raster.canvas;
	const canvas_ratio = canvas.width/canvas.height;

	let doc;
	let page = {
		padding: [50, 50, 30, 50],
		width: 0,
		height: 0,
	};

	let lpad = page.padding[3];
	let c, y;

	const map_height = 100;
	const pie_size = 90;
	const font_size = 12;

	const block_height = map_height + pie_size + (30 * 2) + 20 + 40;
	let block_width;
	let hhalf;

	function reset_font() {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(font_size);
		doc.setTextColor("#393f44");
	};

	function add_page() {
		doc.addPage();
		c = page.padding[0];
	};

	function add_title(text, size) {
		size = size || font_size + 2;

		doc.setFont("helvetica", "normal");
		doc.setTextColor("#00794C");
		doc.setFontSize(size);

		c += size + (size / 2);

		doc.text(text, lpad, c);

		c += size + (size / 2);

		reset_font();
	};

	function add_right_title() {
		doc.setFont("helvetica", "normal");
		doc.setTextColor("#00794C");
		doc.setFontSize(16);

		doc.text("Energy Access Explorer", hhalf + 80, c);
	};

	function add_about() {
		add_title("About");

		const about = `
Energy Access Explorer is a research initiative led by World Resources Institute.
Partners and local stakeholders contribute to the development and update of
the platform. To learn more about Energy Access Explorer or provide feedback,
contact our team at`;

		doc.text(about, lpad, c);

		c += (about.split('\n').length * font_size) + font_size;

		doc.setTextColor("#00794C");
		doc.textWithLink("energyaccessexplorer@wri.org", lpad, c, { url: "mailto:energyaccessexplorer@wri.org"});
		reset_font();
	};

	function add_tables() {
		const names = ['area', 'population-density'];
		const tables = qsa('table.summary');

		for (let i = 0; i < tables.length; i += 1) {
			add_title(`Share of ${names[i]} for each category`);

			if (tables[i]) doc.autoTable({
				html: tables[i],
				startY: c,
				styles: { halign: "right" },
				columnStyles: { 0: { halign: "left" } },
				theme: "plain"
			});

			c += 120;
		}

		c += font_size * 2;
	};

	function add_indexes_infos() {
		add_title("Geospatial Analytical Outputs");

		for (let i in ea_indexes) {
			let info = ea_indexes[i]['info'];
			doc.text(info, lpad, c);
			c += (info.split('\n').length * font_size) + font_size;
		}

		c += font_size;
	};

	function add_selected_datasets() {
		add_title("Selected Datasets");

		const body = DS.array.filter(d => d.on)
			.map(d => ([
				d.name,
				d.category.unit || "proximity in km",
				JSON.stringify(d._domain || {}).replace(/"/g, '').replace(/([:,])/g, '$1 '),
				d.weight
			]));

		doc.autoTable({
			head: [['Dataset', 'Unit', 'Range', 'Importance']],
			body: body,
			startY: c,
			styles: { halign: "center" },
			theme: "plain"
		});

		c += 10;
	};

	async function add_indexes_graphs() {
		await add_title("Geospatial Analytical Outputs");

		const w = 300;
		const h = 10;

		// let raw_img = await svg_png(qs('#summary-graphs svg.svg-interval'), w, h);
		//
		// HACK: due to something in FF ~68 (or something I cannot see), this:
		//
		let raw_img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAuAAAAAFCAYAAAAEyFkRAAAA2UlEQVRoQ+2WsQnCYBQG3w9BbC0khQg2gnGH1KksLF3DFTNEFkkrkexw3XcZ4ODd/0GuVXVb+WkAMPA6fZeuHQYAJSLcwPv6m8/HGsM1eD5g4P5c59tjdUuAy3REu/TL9pn8x6UPAbq/GeCQSTFlgDsCyoABTpmUY4C7AcqAAU6ZlLMbMMDdAWbAAMdUxoMM8PgJYAIMcExlPMgAj58AKsAAR3Vmwwzw7PcnrzfASZvZLAM8+/3J6w1w0qYsA9wNYAYMcExlPMgAj58AJsAAx1TGgwzw+AmgAv5XGjqZcIaIdAAAAABJRU5ErkJggg==";

		await doc.addImage(raw_img, "PNG", hhalf - (w/2), c, w, h);

		c += (h * 2) + 5;

		doc.text('Low', hhalf - (w/2), c);
		doc.text('Medium', hhalf - 20, c);
		doc.text('High', hhalf + (w/2) - 26, c);

		c += font_size * 3;

		const pies = qsa('#summary-graphs .index-graphs-container svg');

		doc.line(hhalf, c, hhalf, page.height, 'S');

		await images_block("eai", lpad, c, pies[0], pies[1]);
		await images_block("ani", hhalf, c, pies[6], pies[7]);

		y = c + block_height;

		doc.line(lpad, y, page.width + lpad, y, 'S');

		c += font_size * 2;
		y = c + block_height;

		await images_block("demand", lpad, y, pies[2], pies[3]);
		await images_block("supply", hhalf, y, pies[4], pies[5]);
	};

	async function svg_png(svg, width, height) {
		let tc = document.createElement('canvas');
		tc.width = width;
		tc.height = height;

		let context = tc.getContext("2d");

		svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

		let blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
		let img = new Image();

		let url = URL.createObjectURL(blob);

		function load_image(u) {
			return new Promise((resolve, reject) => {
				img.onload = _ => resolve(u);
				img.onerror = _ => reject(u);
				img.src = u;
			});
		}

		await load_image(url);

		context.drawImage(img, 0, 0, width, height);
		const du = tc.toDataURL("image/png");

		URL.revokeObjectURL(url);
		tc.remove();

		return du;
	};

	async function images_block(indexname, x, y, p0, p1) {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(font_size);
		doc.setTextColor("#00794C");

		doc.text(ea_indexes[indexname]['name'].toUpperCase(), x + 20, y);

		const image_width = map_height * canvas_ratio;

		doc.addImage(qs('#canvas-' + indexname).toDataURL("image/png"),
			           "PNG",
			           x + (block_width/2) - (image_width/2),
			           y += 20,
			           image_width,
			           map_height);

		y += (map_height + 30) + 10;

		reset_font();

		doc.setFontSize(font_size * (3/4));
		doc.text("Population share", x + 28, y);
		doc.text("Area share", x + (block_width/2) + 40, y);

		y += 10;

		const s = pie_size * 8;

		await doc.addImage((await svg_png(p0, s, s)),
			                 "PNG",
			                 x + (block_width/4) - (pie_size/2),
			                 y,
			                 pie_size,
			                 pie_size);

		await doc.addImage((await svg_png(p1, s, s)),
			                 "PNG",
			                 x + (3*block_width/4) - (pie_size/2),
			                 y,
			                 pie_size,
			                 pie_size);

		y += pie_size + font_size;
	};

	async function gen_pdf() {
		doc = new jsPDF('p', 'pt', 'a4');
		c = page.padding[0];

		const _page = jsPDF.getPageSize('p', 'pt', 'a4');
		page.width = _page.width - (page.padding[1] + page.padding[3]);
		page.height = _page.height - (page.padding[0] + page.padding[2]);

		block_width = page.width / 2;
		hhalf = (page.width/2) + page.padding[3]; // NOT _page.width/2, thinkg uneven paddings.

		// START!

		add_right_title();

		add_title(GEOGRAPHY.name, 18);

		await add_indexes_infos();

		add_selected_datasets();

		add_page();

		await add_indexes_graphs();

		add_page();

		add_tables();

		add_about();

		doc.save("energyaccessexplorer-report.pdf");
	};

	gen_pdf();
};

export function csv(summary) {
	const csv = [];

	const datasets = DS.array
		    .filter(d => d.on)
		    .map(d => d.id + ":" + JSON.stringify(d._domain).replace(/"/g, ''))
		    .join(";");

	csv.push("# Selected datasets:min,max -- " + datasets);

	csv.push([
		"index",
		"share",
		["low", "low-med", "medium", "med-high", "high"].toString()
	].join());

	for (let i in summary) {
		for (let s in summary[i]) {
			csv.push([
				i,
				s,
				summary[i][s]['amounts']
			].join());
		}
	}

	return csv.join("\n") + "\n";
};
