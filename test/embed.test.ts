import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initialViewStrategy } from '../src/initial-view.ts';

function and(a, b) {
	return Boolean(a && b);
}

// Pure implementation matching validate_state_value in src/a.js
function validate_state_value(p, v) {
	switch (p) {
	case "subdiv": {
		if (v !== null && v !== '' && !isNaN(+v) && +v >= 0) return +v;
		return null;
	}

	case "divtier": {
		if (v !== null && v !== '' && !isNaN(+v) && and(+v >= 0, +v < 10)) return +v;
		return null;
	}

	case "view": {
		if (['data', 'filtered', 'analysis'].includes(v)) return v;
		return null;
	}

	case "zoom": {
		if (v !== null && v !== '' && !isNaN(+v) && and(+v >= 0, +v <= 20)) return +v;
		return null;
	}

	case "center": {
		if (v && typeof v === 'object' && v.hasOwnProperty('lng') && v.hasOwnProperty('lat')) {
			const lng = +v.lng;
			const lat = +v.lat;
			if (!isNaN(lng) && !isNaN(lat)) return { lng, lat };
		}
		return null;
	}

	default:
		return null;
	}
}

describe('embed: validation and payload pure tests', () => {
	it('uses saved camera state only when a camera URL parameter was applied', () => {
		assert.equal(initialViewStrategy(true, true, true), 'apply-configured-view');
		assert.equal(initialViewStrategy(true, false, true), 'fit-envelope-on-idle');
		assert.equal(initialViewStrategy(false, true, true), 'apply-configured-view');
		assert.equal(initialViewStrategy(false, false, true), 'apply-configured-view');
		assert.equal(initialViewStrategy(true, false, false), 'fit-envelope-on-idle');
		assert.equal(initialViewStrategy(false, false, false), 'fit-envelope-after-delay');
	});

	it('validates zoom, center, view, subdiv, divtier correctly', () => {
		assert.equal(validate_state_value('zoom', '10'), 10);
		assert.equal(validate_state_value('zoom', '-1'), null);
		assert.equal(validate_state_value('zoom', '25'), null);
		assert.equal(validate_state_value('zoom', 'invalid'), null);

		const c = validate_state_value('center', { lng: 94.5, lat: 26.1 });
		assert.deepEqual(c, { lng: 94.5, lat: 26.1 });
		assert.equal(validate_state_value('center', { lng: 'bad', lat: 26.1 }), null);

		assert.equal(validate_state_value('view', 'filtered'), 'filtered');
		assert.equal(validate_state_value('view', 'data'), 'data');
		assert.equal(validate_state_value('view', 'analysis'), 'analysis');
		assert.equal(validate_state_value('view', 'unknown'), null);

		assert.equal(validate_state_value('divtier', '1'), 1);
		assert.equal(validate_state_value('divtier', '10'), null);
		assert.equal(validate_state_value('subdiv', '15'), 15);
		assert.equal(validate_state_value('subdiv', '-5'), null);
	});

	it('validates bounding box geometry', () => {
		function validateBounds(b) {
			return (
				Array.isArray(b) &&
				b.length === 4 &&
				b.every(n => typeof n === 'number' && isFinite(n)) &&
				b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90 &&
				b[0] < b[2] && b[1] < b[3]
			);
		}

		assert.equal(validateBounds([93.0, 25.0, 95.5, 27.2]), true);
		assert.equal(validateBounds([95.5, 25.0, 93.0, 27.2]), false); // west > east
		assert.equal(validateBounds([93.0, 27.2, 95.5, 25.0]), false); // south > north
		assert.equal(validateBounds([93.0, 25.0, 95.5]), false); // only 3 coords
		assert.equal(validateBounds(['93.0', 25.0, 95.5, 27.2]), false); // string coord
	});

	it('computes exact layer matching without touching boundaries', () => {
		const datasets = [
			{ id: '1', name: 'solar_pv', type: 'raster', on: false },
			{ id: '2', name: 'population', type: 'raster', on: true },
			{ id: '3', name: 'district_boundary', type: 'polygons-boundaries', on: false },
			{ id: '4', name: 'admin-tiers', category: { name: 'admin-tiers' }, type: 'csv', on: false },
		];

		const protectedTypes = new Set(['polygons-boundaries']);
		const protectedNames = new Set(['admin-tiers']);

		function applyLayers(onTargets, offTargets) {
			const turnedOn = [];
			const turnedOff = [];

			for (const target of onTargets) {
				for (const ds of datasets) {
					if (protectedTypes.has(ds.type) || protectedNames.has(ds.category?.name)) continue;
					if (String(ds.id) === String(target) || ds.name === target) {
						if (!ds.on) turnedOn.push(ds.id);
					}
				}
			}

			for (const target of offTargets) {
				for (const ds of datasets) {
					if (protectedTypes.has(ds.type) || protectedNames.has(ds.category?.name)) continue;
					if (String(ds.id) === String(target) || ds.name === target) {
						if (ds.on) turnedOff.push(ds.id);
					}
				}
			}

			return { turnedOn, turnedOff };
		}

		const res1 = applyLayers(['solar_pv', 'district_boundary'], ['population']);
		assert.deepEqual(res1.turnedOn, ['1']); // district_boundary protected
		assert.deepEqual(res1.turnedOff, ['2']);
	});
});
