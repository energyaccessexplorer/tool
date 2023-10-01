import DS from './ds.js';

import {
	dig as controls_dig,
} from './controls.js';

import {
	toggle_left_panel,
} from './a.js';

const mark = Object.freeze({
	"title":    null,
	"position": 'C',
	"align":    "middle",
	"close":    false,
});

export default [
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
			return this.ds.on && this.ds.layers.length && qs('[slot=range] .svg-interval', this.ds.card);
		},
		"mock": {
			"el":     function() { return qs('header', this.el); },
			"action": 'click',
		},
	},
	{
		"target": function() {
			this.ds = DST.get('health');
			return this.ds.card;
		},
		"mark": {
			"el": function() {
				return qs('[slot=range] .svg-interval', this.el);
			},
			"position": 'C',
			"close":    false,
		},
		"run": function() {
			toggle_left_panel('cards');
		},
		"wait": function() {
			return or(
				+this.ds._domain.max !== +this.ds.domain.max,
				+this.ds._domain.min !== +this.ds.domain.min,
			);
		},
		"mock": {
			"action": function() {
				delay(2).then(_ => {
					const d = { "min": 0, "max": 15 };

					DST.get('health').card.range_el.change(d);
					DST.get('health')._domain = d;
					O.view = U.view;
				});
			},
		},
	},
	{
		mark,
		"target": '[for=controls]',
		"listen": {
			"action": 'click',
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
