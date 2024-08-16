import {
	extract as user_extract,
} from './user.js';

import bind from './bind.js';

import modal from '../lib/modal.js';

import tabs from './tabs.js';

const user_id = user_extract('id');

function loading(bool) {
	qs('#app-loading').style['display'] = bool ? 'block' : 'none';
};

function filtering(sessions) {
	const els = Array.from(document.querySelectorAll('.session-square'));

	document.querySelector('input#search').oninput = debounce(function(event) {
		const v = event.target.value;

		const r = new RegExp(v, "i");

		for (const e of els) {
			const s = sessions.find(s => s.time == e.getAttribute('data'));
			if (!s) continue;

			e.style.display = (or(
				s.geography_names_path.join("|").match(r),
				s.title?.match(r),
			)) ? '' : 'none';
		}
	}, 300);
};

function download(sessions) {
	const div = this.closest('.session-square');
	const data = div.getAttribute('data');

	const s = sessions.find(s => s.time === +data);
	if (!s) return;

	fake_blob_download(
		JSON.stringify(s.snapshots[s.snapshots.length - 1]),
		`energyaccessexplorer-config-${s.time}.json`,
	);
};

function edit_title(sessions) {
	const div = this.closest('.session-square');
	const data = div.getAttribute('data');

	const s = sessions.find(s => s.time === +data);
	if (!s) return;

	const input = document.createElement('input');
	input.className = "title-input";

	input.oninput = debounce(function() {
		API.patch('sessions', {
			"time": `eq.${s.time}`,
		}, {
			"payload": {
				"title": input.value,
			},
		}).then(_ => {
			div.querySelector('.title').innerText = input.value;
			API.flash.push({ "message": "Title updated", "type": "success" });
		});
	}, 300);

	const m = new modal({
		"header":  "Edit title",
		"content": input,
	});

	m.show();
};

function base(e) {
	if (location.hostname.match('localhost')) return "";

	const subdomain = e === "production" ? "www" : e;

	return `https://${subdomain}.energyaccessexplorer.org`;
};

function draw_sessions(sessions, geographies, container, trees) {
	sessions.forEach(s => {
		s.size = s.snapshots.length;

		if (!s.size) return;

		s.last = s.snapshots[s.size - 1]['time'];

		s.url = base(s.env) + `/tool/a/?id=${s.geography_id}&snapshot=${s.last}`;

		const d = new Date(s.time);
		s.date = d.toLocaleDateString() + " at " + d.toLocaleTimeString();

		const geos = trees.find(t => t.id === s.geography_id).path.map(e => geographies.find(g => g.id === e).name);

		s.path = geos.join(" › ");
		s.geography_names_path = geos;

		const m = tmpl('#session');
		bind(m,s);

		container.append(m);
	});

	filtering(sessions);

	for (const p of document.querySelectorAll('.bi.bi-pencil'))
		p.onclick = function() { edit_title.call(this, sessions); };

	for (const p of document.querySelectorAll('.download'))
		p.onclick = function() { download.call(this, sessions); };
};


export async function init() {
	if (!user_id) {
		console.warn("NOT logged in.");
		loading(false);
		return;
	}

	const sessions = await API.get('sessions', {
		"user_id": `eq.${user_id}`,
		"select":  ["*", "snapshots(*)"],
		"order":   "time.desc",
	});

	sessions.forEach(s => s.title = s.title || '-- untitled --');

	const gs = unique(sessions.map(t => t.geography_id));

	const trees = await API.get('geographies_tree_up',   { "id": `in.(${gs.join(',')})`});
	const flat = [].concat.call(trees.map(t => t.path)).flat();

	const geographies = await API.get('geographies', {
		"id":     `in.(${flat.join(',')})`,
		"select": ["id", "name"],
	});

	const container = document.querySelector('#sessions');

	document.querySelector('#sessions-count').innerText = sessions.length + " Analyses";

	document.querySelector('select').onchange = function() {
		const v = this.value;

		const squares = document.getElementsByClassName('session-square');
		while (squares[0]) squares[0].parentNode.removeChild(squares[0]);

		sessions.sort(function(a,b) {
			if (a[v] > b[v]) return 1;
			else if (a[v] < b[v]) return -1;
			else return 0;
		});

		draw_sessions(sessions, geographies, container, trees);
	};

	document.querySelector('#change-password').onclick = function() {
		window.location = `/password-reset?email=${user_extract('email')}`;
	};

	draw_sessions(sessions, geographies, container, trees);

	tabs(document.body);

	loading(false);
};
