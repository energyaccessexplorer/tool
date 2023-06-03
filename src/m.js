import {
	logged_in as user_logged_in,
} from './user.js';

function unique(arr) {
	return arr.filter((v,i,a) => a.indexOf(v) === i);
};

function loading(bool) {
	qs('#app-loading').style['display'] = bool ? 'block' : 'none';
};

export async function init() {
	console.log(user_logged_in());

	const sessions = await API.get('sessions', {
		"user_id": `eq.${localStorage['user-id']}`,
		"select":  ["*", "snapshots(*)"],
	});

	const gs = unique(sessions.map(t => t.geography_id));

	const trees = await API.get('geographies_tree_up',   { "id": `in.(${gs.join(',')})`});
	const flat = [].concat.call(trees.map(t => t.path)).flat();

	const geographies = await API.get('geographies', {
		"id":     `in.(${flat.join(',')})`,
		"select": ["id", "name"],
	});

	const container = document.querySelector('#sessions');

	sessions.sort((a,b) => (a.time > b.time ? -1 : 1)).forEach(s => {
		s.size = s.snapshots.length;

		if (!s.size) return;

		s.last = s.snapshots[s.size - 1]['time'];

		s.url = `/a/?id=${s.geography_id}&snapshot=${s.last}`;

		const d = new Date(s.time);
		s.date = d.toLocaleDateString() + " at " + d.toLocaleTimeString();

		s.path = trees.find(t => t.id === s.geography_id).path.map(e => geographies.find(g => g.id === e).name).join(" › ");

		const m = tmpl('#session');
		bind(m,s);

		container.append(m);
	});

	loading(false);
};
