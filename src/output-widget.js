import bind from '../lib/bind.js';

import modal from '../lib/modal.js';

import {
	enough_datasets,
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
	s.append(ce('option', `Prioritized Areas - ${r}${u}`, { "value": "raster" }));

	GEOGRAPHY.divisions.forEach((d,i) => {
		if (i === 0) return;
		s.append(ce('option', d.name, { "value": i }));
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
			"left":   "Low",
			"middle": "Medium",
			"right":  "High",
		}),
	);
};

function eae_info_modal() {
	const b = qs('#eae-info-button');

	b.onclick = function() {
		new modal({
			"id":      'eae-info-modal',
			"header":  "Generate prioritization",
			"content": bind(tmpl('#eae-info-modal-template'), EAE['indexes']),
			"destroy": true,
		}).show();
	};
};

export function indexes() {
	const nodes = [];

	const select = qs('#index-select');
	select.replaceChildren();

	function i_elem(t, v) {
		const d = ce('option',  v, { "value": t });

		if (!enough_datasets(t))
			d.setAttribute('disabled', "");

		return d;
	};

	for (const t in EAE['indexes'])
		nodes.push(i_elem(t, EAE['indexes'][t]['name']));

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
