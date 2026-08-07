import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import {
	enough_datasets_for_index,
	analysis_colorscale_svg,
} from './analysis.js';

import {
	svg_interval,
} from './utils.js';

import {
	ce,
	qs,
	tmpl,
} from '../lib/helpers.js';

import { t, translateNode, translateIndexName, translateDivisionName, registerUIUpdater } from './translate.js';

export let opacity = 1;

export let shown = true;

function variants() {
	const s = qs('#output-variant-select');
	let u = "m²";
	let r = GEOGRAPHY.resolution;

	if ((r % 1000) === 0) {
		u = "km²";
		r = r / 1000;
	}
	s.append(ce('option', `${t(window.LOCALE, 'left_panel.output.variant.prioritized_areas')} - ${r}${u}`, { "value": "raster" }));

	GEOGRAPHY.divisions.forEach((d,i) => {
		if (i === 0) return;
		s.append(ce('option', translateDivisionName(window.LOCALE, d.name), { "value": i }));
	});

	s.value = STATE.variant;
	s.onchange = _ => {
		STATE.variant = s.value;
		COMMIT("datasets");
	};
};

function toggle_init() {
	const checkbox = qs('#output-on-map');

	checkbox.onchange = _ => {
		shown = checkbox.checked;
		COMMIT();
	};
};

export function opacity_init() {
	const control = svg_interval({
		"init":      { "min": 0, "max": 1 },
		"sliders":   'single',
		"height":    8,
		"radius":    10,
		"callback2": x => {
			opacity = x;
			COMMIT();
		},
	});

	qs('#output-opacity').append(control.svg);
};

function ramp() {
	qs('#output-ramp').append(
		analysis_colorscale_svg,
		bind(tmpl('#ramp'), {
			"left":   t(window.LOCALE, 'left_panel.output.ramp.low'),
			"middle": t(window.LOCALE, 'left_panel.output.ramp.medium'),
			"right":  t(window.LOCALE, 'left_panel.output.ramp.high'),
		}),
	);
};

export function show_eae_info_modal() {
	const content = tmpl('#eae-info-modal-template');
	translateNode(window.LOCALE, content);

	const index_info = {};
	for (const k in EAE['indexes'])
		index_info[k] = {
			"name":    translateIndexName(window.LOCALE, k),
			"explain": t(window.LOCALE, 'modal.eae_info.index.' + k + '.explain'),
		};

	new modal({
		"id":      'eae-info-modal',
		"header":  t(window.LOCALE, 'modal.eae_info.title'),
		"content": bind(content, index_info),
		"destroy": true,
	}).show();
}

function eae_info_modal() {
	qs('#eae-info-button').onclick = show_eae_info_modal;

	bind(qs('#drawer-info'), {
		"show_info": () => {
			const content = tmpl('#disclaimer-template');
			translateNode(window.LOCALE, content);
			new modal({
				"id":      'disclaimer-modal',
				"header":  t(window.LOCALE, 'disclaimer.title'),
				"content": content,
				"destroy": true,
			}).show();
		},
	});
};

export function indexes() {
	const nodes = [];

	const select = qs('#index-select');
	select.replaceChildren();

	function i_elem(t, v) {
		const d = ce('option',  v, { "value": t });

		if (!enough_datasets_for_index(t))
			d.setAttribute('disabled', "");

		return d;
	};

	for (const k in EAE['indexes'])
		nodes.push(i_elem(k, translateIndexName(window.LOCALE, k)));

	select.append(...nodes);

	select.value = STATE.index;

	select.onchange = function() {
		STATE.index = this.value;
		COMMIT("datasets");
	};
};

export function init() {
	variants();
	indexes();
	toggle_init();
	opacity_init();
	eae_info_modal();
	ramp();
};

registerUIUpdater(() => {
	const select = qs('#output-variant-select');
	const opt = select.querySelector('option[value="raster"]');
	if (opt) {
		let u = "m²";
		let r = GEOGRAPHY.resolution;
		if ((r % 1000) === 0) {
			u = "km²";
			r = r / 1000;
		}
		opt.textContent = `${t(window.LOCALE, 'left_panel.output.variant.prioritized_areas')} - ${r}${u}`;
	}

	for (const o of select.querySelectorAll('option')) {
		if (o.value === 'raster') continue;
		const d = GEOGRAPHY.divisions[+o.value];
		if (d) o.textContent = translateDivisionName(window.LOCALE, d.name);
	}

	indexes();

	const rampEl = qs('#output-ramp');
	if (rampEl) {
		rampEl.innerHTML = '';
		ramp();
	}
});
