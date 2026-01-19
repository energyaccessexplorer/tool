import {
	lowmedhigh_scale,
} from './analysis.js';

import {
	maybe,
	tmpl,
	qs,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

export function extract_map_info_data(fields, props, ll, analysis_value, analysis_name, feature_name, area_info = null) {
	const is_admin_area = area_info !== null;

	let feature = null;
	let feature_type = null;
	const basicData = [];
	const detailedData = [];

	if (is_admin_area) {
		feature = area_info.name;
		const division_name = maybe(GEOGRAPHY, 'divisions', area_info.variant, 'name');
		if (division_name) {
			feature_type = division_name;
		}
	} else {
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
	}

	if (Number.isFinite(analysis_value)) {
		if (analysis_name) {
			const analysisData = { "label": analysis_name, "value": lowmedhigh_scale(analysis_value) };
			basicData.push(analysisData);
			detailedData.push(analysisData);
		}
		const percentage = (analysis_value * 100).toFixed(1);
		const priorityData = { "label": "Priority score", "value": `${percentage}%` };
		basicData.push(priorityData);
		detailedData.push(priorityData);
	}

	if (!is_admin_area && maybe(ll, 'length') === 2 && feature) {
		const coordData = { "label": "Coordinates", "value": `[${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}]` };
		basicData.push(coordData);
		detailedData.push(coordData);
	}

	const feature_entry = fields.find(d => d && d[0] && d[0].startsWith('_') && !d[0].includes('analysis'));
	const divisions = fields
		.filter(d => d && d[0] && d[0].startsWith('_') && !d[0].includes('analysis'))
		.filter(d => d !== feature_entry)
		.map(d => props[d[0]])
		.filter(v => v);

	if (divisions.length) {
		const locationData = { "label": "Location", "value": divisions.join(', ') };
		basicData.push(locationData);
		detailedData.push(locationData);
	}

	if (!is_admin_area) {
		for (const e of fields) {
			if (!e) continue;
			if (e[0].startsWith('_')) continue;
			if (e[0].includes('analysis')) continue;

			const fieldName = e[0].toLowerCase();
			if (fieldName === 'facility name' || fieldName === 'name' || fieldName === 'facility_name') continue;

			if (!props[e[0]]) continue;

			const label = e.hasOwnProperty(1) ? e[1] : e[0];
			const value = props[e[0]].toString();
			detailedData.push({ label, value });
		}
	}

	const hasLayerData = STATE.datasets.length > 0;

	const coordinates = maybe(ll, 'length') === 2 ? `[${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}]` : null;

	return {
		feature,
		feature_type,
		basicData,
		detailedData,
		"coordinate-title": !feature && coordinates,
		coordinates,
		"has-basic":        basicData.length > 0,
		"has-detailed":     hasLayerData,
	};
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
		const elbox = this.el.getBoundingClientRect();

		const lineWidth = 4;
		const gap = 50;

		// Position map-info to the right of the pointer
		const x = elbox.x + elbox.width + gap;
		const y = elbox.y - (this.clientHeight / 2) + (elbox.height / 2);

		// Position arrow connecting pointer to map-info
		this.arrow.style['width'] = gap + "px";
		this.arrow.style['height'] = lineWidth + "px";
		this.arrow.style['left'] = -gap + "px";
		this.arrow.style['top'] = (this.clientHeight / 2 - lineWidth / 2) + "px";

		const maparea = document.querySelector('#maparea');
		const mapareaBox = maparea.getBoundingClientRect();

		this.style.left = (x - mapareaBox.left) + "px";
		this.style.top = (y - mapareaBox.top) + "px";
	}

	render() {
		const { "data": rawData, onClose } = this.opts;

		const { fields, props, ll, analysis_value, analysis_name, feature_name } = rawData;
		const data = extract_map_info_data(fields, props, ll, analysis_value, analysis_name, feature_name);

		const content = tmpl('#map-info-template');
		bind(content, data);

		this.append(content);

		this.arrow = qs('.arrow', this);
		this.main = qs('main', this);

		const closeButton = qs('.close-button', this);
		closeButton.onclick = () => {
			if (onClose) onClose();
			else this.remove();
		};

		const analyseButton = qs('.analyse-button', this);
		if (analyseButton) {
			analyseButton.onclick = () => {
				const basicSection = qs('content:not(.detailed-data)', this);
				const detailedSection = qs('.detailed-data', this);
				const buttonContainer = qs('.analyse-button-container', this);

				if (basicSection) basicSection.classList.add('hidden');
				if (detailedSection) detailedSection.classList.remove('hidden');
				if (buttonContainer) buttonContainer.remove();

				this.align();
			};
		}

		this.style['visibility'] = 'hidden';

		const maparea = document.querySelector('#maparea');
		maparea.append(this);

		this.align();

		this.style['visibility'] = 'visible';
	}
};

customElements.define('map-info', mapinfo);


