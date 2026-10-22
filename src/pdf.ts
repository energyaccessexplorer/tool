/* PDF writer for the static map export (EAE-512)
 *
 * The pages are composed on canvases first — the layout, the legend and the
 * credits all live in static-map.ts — so this only wraps those pixels in PDF
 * pages of the right physical size. The page is what a PDF buys: A5 at a
 * stated millimetre size, one file, printed at the size the layout was drawn
 * for, instead of an image whose DPI depends on whoever opens it.
 *
 * The pixels go in losslessly (Flate over raw RGB) so the type stays as crisp
 * as the canvas drew it. Text is part of that image rather than a PDF text
 * object: real text would mean embedding a font that covers the export's
 * locales, and the Chinese translations need a CJK face the tool does not ship.
 */

const DPI = 300;

const PT_PER_INCH = 72;

/** zlib-wrapped deflate, which is what /FlateDecode expects. */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
	const buffer = new Uint8Array(bytes.length);

	buffer.set(bytes);

	const stream = new Blob([buffer.buffer as ArrayBuffer]).stream()
		.pipeThrough(new CompressionStream('deflate'));

	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function rgb_rows(canvas: HTMLCanvasElement): Uint8Array {
	const ctx = canvas.getContext('2d');

	if (!ctx) throw new Error('No 2d context to read a composed page');

	const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
	const rgb = new Uint8Array(canvas.width * canvas.height * 3);

	for (let i = 0, j = 0; i < rgba.length; i += 4) {
		rgb[j++] = rgba[i] ?? 0;
		rgb[j++] = rgba[i + 1] ?? 0;
		rgb[j++] = rgba[i + 2] ?? 0;
	}

	return rgb;
}

interface PdfPage {
	readonly width: number;
	readonly height: number;
	readonly image: Uint8Array;
}

/** Objects per page: the page itself, its image, its content stream. */
const PER_PAGE = 3;

function build(pages: readonly PdfPage[]): Blob {
	const encoder = new TextEncoder();
	const parts: Uint8Array[] = [];
	const offsets: number[] = [];
	const to_pt = (px: number): string => ((px / DPI) * PT_PER_INCH).toFixed(2);

	let size = 0;

	const push = (bytes: Uint8Array): void => {
		parts.push(bytes);
		size += bytes.length;
	};

	const put = (str: string): void => push(encoder.encode(str));

	const object = (num: number, dict: string, stream?: Uint8Array): void => {
		offsets[num] = size;
		put(`${num} 0 obj\n${dict}\n`);

		if (stream) {
			put('stream\n');
			push(stream);
			put('\nendstream\n');
		}

		put('endobj\n');
	};

	const page_obj = (i: number): number => 3 + (i * PER_PAGE);
	const image_obj = (i: number): number => 4 + (i * PER_PAGE);
	const content_obj = (i: number): number => 5 + (i * PER_PAGE);
	const total = 2 + (pages.length * PER_PAGE);

	put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
	object(1, '<< /Type /Catalog /Pages 2 0 R >>');
	object(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${page_obj(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);

	pages.forEach((page, i) => {
		// The image fills its page: the unit square is scaled to the page box by
		// the content stream, and PDF draws the first row at the top.
		const content = encoder.encode(`q ${to_pt(page.width)} 0 0 ${to_pt(page.height)} 0 0 cm /Im0 Do Q`);

		object(
			page_obj(i),
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${to_pt(page.width)} ${to_pt(page.height)}]`
			+ ` /Resources << /XObject << /Im0 ${image_obj(i)} 0 R >> >> /Contents ${content_obj(i)} 0 R >>`,
		);
		object(
			image_obj(i),
			`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height}`
			+ ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode'
			+ ` /Length ${page.image.length} >>`,
			page.image,
		);
		object(content_obj(i), `<< /Length ${content.length} >>`, content);
	});

	const xref = size;

	put(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);

	for (let num = 1; num <= total; num++) {
		put(`${String(offsets[num] ?? 0).padStart(10, '0')} 00000 n \n`);
	}

	put(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

	const out = new Uint8Array(size);

	let at = 0;

	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}

	return new Blob([out.buffer as ArrayBuffer], { "type": 'application/pdf' });
}

/** Wraps composed page canvases in a PDF, one page per canvas, at print size. */
export async function pages_pdf(canvases: readonly HTMLCanvasElement[]): Promise<Blob> {
	const pages = await Promise.all(canvases.map(async canvas => ({
		"width":  canvas.width,
		"height": canvas.height,
		"image":  await deflate(rgb_rows(canvas)),
	})));

	return build(pages);
}
