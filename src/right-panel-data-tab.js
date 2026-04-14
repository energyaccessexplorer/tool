import {
	admin_location_name,
} from './area-analysis.js';

import bind from '../lib/bind.js';

import {
	ce,
	qs,
} from '../lib/helpers.js';

const POINTS_DESCRIPTIONS = {
	'count':             'There are <strong>{value}</strong> {name} in the selected area.',
	'distance in km':   'The nearest {name} is <strong>{value}</strong> from this area.',
	'proximity in km':  'The nearest {name} is <strong>{value}</strong> from this area.',
	'Kwp':              'The total installed capacity of {name} in this area is <strong>{value}</strong>.',
	'kVA':              'The total capacity of {name} in this area is <strong>{value}</strong>.',
	'km':               'The total distance covered by {name} in this area is <strong>{value}</strong>.',
};

const RASTER_DESCRIPTIONS = {
	'kWh/m²':                     'The average {name} is <strong>{value}</strong> in this area.',
	'ppl/km²':                    'The population density in this area is <strong>{value}</strong>.',
	'people':                     'The estimated population in this area is <strong>{value}</strong>.',
	'households':                 'There are approximately <strong>{value}</strong> households in this area.',
	'%':                          '<strong>{value}</strong> of this area has {name}.',
	'Coverage (%) per km²':       '<strong>{value}</strong> of this area is covered by {name}.',
	'MW':                         'The estimated energy demand in this area is <strong>{value}</strong>.',
	'GWh':                        'The estimated energy in this area is <strong>{value}</strong>.',
	'kWh/ha/year':                'The estimated yield for {name} in this area is <strong>{value}</strong>.',
	'minutes':                    'The average travel time to {name} is <strong>{value}</strong> in this area.',
	'hours':                      'The average {name} in this area is <strong>{value}</strong>.',
	'hours/hh.day':               'Households in this area spend on average <strong>{value}</strong> on {name}.',
	'm/s':                        'The average wind speed in this area is <strong>{value}</strong>.',
	'degree':                     'The average temperature in this area is <strong>{value}</strong>.',
	'degree celcius':             'The average temperature in this area is <strong>{value}</strong>.',
	'mm':                         'The average annual rainfall in this area is <strong>{value}</strong>.',
	'm³/yr':                      'The estimated water availability in this area is <strong>{value}</strong>.',
	'metre':                      'The average elevation in this area is <strong>{value}</strong>.',
	'kg/ha':                      'The estimated agricultural yield in this area is <strong>{value}</strong>.',
	'Metric Tonnes':              'The estimated crop production in this area is <strong>{value}</strong>.',
	'Gigajoule per sq km':        'The bioenergy potential in this area is <strong>{value}</strong>.',
	'USD':                        'The estimated cost for {name} in this area is <strong>{value}</strong>.',
	'USD/household':              'The estimated cost per household for {name} is <strong>{value}</strong>.',
	'bldgs/km²':                  'The building density in this area is <strong>{value}</strong>.',
	'tCO2eq':                     'The estimated emissions in this area are <strong>{value}</strong>.',
	'tier':                       'The average electrification tier in this area is <strong>{value}</strong>.',
	'year':                       'The estimated electrification year for this area is <strong>{value}</strong>.',
	'< 2USD/day':                 '<strong>{value}</strong> of the population in this area lives on less than $2/day.',
	'RWI':                        'The Relative Wealth Index for this area is <strong>{value}</strong>.',
	'Aridity Index':              'The aridity index for this area is <strong>{value}</strong>.',
	'calibrated radiance':        'The nighttime light intensity in this area is <strong>{value}</strong>.',
	'People per 100k population': 'There are <strong>{value}</strong> per 100k population affected by {name} in this area.',
};

function make_title(admin_info) {
	let area;

	if (admin_info) {
		area = admin_location_name(admin_info.variant, admin_info.id);
	} else {
		let u = 'm²';
		let r = GEOGRAPHY.resolution;
		if ((r % 1000) === 0) { u = 'km²'; r = r / 1000; }
		area = `${GEOGRAPHY.name} at ${r}${u}`;
	}

	const p = ce('p', null, { "class": 'data-tab-title' });
	p.innerHTML = `Analysing selected datasets in <strong>${area}</strong>.`;
	return p;
}

function fill(template, name, value) {
	return template.replaceAll('{name}', name).replaceAll('{value}', value);
}

function describe(datatype, unit, name, value) {
	if (datatype === 'points') {
		const key = unit || 'count';
		const tmpl = POINTS_DESCRIPTIONS[key] ?? POINTS_DESCRIPTIONS['count'];
		return fill(tmpl, name, value);
	}

	if (datatype === 'lines')
		return fill('The total length of {name} in this region is <strong>{value}</strong>.', name, value);

	if (datatype?.startsWith('raster')) {
		const tmpl = RASTER_DESCRIPTIONS[unit] ?? 'The average {name} in this area is <strong>{value}</strong>.';
		return fill(tmpl, name, value);
	}

	if (datatype?.startsWith('polygons')) {
		const tmpl = unit
			? 'The total {name} in this area is <strong>{value}</strong>.'
			: 'There are <strong>{value}</strong> {name} in the selected area.';
		return fill(tmpl, name, value);
	}

	return fill('The average {name} in this area is <strong>{value}</strong>.', name, value);
}

function make_card(ds, entry) {
	const card = ce('div', null, { "class": 'data-card' });

	const header = ce('div', null, { "class": 'data-card-header' });
	const title  = ce('span', ds.name, { "class": 'data-card-title' });
	const about  = ce('button', null, { "class": 'button-icon button-info button-about' });
	about.innerHTML = '<span>About</span><i class="bi bi-info-circle"></i>';
	header.append(title, about);

	const body = ce('div', null, { "class": 'data-card-body' });
	const desc = ce('p', null, { "class": 'data-card-description' });
	desc.innerHTML = describe(ds.category.datatype, ds.category.unit, ds.name, entry.value);
	body.append(desc);

	about.onclick = () => ds.info_modal();

	card.append(header, body);

	return card;
}

const BLANK_NO_LAYERS = {
	"title":    'Add data to prioritize analysis',
	"subtitle": 'Select a dataset from the left panel to add it to the map and start your prioritization analysis.',
};

const BLANK_NO_CLICK = {
	"title":    'Click on the map to explore layer data',
	"subtitle": 'Click anywhere on the map to see data for that location.',
};

function set_blank_state(visible) {
	const blank = qs('#data-blank-state');
	if (!blank) return;

	if (visible) {
		const has_layers = Array.from(DST.values()).some(
			ds => ds.on && ds.category.name !== 'boundaries' && ds.category.name !== 'outline',
		);
		bind(blank, has_layers ? BLANK_NO_CLICK : BLANK_NO_LAYERS, { "final": false });
	}

	blank.style.display = visible ? 'flex' : 'none';
}

export function update(detailedData, admin_info = null) {
	const container = qs('#data-cards-container');
	if (!container) return;
	container.innerHTML = '';

	const by_label = new Map(
		detailedData
			.filter(d => !d.subordinate && d.raw_value != null && d.raw_value !== 'Not aggregated')
			.map(d => [d.label, d]),
	);

	const cards = STATE.datasets
		.filter(ds => ds.category.name !== 'boundaries' && ds.category.name !== 'outline')
		.filter(ds => by_label.has(ds.name));

	if (cards.length) {
		set_blank_state(false);
		container.append(make_title(admin_info));
		cards.forEach(ds => container.append(make_card(ds, by_label.get(ds.name))));
	} else {
		set_blank_state(true);
	}
}

export function init() {
	set_blank_state(true);
}

export function clear() {
	const container = qs('#data-cards-container');
	if (container) container.innerHTML = '';
	set_blank_state(true);
}
