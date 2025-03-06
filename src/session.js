import modal from '../lib/modal.js';

import {
	generate as config_gen,
} from './config.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

const url = new URL(location);

function set_name(s, callback) {
	const i = document.createElement('input');
	const f = document.createElement('form');

	i.setAttribute('required', '');

	i.style = `
font-size: 1.2em;
padding: 7px 12px;
`;

	f.append(i);

	const m = new modal({
		"header":  "Save Analysis",
		"content": f,
	});

	f.onsubmit = function(e) {
		e.preventDefault();
		m.remove();

		s.title = i.value;

		callback();

		return false;
	};

	m.show();

	i.focus();
};

export function snapshot(callback) {
	const user_id = user_extract('id');

	if (!user_id) {
		register_login();
		return;
	}

	const snapshot_id = url.searchParams.get('snapshot');

	const config = config_gen();

	delete config.geography;

	function patch() {
		API.patch('snapshots', { "time": `eq.${snapshot_id}` }, { "payload": { config } })
			.then(_ => FLASH.push({ "title": "Updated Analysis", "type": "success" }));

		return snapshot_id;
	};

	function post() {
		const s = {
			"time":         (new Date()).getTime(),
			"geography_id": GEOGRAPHY.id,
			"env":          ENV[0],
			user_id,
			config,
		};

		set_name(s, _ => {
			API.post('snapshots', null, { "payload": s })
				.then(_ => FLASH.push({ "title": "Created Analysis", "type": "success" }))
				.then(_ => url.searchParams.set('snapshot', s['time']))
				.then(_ => history.replaceState(null, null, url))
				.then(_ => typeof callback === 'function' ? callback() : _);
		});

		SNAPSHOT = s;

		return s['time'];
	};

	return (snapshot_id && SNAPSHOT.user_id === SELF.id) ? patch() : post();
};
