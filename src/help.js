import nanny from '../lib/nanny.js';

import bubblemessage from '../lib/bubblemessage.js';

import {
	dig as controls_dig,
} from './controls.js';

import {
	select_tab as controls_select_tab,
} from './controls-search.js';

import {
	toggle_left_panel,
	clean,
} from './a.js';

import DS from './ds.js';

const welcome = (_ => {
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
		ce('p', `Check out the highlights and learn what<br>you can do with the map.`, { "style": ps }),
	], { "style": divstyle });
})();

const steps = [
	{
		"lazy":   true,
		"target": 'body',
		"mark":   {
			"title":    `Welcome to ${ea_settings.title}`,
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
			"message":  "Select <strong>sub-national level data</strong>. These can be used as filters to identify regions of interest.",
			"position": "E",
			"align":    "middle",
		},
		"target": function() {
			this.ds = DS.array.find(d => maybe(d.category, 'controls', 'path', 0) === "census");
			return this.ds.controls;
		},
		"run": function() {
			toggle_left_panel('controls');
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
			"message":  "Click on the <strong>Demand</strong> data group.",
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
			"message":  "Select data on <strong>Demographics</strong> and <strong>Social and Productive Uses</strong>. These will be used to visualize current and/or potential demand for energy.",
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
			"message":  "Select the <strong>Healthcare Facilities</strong> dataset",
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
			"message":  `<strong>Filter areas</strong> that are close to social loads by selecting a short proximity (e.g. set proximity to healthcare facilities at 10km)`,
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
					O.view = U.view;
				});
			},
		},
	},
	{
		"mark": {
			"title":    "6/9",
			"message":  "Click on the <strong>Supply</strong> data group.",
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
			"message":  "Select data on <strong>Resources</strong> and <strong>Infrastructure</strong> to visualize current and/or potential energy supply.",
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
			"message":  "<strong>Visualize Underlying Data</strong> Click on the map to read location specific information of the top most layer.",
			"position": "C",
			"align":    "middle",
		},
		"run":    function() { if (!INFOMODE) O.info_mode(); },
		"listen": {
			"action": 'click',
		},
	},
	{
		"target": '#view-outputs',
		"mark":   {
			"title":    "9/9",
			"message":  "Analysis indicates low hanging fruits (energy access potential index) areas where demand or supply are likely to be higher (demand and supply index) and areas where finance assistance is needed the most",
			"position": "S",
			"align":    "middle",
		},
		"listen": {
			"action": 'click',
		},
	},
];

const bubblefn = (m, el) => new bubblemessage(m, el);

const HELP = new nanny({ steps, bubblefn });

export function init() {
	qs('#drawer-help').onclick = run;

	if (![null, "inputs"].includes(U.view)) return;
	if (DS.all("on").length) return;

	HELP.start();
};

export function run() {
	clean();

	HELP.current_step = -1;
	HELP.start();
};
