import {
	admin_location_name,
} from './area-analysis.js';

import {
	ce,
	qs,
} from '../lib/helpers.js';

function title_p(area) {
	const p = ce('p', null, { "class": 'data-tab-title' });
	p.innerHTML = `Analysing selected datasets in <strong>${area}</strong>.`;
	return p;
}

function active_geography_name() {
	return (STATE.divtier > 0 && typeof STATE.subdiv === 'number')
		? admin_location_name(STATE.divtier, STATE.subdiv)
		: GEOGRAPHY.name;
}

export function make_title(admin_info, raster_index) {
	const variant = qs('select#output-variant-select')?.value;
	const location_selected = admin_info || raster_index != null;

	const wrapper = ce('div', null, { "class": 'tab-title' });

	if (!location_selected) {
		const subtitle = ce('p', null, { "class": 'data-tab-subtitle' });
		subtitle.textContent = 'Click anywhere on the map to see data for that location.';
		wrapper.append(title_p(active_geography_name()), subtitle);
	} else if (admin_info && variant && variant !== 'raster') {
		wrapper.append(title_p(admin_location_name(admin_info.variant, admin_info.id)));
	} else if ((GEOGRAPHY.resolution % 1000) === 0) {
		wrapper.append(title_p(`${active_geography_name()} at ${GEOGRAPHY.resolution / 1000}km²`));
	} else {
		wrapper.append(title_p(`${active_geography_name()} at ${GEOGRAPHY.resolution}m²`));
	}

	return wrapper;
}
