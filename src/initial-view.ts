export type InitialViewStrategy = 'apply-configured-view' | 'fit-envelope-on-idle' | 'fit-envelope-after-delay';

export function initialViewStrategy(
	embed: boolean,
	viewFromUrl: boolean,
	urlStateFromUrl: boolean,
): InitialViewStrategy {
	if (embed) return viewFromUrl ? 'apply-configured-view' : 'fit-envelope-on-idle';
	return urlStateFromUrl ? 'apply-configured-view' : 'fit-envelope-after-delay';
}
