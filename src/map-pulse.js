// "Analysis is being recomputed" wash, clipped to the geography, with a sine
// wave sweeping it. The mask is reprojected to screen pixels on map move (only
// while the wash is up), so it needs no mapbox layer and never repaints the map.

import {
	maybe,
	qs,
} from '../lib/helpers.js';

// One wave crest per PERIOD px, travelling right at PERIOD / DURATION.
const PERIOD = 320;
const DURATION = 1300;
const TINT = '0, 0, 0';
const STOP = 0.34;
const STEPS = 8;
const FADE_IN = 260;
const FADE_OUT = 220;

const reduced_motion = window.matchMedia('(prefers-reduced-motion: reduce)');

let root = null;
let wash = null;
let wave = null;
let clip_path = null;
let geometry_source = null;
let rings = [];
let animation = null;
let opacity_animation = null;
let frame = 0;
let running = false;
let fade = 0;

function mercator([lng, lat]) {
	const s = Math.sin(Math.min(85.0511, Math.max(-85.0511, lat)) * Math.PI / 180);

	return [
		(lng + 180) / 360,
		0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI),
	];
}

function outline_rings() {
	const features = maybe(window.OUTLINE, 'vectors', 'data', 'features') || [];
	const out = [];

	for (const f of features) {
		const g = maybe(f, 'geometry');

		if (!g) continue;

		if (g.type === 'Polygon') out.push(...g.coordinates);
		else if (g.type === 'MultiPolygon') for (const p of g.coordinates) out.push(...p);
	}

	return out.map(r => r.map(mercator));
}

function render() {
	if (!window.MAPBOX || !clip_path) return;

	// Merc of [0,0] is .5/.5 and of [90,0] is .75/.5, so two projections pin
	// the affine -- no assumption about Mapbox's world size.
	const a = window.MAPBOX.project([0, 0]);
	const b = window.MAPBOX.project([90, 0]);
	const s = (b.x - a.x) / 0.25;
	const tx = a.x - s * 0.5;
	const ty = a.y - s * 0.5;

	// No outline (or one whose vectors failed): dim everything rather than
	// nothing, so the pulse still says "working".
	if (!rings.length) {
		clip_path.setAttribute('d', '');
		wash.style.clipPath = 'none';

		return;
	}

	wash.style.clipPath = `url(#map-pulse-clip)`;

	clip_path.setAttribute('d', rings
		.map(r => r
			.map(([x, y], i) => `${i ? 'L' : 'M'}${(tx + x * s).toFixed(1)} ${(ty + y * s).toFixed(1)}`)
			.join('') + 'Z')
		.join(''));
}

function sync() {
	if (frame) return;

	frame = window.requestAnimationFrame(() => {
		frame = 0;
		render();
	});
}

function wave_gradient() {
	const stops = [];

	for (let i = 0; i <= STEPS; i++) {
		const t = i / STEPS;
		const alpha = (0.5 - 0.5 * Math.cos(2 * Math.PI * t)) * STOP;

		stops.push(`rgba(${TINT}, ${alpha.toFixed(3)}) ${(t * 100).toFixed(1)}%`);
	}

	return `linear-gradient(90deg, ${stops.join(',')})`;
}

function build() {
	const container = qs('#mapbox-container');

	if (!container) return false;
	if (root) return true;

	root = document.createElement('div');
	root.id = 'map-pulse';
	root.setAttribute('aria-hidden', 'true');

	root.innerHTML = `
<svg id="map-pulse-defs" width="0" height="0">
  <defs>
    <clipPath id="map-pulse-clip" clipPathUnits="userSpaceOnUse">
      <path id="map-pulse-clip-path" clip-rule="evenodd"></path>
    </clipPath>
  </defs>
</svg>
<div id="map-pulse-wash"><div id="map-pulse-wave"></div></div>`;

	container.append(root);

	wash = qs('#map-pulse-wash', root);
	wave = qs('#map-pulse-wave', root);
	clip_path = qs('#map-pulse-clip-path', root);

	wave.style.left = `${-PERIOD}px`;
	wave.style.backgroundImage = wave_gradient();
	wave.style.backgroundSize = `${PERIOD}px 100%`;

	return true;
}

// Fades from wherever the wash currently is, so an interrupted fade (a rapid
// toggle) continues instead of snapping.
function fade_to(target, duration) {
	const from = window.getComputedStyle(wash).opacity;

	if (opacity_animation) opacity_animation.cancel();

	wash.style.opacity = String(target);

	opacity_animation = wash.animate([{ "opacity": from }, { "opacity": String(target) }], {
		"duration": duration,
		"easing":   'ease-out',
	});

	return opacity_animation;
}

export function start() {
	if (running) return;
	if (!window.MAPBOX || !build()) return;

	fade += 1;
	running = true;

	const source = maybe(window.OUTLINE, 'vectors', 'data');

	if (source !== geometry_source) {
		geometry_source = source;
		rings = outline_rings();
	}

	render();
	window.MAPBOX.on('move', sync);
	window.MAPBOX.on('resize', sync);

	root.style.display = 'block';
	fade_to(1, FADE_IN);

	if (reduced_motion.matches) return;

	animation = wave.animate([{ "transform": 'translateX(0px)' }, { "transform": `translateX(${PERIOD}px)` }], {
		"duration":   DURATION,
		"iterations": Infinity,
		"easing":     'linear',
	});
}

export function stop() {
	if (!running) return;

	running = false;

	window.MAPBOX.off('move', sync);
	window.MAPBOX.off('resize', sync);

	if (frame) {
		window.cancelAnimationFrame(frame);
		frame = 0;
	}

	if (animation) {
		animation.cancel();
		animation = null;
	}

	if (!root) return;

	const token = ++fade;

	fade_to(0, FADE_OUT).onfinish = () => {
		opacity_animation = null;

		if (token !== fade) return;

		root.style.display = 'none';
	};
}
