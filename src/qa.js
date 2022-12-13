import nanny from '../lib/nanny.js';

import bubblemessage from '../lib/bubblemessage.js';

import DS from './ds.js';

import {
	dig as controls_dig,
} from './controls.js';

import {
	select_tab as controls_select_tab,
} from './controls-search.js';

import {
	toggle_left_panel,
} from './a.js';

const mark = Object.freeze({
	"title":    null,
	"position": 'C',
	"align":    "middle",
	"close":    false,
});

const _clear_batch = [
	{
		"lazy":   true,
		"target": 'body',
		"run":    function() {
			U.output = 'eai';
			U.view = 'inputs';

			DS.all("on").forEach(d => d.active(false, false));

			for (let e of qsa('.controls-subbranch'))
				elem_collapse(qs('.controls-container', e), e);

			toggle_left_panel('controls');
			controls_select_tab(qs('#controls-tab-census'), "census");

			O.view = U.view;
		},
		"listen": {
			"el":     _ => qs('body'),
			"action": 'click',
		},
	},
];

const _controls_batch = [
	{
		mark,
		"target": function() {
			this.ds = DS.array.find(d => maybe(d.category, 'controls', 'path', 0) === "census");
			return this.ds.controls;
		},
		"run": function() {
			controls_dig(this.ds);
		},
		"listen": {
			"el":     function() { return qs('header', this.el); },
			"action": 'click',
		},
	},
	{
		mark,
		"target": '#controls-tab-demand',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"target": function() {
			this.ds = DST.get('population-density');
			return this.ds.controls;
		},
		"run": function() {
			controls_dig(this.ds);
		},
		"wait": function() {
			return this.ds.on && this.ds.layers.length;
		},
		"mock": {
			"el":     function() { return qs('header', this.el); },
			"action": 'click',
		},
	},
	{
		mark,
		"target": function() {
			this.ds = DST.get('health');
			return this.ds.controls;
		},
		"run": function() {
			controls_dig(this.ds);
		},
		"wait": function() {
			return this.ds.on && this.ds.layers.length && qs('[slot=range-slider] .svg-interval', this.ds.controls);
		},
		"mock": {
			"el":     function() { return qs('header', this.el); },
			"action": 'click',
		},
	},
	{
		"mark": {
			"el": function() {
				return qs('[slot=range-slider] .svg-interval', this.el);
			},
			"position": 'C',
			"close":    false,
		},
		"target": function() {
			this.ds = DST.get('health');
			return this.ds.controls;
		},
		"wait": function() {
			return or(
				+this.ds._domain.max !== +this.ds.domain.max,
				+this.ds._domain.min !== +this.ds.domain.min,
			);
		},
		"mock": {
			"action": function() {
				delay(0.5).then(_ => {
					const d = { "min": 0, "max": 15 };

					DST.get('health').controls.range_group.change(d);
					DST.get('health')._domain = d;
					O.view = U.view;
				});
			},
		},
	},
	{
		mark,
		"target": '#controls-tab-supply',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"target": function() {
			this.ds = DST.get('ghi');
			return this.ds.controls;
		},
		"run": function() {
			controls_dig(this.ds);
		},
		"wait": function() {
			return this.ds.on && this.ds.layers.length;
		},
		"mock": {
			"el":     function() { return qs('header', this.el); },
			"action": 'click',
		},
	},
];

const _outputs_batch = [
	{
		mark,
		"target": '#view-outputs',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"target": '#mapbox-container',
		"run":    function() {
			if (!INFOMODE) O.info_mode();
			MAPBOX.fire('click', { "lngLat": MAPBOX.getCenter() });
		},
		"listen": {
			"action": 'click',
		},
	},
	{
		"lazy":   true,
		"target": 'body',
		"run":    function() {
			qs('bubble-message').remove();
		},
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#indexes-list [bind="demand"]',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#indexes-list [bind="supply"]',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#indexes-list [bind="ani"]',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#indexes-list [bind="eai"]',
		"listen": {
			"action": 'click',
		},
	},
];

const _snapshot_batch = [
	{
		mark,
		"lazy":   true,
		"target": '#summary-button',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#snapshot-modal .big-green-button:nth-child(1)',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#snapshot-modal .big-green-button:nth-child(1)',
		"listen": {
			"action": 'click',
		},
	},
	{
		"lazy":   true,
		"target": '#snapshot-modal',
		"listen": {
			"action": 'click',
		},
	},
];

const _other_batch = [
	{
		mark,
		"target": '#index-graphs-info',
		"listen": {
			"action": 'click',
		},
	},
	{
		"lazy":   true,
		"target": '#indexes-modal',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"target": '#index-graphs-opacity > div i',
		"listen": {
			"action": 'click',
		},
	},
	{
		"target": '#drawer [for="analysis"]',
		"listen": {
			"action": 'click',
		},
	},
];

const steps = [].concat(
	_clear_batch,
	_controls_batch,
	_outputs_batch,
	_snapshot_batch,
	_other_batch,
);

const bubblefn = (m, el) => new bubblemessage(m, el);

const QA = new nanny({ steps, bubblefn });
QA.mock = true;

export function run() {
	QA.current_step = -1;
	QA.start();
};

export default QA;
