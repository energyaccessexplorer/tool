import nanny from '../lib/nanny.js';

import bubblemessage from '../lib/bubblemessage.js';

import DS from './ds.js';

import {
	select_tab as controls_select_tab,
} from './controls-search.js';

import {
	toggle_left_panel,
} from './a.js';

import controls from './qa-controls.js';

import outputs from './qa-outputs.js';

import snapshot from './qa-snapshot.js';

import indexes from './qa-indexes.js';

const batches = {
	"clear": [
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
	],
	controls,
	outputs,
	snapshot,
	indexes,
};

const bubblefn = (m, el) => new bubblemessage(m, el);

const QA = new nanny({ "steps": batches['clear'], bubblefn });
QA.mock = true;

export function run() {
	const url = new URL(location);
	const p = url.searchParams.get('qa');

	if (!p) return;

	if (p === "all")
		for (const b of ['controls', 'outputs', 'snapshot', 'indexes'])
			QA.steps = QA.steps.concat(batches[b]);

	else if (!batches[p])
		console.error("No such QA batch:", p);

	else
		QA.steps = QA.steps.concat(batches[p]);

	QA.current_step = -1;
	QA.start();
};

export default QA;
