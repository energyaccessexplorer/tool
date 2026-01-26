import {
	area_info,
} from './high-priority-areas.js';

import {
	tmpl,
	qs,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

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

		const { fields, props, ll, analysis_value, analysis_name, feature_name, "area_info": info, raw } = rawData;
		const data = area_info(fields, props, ll, analysis_value, analysis_name, feature_name, info, raw);

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


