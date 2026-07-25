import { t, translateNode, replayable, registerUIUpdater, getScaleLabels, translateIndexName } from './translate.js';
import { svg_pie } from './utils.js';
import { analysis_colorscale } from './analysis.js';
import { compute_share_amounts } from './summary.js';
import bubblemessage from '../lib/bubblemessage.js';
import bind from '../lib/bind.js';

import {
	ce,
	maybe,
	qs,
	tmpl,
} from '../lib/helpers.js';

const PIES = {};

const bubble = (v,e) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

function update_graph_section(section, amounts, unit, description) {
	const labels = getScaleLabels(window.LOCALE);

	const scale = ce('dl', null, { "class": 'discrete-scale' });

	analysis_colorscale.stops.slice().reverse().map((color, i) => {
		const idx = analysis_colorscale.stops.length - 1 - i;
		const value = `${amounts[idx].toLocaleString(window.LOCALE)} ${unit}`;

		const item = tmpl('#discrete-scale-item-template');
		bind(item, {
			"color": function(el) { el.style.backgroundColor = color; },
			"label": labels[idx],
			"value": value,
		});

		scale.append(item);
	});

	const scale_container = qs('.index-graphs-scale-container', section);
	scale_container.innerHTML = '';
	scale_container.append(scale);

	const descEl = qs('.section-description', section);
	if (typeof description === 'string') {
		descEl.innerHTML = description;
	} else {
		descEl.innerHTML = '';
		descEl.append(description);
	}
}

function create_graph_section(titleKey, type, numberId, descId) {
	const section = tmpl('#index-graph-section-template');
	translateNode(window.LOCALE, section);
	qs('[slot="title"]', section).textContent = t(window.LOCALE, titleKey);
	qs('.index-graphs-group', section).id = numberId;
	qs('.section-description', section).id = descId;
	qs('.index-graphs-group', section).append(PIES[type].svg);
	return section;
}

export function setup_about_button(section, about) {
	let bubble = null;
	const aboutButton = qs('.button-about', section);

	aboutButton.onmouseenter = () => {
		bubble = new bubblemessage({
			"message":  typeof about === 'function' ? about() : about,
			"position": 'W',
			"close":    false,
		}, aboutButton);
	};

	aboutButton.onmouseleave = () => {
		if (bubble) {
			bubble.remove();
			bubble = null;
		}
	};
}

export const graphs = replayable(function graphs(summary) {
	const locale = window.LOCALE;
	const indexName = translateIndexName(locale, STATE.index).toLowerCase();

	process_graph(summary, {
		"dataKey":     'population-density',
		"pieKey":      'population',
		"selector":    '#population-number',
		"unit":        t(locale, 'right_panel.prioritization.graphs.people_unit'),
		"description": (total, high) => t(locale, 'right_panel.prioritization.graphs.pop_desc', {
			indexName,
			"x": total.toLocaleString(window.LOCALE),
			"y": high.toLocaleString(window.LOCALE),
		}),
	});

	process_graph(summary, {
		"dataKey":     'area',
		"pieKey":      'area',
		"selector":    '#area-number',
		"unit":        'km²',
		"description": (total, high) => t(locale, 'right_panel.prioritization.graphs.area_desc', {
			indexName,
			"x": `${total.toLocaleString(window.LOCALE)} km²`,
			"y": `${high.toLocaleString(window.LOCALE)} km²`,
		}),
	});
});

function process_graph(analysis_summary, config) {
	const data = maybe(analysis_summary, config.dataKey);

	if (!data) {
		const el = qs(config.selector);
		if (el) el.closest('.index-graphs-group').remove();
		return false;
	}

	const { total, amounts } = compute_share_amounts(data);
	if (isNaN(total) || total <= 0) return false;

	data['distribution'].forEach((x, i) => PIES[config.pieKey]['data'][i].push(x));
	PIES[config.pieKey].change(1);

	const high = amounts[4];
	const description = config.description(total, high);

	const section = qs(config.selector).closest('.index-graphs-section');
	update_graph_section(section, amounts, config.unit, description);

	data['distribution'].forEach((_, i) => PIES[config.pieKey]['data'][i].shift());

	return true;
}

export function init() {
	PIES["population"] = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, bubble);
	PIES["area"]       = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, bubble);

	const area_section = create_graph_section('right_panel.prioritization.graphs.area_share_title', 'area', 'area-number', 'area-description');
	const population_section = create_graph_section('right_panel.prioritization.graphs.pop_share_title', 'population', 'population-number', 'population-description');

	setup_about_button(area_section, t(window.LOCALE, 'right_panel.prioritization.graphs.area_about'));
	setup_about_button(population_section, t(window.LOCALE, 'right_panel.prioritization.graphs.pop_about'));

	qs('#analysis-sections-wrapper').append(area_section);
	qs('#analysis-sections-wrapper').append(population_section);
};

function refreshGraphTranslations() {
	const area_section = qs('#area-number')?.closest('.index-graphs-section');
	const pop_section  = qs('#population-number')?.closest('.index-graphs-section');

	if (area_section) {
		qs('[slot="title"]', area_section).textContent
			= t(window.LOCALE, 'right_panel.prioritization.graphs.area_share_title');
		setup_about_button(area_section, t(window.LOCALE, 'right_panel.prioritization.graphs.area_about'));
	}
	if (pop_section) {
		qs('[slot="title"]', pop_section).textContent
			= t(window.LOCALE, 'right_panel.prioritization.graphs.pop_share_title');
		setup_about_button(pop_section, t(window.LOCALE, 'right_panel.prioritization.graphs.pop_about'));
	}
}

registerUIUpdater(refreshGraphTranslations);
