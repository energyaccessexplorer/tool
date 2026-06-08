export function sentry_set_user(user) {
	window.Sentry?.onLoad?.(() => {
		if (!user || !user.id) {
			window.Sentry.setUser(null);
			return;
		}
		window.Sentry.setUser({
			"id":    String(user.id),
			"email": user.email ?? undefined,
			"role":  user.role  ?? undefined,
		});
		window.Sentry.setTag('user.role', user.role ?? 'anonymous');
	});
}

export function sentry_set_geography(geo) {
	if (!geo) return;
	window.Sentry?.onLoad?.(() => {
		window.Sentry.setTag('geography.id',   String(geo.id));
		window.Sentry.setTag('geography.name', geo.name ?? '');
		window.Sentry.setContext('geography', {
			"id":            geo.id,
			"name":          geo.name,
			"configuration": geo.configuration ?? null,
		});
		window.Sentry.addBreadcrumb({
			"category": 'geography',
			"message":  `Geography loaded: ${geo.name} (${geo.id})`,
			"level":    'info',
		});
	});
}

export function sentry_set_snapshot(snap) {
	window.Sentry?.onLoad?.(() => {
		if (!snap) {
			window.Sentry.setTag('snapshot_id', '');
			return;
		}
		window.Sentry.setTag('snapshot_id', String(snap.time ?? snap.id ?? ''));
		window.Sentry.setContext('snapshot', {
			"id":       snap.time ?? snap.id ?? null,
			"title":    snap.title ?? null,
			"env":      snap.env   ?? null,
			"datasets": snap.config?.datasets?.map(d => d.id || d.name) ?? [],
		});
	});
}

export function sentry_update_datasets(dst) {
	if (!dst) return;
	const active = [];
	dst.forEach((ds) => {
		if (ds.on) active.push({ "id": ds.id, "name": ds.name, "type": ds.type });
	});
	window.Sentry?.onLoad?.(() => {
		window.Sentry.setContext('active_datasets', {
			"count":    active.length,
			"datasets": active,
		});
		window.Sentry.addBreadcrumb({
			"category": 'datasets',
			"message":  `Active datasets changed (${active.length} on)`,
			"level":    'info',
			"data":     { "ids": active.map(d => d.id) },
		});
	});
}

export function sentry_setup_global_handlers(env) {
	const page = location.pathname.split('/').filter(Boolean).at(-1) ?? 'unknown';

	window.Sentry?.onLoad?.(() => {
		window.Sentry.setTag('app.page', page);
		window.Sentry.setTag('app.env', env ?? '');
	});

	// captureException is queued by the loader stub, so no onLoad needed here
	window.addEventListener('unhandledrejection', (event) => {
		window.Sentry?.captureException?.(
			event.reason ?? new Error('Unhandled Promise rejection'),
		);
	});
}
