import { fit as mapbox_fit } from './mapbox.js';

function allowed_origins() {
	const raw = window.EAE?.['settings']?.embed_origins;
	if (!raw || typeof raw !== 'string' || !raw.trim()) return [];
	return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function build_divisions_payload() {
	try {
		if (!window.GEOGRAPHY?.divisions) return [];
		const divisions = window.GEOGRAPHY.divisions;
		const at = window.DST?.get('admin-tiers');
		const result = [];

		let branchRoot = at?.tree;
		// If current geography is a sub-region (e.g. Nagaland within India's admin-tiers tree)
		if (branchRoot && window.GEOGRAPHY.adm && window.GEOGRAPHY.adm !== 0 && at && window.GEOGRAPHY.id != at.geography_id) {
			try {
				const featId = divisions[1]?.vectors?.data?.features?.[0]?.id;
				if (featId !== undefined && at.csv?.data) {
					const row = at.csv.data.find(x => x['TIER' + (window.GEOGRAPHY.adm + 1)] === featId);
					if (row && row['TIER' + window.GEOGRAPHY.adm] !== undefined) {
						branchRoot = branchRoot[row['TIER' + window.GEOGRAPHY.adm]] || branchRoot;
					}
				}
			} catch (_) {}
		}

		function collect_leaves(branch, tier) {
			if (!branch || !divisions[tier] || !divisions[tier].csv?.table) return;
			const entries = [];
			for (let i = 0; i < branch.length; i++) {
				if (!branch[i]) continue;
				if (branch[i] === 1) {
					const name = divisions[tier].csv.table[i] || '';
					entries.push({ id: Number(i), name: String(name).trim() });
				}
			}

			if (entries.length > 0) {
				result.push({
					tier: Number(tier),
					name: divisions[tier].name || ('Tier ' + tier),
					entries: entries,
				});
			}

			for (let i = 0; i < branch.length; i++) {
				if (branch[i] && branch[i] !== 1 && Array.isArray(branch[i])) {
					collect_leaves(branch[i], tier + 1);
				}
			}
		}

		if (branchRoot) {
			collect_leaves(branchRoot, 1);
		}

		// Fallback: If admin-tiers tree didn't produce entries but divisions[1] has table, populate tier 1
		if (result.length === 0 && divisions[1]?.csv?.table) {
			const table = divisions[1].csv.table;
			const entries = [];
			for (const id in table) {
				if (table[id]) {
					entries.push({ id: Number(id), name: String(table[id]).trim() });
				}
			}
			if (entries.length > 0) {
				result.push({
					tier: 1,
					name: divisions[1].name || 'Tier 1',
					entries: entries,
				});
			}
		}

		return result;
	} catch (err) {
		console.warn('build_divisions_payload error:', err);
		return [];
	}
}

export function init() {
	const origins = allowed_origins();
	if (!origins.length) return;

	let parent_origin = null;
	if (typeof location !== 'undefined' && location.ancestorOrigins && location.ancestorOrigins.length) {
		parent_origin = location.ancestorOrigins[0];
	} else if (document.referrer) {
		try {
			parent_origin = new URL(document.referrer).origin;
		} catch (_) {}
	}

	const targets = (parent_origin && origins.includes(parent_origin))
		? [parent_origin]
		: origins;

	const payload = build_divisions_payload();
	for (const target of targets) {
		try {
			window.parent.postMessage({
				type: "eae:ready",
				divisions: payload,
			}, target);
		} catch (_) {}
	}

	// T7: eae:view debounced message after moveend
	if (window.EMBED && window.MAPBOX) {
		let moveTimer = null;
		MAPBOX.on('moveend', () => {
			if (moveTimer) clearTimeout(moveTimer);
			moveTimer = setTimeout(() => {
				const center = MAPBOX.getCenter();
				const zoom = MAPBOX.getZoom();
				const msg = {
					type: "eae:view",
					zoom: +zoom.toFixed(2),
					center: { lng: +center.lng.toFixed(4), lat: +center.lat.toFixed(4) },
				};
				for (const target of targets) {
					try {
						window.parent.postMessage(msg, target);
					} catch (_) {}
				}
			}, 500);
		});
	}

	window.addEventListener('message', (event) => {
		const allowed = allowed_origins();
		if (!allowed.includes(event.origin)) return;
		if (!event.data || event.data.type !== 'eae:set') return;

		const data = event.data;

		// Apply fields in safe, logical order:
		// 1. divtier before subdiv
		if ('divtier' in data) {
			try {
				STATE.divtier = data.divtier;
			} catch (_) {}
		}

		if ('subdiv' in data) {
			try {
				STATE.subdiv = data.subdiv;
			} catch (_) {}
		}

		// 2. zoom and center
		if ('zoom' in data) {
			try {
				STATE.zoom = data.zoom;
			} catch (_) {}
		}

		if ('center' in data) {
			try {
				STATE.center = data.center;
			} catch (_) {}
		}

		// 3. bounds validation and fit
		if ('bounds' in data) {
			const b = data.bounds;
			if (Array.isArray(b) && b.length === 4 &&
				b.every(n => typeof n === 'number' && isFinite(n)) &&
				b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90 &&
				b[0] < b[2] && b[1] < b[3]) {
				try {
					mapbox_fit(b);
				} catch (e) {
					console.warn('embed: bounds fit failed', e);
				}
			}
		}

		// 4. view
		if ('view' in data) {
			try {
				STATE.view = data.view;
			} catch (_) {}
		}

		// 5. criteria
		if ('criteria' in data) {
			if (typeof window.setCriteriaMask === 'function') {
				window.setCriteriaMask(Boolean(data.criteria));
			}
		}

		// 6. layers exact matching
		if ('layers' in data && data.layers && typeof data.layers === 'object') {
			try {
				const { on = [], off = [] } = data.layers;
				if (window.DST) {
					const protectedTypes = new Set(['polygons-boundaries']);
					const protectedNames = new Set(['admin-tiers']);

					for (const target of on) {
						for (const ds of window.DST.values()) {
							if (protectedTypes.has(ds.type) || protectedNames.has(ds.category?.name)) continue;
							if (String(ds.id) === String(target) || ds.name === target) {
								if (!ds.on) ds.turn(true);
								break;
							}
						}
					}

					for (const target of off) {
						for (const ds of window.DST.values()) {
							if (protectedTypes.has(ds.type) || protectedNames.has(ds.category?.name)) continue;
							if (String(ds.id) === String(target) || ds.name === target) {
								if (ds.on) ds.turn(false);
								break;
							}
						}
					}
				}
			} catch (err) {
				console.error('Error applying embed layers:', err);
			}
		}
	});
}
