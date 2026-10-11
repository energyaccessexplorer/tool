function allowed_origins() {
	const raw = window.EAE?.['settings']?.embed_origins;
	if (!raw || typeof raw !== 'string' || !raw.trim()) return [];
	return raw.split(',').map(s => s.trim()).filter(Boolean);
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

	if (parent_origin && origins.includes(parent_origin)) {
		window.parent.postMessage({ "type": "eae:ready" }, parent_origin);
	}

	window.addEventListener('message', (event) => {
		const allowed = allowed_origins();
		if (!allowed.includes(event.origin)) return;
		if (!event.data || event.data.type !== 'eae:set') return;

		const data = event.data;

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

		if ('view' in data) {
			try {
				STATE.view = data.view;
			} catch (_) {}
		}
	});
}
