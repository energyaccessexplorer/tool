import nanny from '../lib/nanny.js';

import bubblemessage from '../lib/bubblemessage.js';

import { t } from './translate.js';

import {
	dig as controls_dig,
} from './controls.js';

import {
	select_tab as controls_select_tab,
} from './controls-search.js';

import {
	left_panel,
	clean,
} from './a.js';

import {
	ce,
	delay,
	maybe,
	or,
	qs,
} from '../lib/helpers.js';

import DS from './ds.js';

function welcome_el() {
	const divstyle = `
background-color: #ffffff;
padding: 1em 2em;
margin: 2em 0px 1em 1em;
cursor: pointer;
display: flex;
justify-content: space-between;
`;

	const ps = `
color: #575757 !important;
font-weight: bold;
`;

	const is = `
font-size: 2.5em;
margin-top: 0.25em;
margin-right: 0.5em;
`;

	return ce('div', [
		ce('i', null, { "class": "bi-info-circle", "style": ps + is }),
		ce('p', t(window.LOCALE, 'help.welcome_text'), { "style": ps }),
	], { "style": divstyle });
}

function build_steps() {
	const welcome = welcome_el();

	return [
		{
			"lazy":   true,
			"target": 'body',
			"mark":   {
				"title":    t(window.LOCALE, 'help.welcome_title', { "title": EAE['settings'].title }),
				"message":  welcome,
				"align":    "middle",
				"position": "C",
			},
			"listen": {
				"el":     _ => welcome,
				"action": 'click',
			},
		},
		{
			"mark": {
				"title":    "1/9",
				"message":  t(window.LOCALE, 'help.step1'),
				"position": "E",
				"align":    "middle",
			},
			"target": function() {
				this.ds = DS.array.find(d => maybe(d.category, 'controls', 'path', 0) === "census");
				return this.ds.controls;
			},
			"run": function() {
				left_panel('controls');
				controls_select_tab(qs('#controls-tab-census'), "census");
				controls_dig(this.ds);
			},
			"listen": {
				"el":     function() { return qs('header', this.el); },
				"action": 'click',
			},
		},
		{
			"target": '#controls-tab-demand',
			"mark":   {
				"title":    "2/9",
				"message":  t(window.LOCALE, 'help.step2'),
				"position": "E",
				"align":    "middle",
			},
			"listen": {
				"action": 'click',
			},
		},
		{
			"mark": {
				"title":    "3/9",
				"message":  t(window.LOCALE, 'help.step3'),
				"position": "E",
				"align":    "middle",
			},
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
			"mark": {
				"title":    "4/9",
				"message":  t(window.LOCALE, 'help.step4'),
				"position": "E",
				"align":    "middle",
			},
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
				"title":    "5/9",
				"message":  t(window.LOCALE, 'help.step5'),
				"position": "E",
				"align":    "middle",
			},
			"wait": function() {
				return or(
					+this.ds._domain.max !== +this.ds.domain.max,
					+this.ds._domain.min !== +this.ds.domain.min,
				);
			},
			"mock": {
				"el":     function() { return qs('header', this.el); },
				"action": function() {
					delay(0.5).then(_ => {
						const d = { "min": 0, "max": 15 };

						DST.get('health')._domain = d;
					});
				},
			},
		},
		{
			"mark": {
				"title":    "6/9",
				"message":  t(window.LOCALE, 'help.step6'),
				"position": "E",
				"align":    "middle",
			},
			"target": '#controls-tab-supply',
			"listen": {
				"action": 'click',
			},
		},
		{
			"mark": {
				"title":    "7/9",
				"message":  t(window.LOCALE, 'help.step7'),
				"position": "E",
				"align":    "middle",
			},
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
		{
			"target": '#mapbox-container',
			"mark":   {
				"title":    "8/9",
				"message":  t(window.LOCALE, 'help.step8'),
				"position": "C",
				"align":    "middle",
			},
			"listen": {
				"action": 'click',
			},
		},
		{
			"target": '#view-analysis',
			"mark":   {
				"title":    "9/9",
				"message":  t(window.LOCALE, 'help.step9'),
				"position": "S",
				"align":    "middle",
			},
			"listen": {
				"action": 'click',
			},
		},
	];
}

const HELP = new nanny({ "steps": [], "bubblefn": (m, el) => new bubblemessage(m, el) });

export function init() {
	if (MOBILE && GEOGRAPHY.timeline) return;

	qs('#drawer-help').onclick = run;

	if (STATE.datasets.length) return;

	HELP.steps = build_steps();
	HELP.start();
};

export function run() {
	clean();

	HELP.steps = build_steps();
	HELP.current_step = -1;
	HELP.start();
};
