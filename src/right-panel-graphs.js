import { svg_pie } from './utils.js';
import { analysis_colorscale, lowmedhigh_scale } from './analysis.js';
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

function update_graph_section(section, distribution, total, unit, description) {
	const labels = lowmedhigh_scale.range();

	const scale = ce('dl', null, { "class": 'discrete-scale' });

	analysis_colorscale.stops.slice().reverse().map((color, i) => {
		const idx = analysis_colorscale.stops.length - 1 - i;
		const count = Math.round(distribution[idx] * total);
		const value = `${count.toLocaleString()} ${unit}`;

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
	descEl.innerHTML = '';
	descEl.append(description);
}

function create_graph_section(title, type, numberId, descId) {
	const section = tmpl('#index-graph-section-template');
	qs('[slot="title"]', section).textContent = title;
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

export function graphs(summary) {
	const e = (1000/GEOGRAPHY.resolution)**2;
	const indexName = EAE['indexes'][STATE.index]['name'].toLowerCase();

	process_graph(summary, {
		"dataKey":     'population-density',
		"pieKey":      'population',
		"selector":    '#population-number',
		"unit":        'people',
		"calcTotal":   (data) => Math.round(data['total'] / e),
		"description": (total, high) => [
			`Showing ${indexName} for areas affecting `,
			ce('strong', total.toLocaleString() + ' people'),
			', of whom ',
			ce('strong', high.toLocaleString() + ' people'),
			` are situated in areas of high ${indexName}.`,
		],
	});

	process_graph(summary, {
		"dataKey":     'area',
		"pieKey":      'area',
		"selector":    '#area-number',
		"unit":        'km²',
		"calcTotal":   (data) => Math.round(data['total'] * e),
		"description": (total, high) => [
			`Showing ${indexName} for areas spanning `,
			ce('strong', total.toLocaleString() + ' km²'),
			', of which ',
			ce('strong', high.toLocaleString() + ' km²'),
			` has high ${indexName}.`,
		],
	});
};

function process_graph(analysis_summary, config) {
	const data = maybe(analysis_summary, config.dataKey);

	if (!data) {
		const el = qs(config.selector);
		if (el) el.closest('.index-graphs-group').remove();
		return false;
	}

	const total = config.calcTotal(data);
	if (isNaN(total) || total <= 0) return false;

	data['distribution'].forEach((x, i) => PIES[config.pieKey]['data'][i].push(x));
	PIES[config.pieKey].change(1);

	const high = Math.round(data['distribution'][4] * total);

	const description = document.createDocumentFragment();
	description.append(...config.description(total, high));

	const section = qs(config.selector).closest('.index-graphs-section');
	update_graph_section(section, data['distribution'], total, config.unit, description);

	data['distribution'].forEach((_, i) => PIES[config.pieKey]['data'][i].shift());

	return true;
}

export function init() {
	PIES["population"] = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);
	PIES["area"]       = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);

	const area_section = create_graph_section('Area share', 'area', 'area-number', 'area-description');
	const population_section = create_graph_section('Population share', 'population', 'population-number', 'population-description');

	setup_about_button(area_section, "Shows the 'Prioritization Index' results as area shares, based on your analysis criteria.");
	setup_about_button(population_section, "Shows the 'Prioritization Index' results as population shares, based on your analysis criteria.");

	qs('#analysis-sections-wrapper').append(area_section);
	qs('#analysis-sections-wrapper').append(population_section);
};
