import {
	lowmedhigh_scale,
} from './analysis.js';

import {
	maybe,
} from '../lib/helpers.js';

function extract_map_info_data(fields, props, ll, analysis_value, analysis_name, feature_name) {
	let feature = null;
	let feature_type = null;
	const data = [];

	const feature_entry = fields.find(d => d && d[0] && d[0].startsWith('_') && !d[0].includes('analysis'));

	if (feature_entry) {
		const category_html = feature_entry[1];
		const category = category_html.match(/<strong[^>]*>(.*?)<\/strong>/)?.[1] || '';
		const name = feature_name || props['Facility Name'] || props['name'];

		if (name) {
			feature = name;
			if (category) {
				feature_type = category;
			}
		}
	}

	if (Number.isFinite(analysis_value)) {
		if (analysis_name) {
			data.push([analysis_name, lowmedhigh_scale(analysis_value)]);
		}
		const percentage = (analysis_value * 100).toFixed(1);
		data.push(["Priority score", `${percentage}%`]);
	}

	if (maybe(ll, 'length') === 2) {
		data.push(["Coordinates", `[${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}]`]);
	}

	const divisions = fields
		.filter(d => d && d[0] && d[0].startsWith('_') && !d[0].includes('analysis'))
		.filter(d => d !== feature_entry)
		.map(d => props[d[0]])
		.filter(v => v);

	if (divisions.length) {
		data.push(["Location", divisions.join(', ')]);
	}

	for (const e of fields) {
		if (!e) continue;
		if (e[0].startsWith('_')) continue;
		if (e[0].includes('analysis')) continue;

		// Skip facility/feature name fields - they're shown in the header
		const fieldName = e[0].toLowerCase();
		if (fieldName === 'facility name' || fieldName === 'name' || fieldName === 'facility_name') continue;

		if (!props[e[0]]) continue;

		const label = e.hasOwnProperty(1) ? e[1] : e[0];
		const value = props[e[0]].toString();
		data.push([label, value]);
	}

	return { feature, feature_type, data };
}

export default class mapinfo extends HTMLElement {
	constructor(opts, el = document.body) {
		if (!(el instanceof Node)) throw new DOMError("mapinfo", `'${el}' is not an Node`);

		super();

		this.el = el;
		this.opts = opts;

		this.render();

		return this;
	}

	align() {
		const { position, align } = this.opts;
		const elbox = this.el.getBoundingClientRect();

		let x = elbox.x;
		let y = elbox.y;

		const halign = _ => {
			switch (align) {
			case "start":
				x += 0;
				break;

			case "end":
				x += elbox.width - this.clientWidth;
				break;

			case "middle":
			default:
				x += (elbox.width / 2) - (this.clientWidth / 2);
				break;
			}
		};

		const valign = _ => {
			switch (align) {
			case "start":
				y -= this.clientHeight / 2;
				break;

			case "end":
				y += elbox.height - (this.clientHeight / 2);
				break;

			case "middle":
			default:
				y = elbox.y + (elbox.height / 2) - (this.clientHeight / 2);
				break;
			}
		};

		const lineWidth = 4;
		const gap = 10;

		switch (position) {
		case "N":
		case "north": {
			halign();

			this.arrow.style['width'] = lineWidth + "px";
			this.arrow.style['height'] = gap + "px";
			this.arrow.style['left'] = (this.clientWidth / 2 - lineWidth / 2) + "px";
			this.arrow.style['top'] = this.clientHeight + "px";

			y -= this.clientHeight + gap;

			break;
		}

		case "E":
		case "east": {
			valign();

			this.arrow.style['width'] = gap + "px";
			this.arrow.style['height'] = lineWidth + "px";
			this.arrow.style['left'] = -gap + "px";
			this.arrow.style['top'] = (this.clientHeight / 2 - lineWidth / 2) + "px";

			x += elbox.width + gap;

			break;
		}

		case "S":
		case "south": {
			halign();

			this.arrow.style['width'] = lineWidth + "px";
			this.arrow.style['height'] = gap + "px";
			this.arrow.style['left'] = (this.clientWidth / 2 - lineWidth / 2) + "px";
			this.arrow.style['top'] = -gap + "px";

			y += elbox.height + gap;

			break;
		}

		case "W":
		case "west": {
			valign();

			this.arrow.style['width'] = gap + "px";
			this.arrow.style['height'] = lineWidth + "px";
			this.arrow.style['left'] = this.clientWidth + "px";
			this.arrow.style['top'] = (this.clientHeight / 2 - lineWidth / 2) + "px";

			x -= this.clientWidth + gap;

			if (this.close_button)
				this.prepend(this.close_button);

			break;
		}

		case "C":
		case "center": {
			this.arrow.style['display'] = 'none';

			valign();
			halign();

			break;
		}

		default:
			break;
		}

		this.style.left = (x < 0 ? 0 : x) + window.scrollX + "px";
		this.style.top = (y < 0 ? 0 : y) + window.scrollY + "px";
	}

	render() {
		const { "data": rawData, close } = this.opts;

		// Extract and process the map info data
		const { fields, props, ll, analysis_value, analysis_name, feature_name } = rawData;
		const data = extract_map_info_data(fields, props, ll, analysis_value, analysis_name, feature_name);

		this.arrow = document.createElement('span');
		this.arrow.className = 'arrow';

		this.main = document.createElement('main');

		if (data.feature || data.feature_type) {
			const header = document.createElement('header');
			const headerInner = document.createElement('div');
			headerInner.className = 'header-inner';

			if (data.feature) {
				const titleDiv = document.createElement('div');
				titleDiv.className = 'title';
				titleDiv.innerHTML = data.feature;
				headerInner.append(titleDiv);
			}

			if (data.feature_type) {
				const captionDiv = document.createElement('div');
				captionDiv.className = 'caption';
				captionDiv.innerHTML = data.feature_type;
				headerInner.append(captionDiv);
			}

			header.append(headerInner);
			this.main.append(header);
		}

		if (data.data && data.data.length) {
			const content = document.createElement('content');
			const table = document.createElement('table');

			for (const row of data.data) {
				if (row === null) continue;

				const tr = document.createElement('tr');
				const td1 = document.createElement('td');
				const td2 = document.createElement('td');

				td1.textContent = row[0];
				td2.innerHTML = row[1];

				tr.append(td1, td2);
				table.append(tr);
			}

			content.append(table);
			this.main.append(content);
		}

		this.append(this.arrow, this.main);

		if (close !== false) {
			this.close_button = document.createElement('div');
			this.close_button.className = 'map-info-close-button';

			this.close_button.onclick = _ => {
				if (this) this.remove();
			};

			this.append(this.close_button);
		}

		this.style['visibility'] = 'hidden';

		document.body.append(this);

		this.align();

		this.style['visibility'] = 'visible';
	}
};

customElements.define('map-info', mapinfo);


