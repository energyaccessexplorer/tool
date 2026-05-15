import {
	area_info,
} from './area-analysis.js';

import {
	update as data_tab_update,
	clear as data_tab_clear,
} from './right-panel-data-tab.js';

import {
	update as prioritization_tab_update,
	clear as prioritization_tab_clear,
	update_location_summary,
	clear_location_summary,
} from './right-panel-prioritization-tab.js';

import {
	update as poi_update,
	clear as poi_clear,
} from './right-panel-poi-card.js';

import {
	show_eae_info_modal,
} from './output-widget.js';

import {
	tmpl,
	qs,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

export default class mapinfo extends HTMLElement {
	constructor(opts) {
		super();

		this.opts = opts;
		this.point = opts.point || { "x": 0, "y": 0 };

		this.render();

		return this;
	}

	updatePoint(x, y) {
		this.point = { x, y };
		this.align();
	}

	align() {
		const lineWidth = 4;
		const gap = 50;
		const dotSize = 16;

		const maparea = qs('#maparea');
		const mapareaBox = maparea.getBoundingClientRect();

		// Position map-info to the right of the point
		const x = this.point.x + (dotSize / 2) + gap - mapareaBox.left;
		const y = this.point.y - (this.clientHeight / 2) - mapareaBox.top;

		this.style.left = x + "px";
		this.style.top = y + "px";

		// Position arrow connecting dot to map-info
		this.arrow.style['width'] = gap + "px";
		this.arrow.style['height'] = lineWidth + "px";
		this.arrow.style['left'] = -(gap - 5) + "px";
		this.arrow.style['top'] = (this.clientHeight / 2 - lineWidth / 2) + "px";

		// Position dot at the point
		this.dot.style['left'] = -(gap + dotSize / 2) + "px";
		this.dot.style['top'] = (this.clientHeight / 2 - dotSize / 2) + "px";
	}

	render() {
		const { "data": rawData, onClose } = this.opts;

		const { fields, props, ll, analysis_value, analysis_name, feature_name, "admin_info": info, raw, raster_index } = rawData;
		const data = area_info(fields, props, ll, analysis_value, analysis_name, feature_name, info, raw);

		data_tab_update(data.detailedData, info, raster_index);
		prioritization_tab_update(raster_index, info, analysis_value);
		update_location_summary(data, info);
		if (!info) poi_update(ll);

		const content = tmpl('#map-info-template');
		bind(content, data);

		this.append(content);

		const detailedRows = this.querySelectorAll('.detailed-data tr');
		if (data.detailedData) {
			data.detailedData.forEach((item, i) => {
				if (item.subordinate && detailedRows[i]) {
					detailedRows[i].classList.add('subordinate');
				}
			});
		}

		for (const toggle of this.querySelectorAll('.subordinate-toggle')) {
			toggle.onclick = () => {
				toggle.classList.toggle('expanded');
				let row = toggle.closest('tr').nextElementSibling;
				while (row && row.classList.contains('subordinate')) {
					row.classList.toggle('visible');
					row = row.nextElementSibling;
				}
				this.align();
			};
		}

		this.dot = qs('.dot', this);
		this.arrow = qs('.arrow', this);
		this.main = qs('main', this);

		const closeButton = qs('.close-button', this);
		closeButton.onclick = () => {
			data_tab_clear();
			prioritization_tab_clear();
			clear_location_summary();
			poi_clear();
			if (onClose) onClose();
			else this.remove();
		};

		const infoButton = qs('.map-info-info-button', this);
		if (infoButton) {
			infoButton.onclick = () => {
				show_eae_info_modal();
				requestAnimationFrame(() => {
					const target = document.getElementById('prioritization-indexes');
					if (target) target.scrollIntoView();
				});
			};
		}

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

		const maparea = qs('#maparea');
		maparea.append(this);

		this.align();

		this.style['visibility'] = 'visible';
	}
};

customElements.define('map-info', mapinfo);


