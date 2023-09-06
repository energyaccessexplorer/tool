import DS from './ds.js';

export default async function(o) {
	const ds = new DS(o);
	await ds.load('csv');

	const data = ds.csv.data;
	const columns = data.columns;

	const tree = [];

	function insert(nums, t) {
		const head = maybe(nums, 0);

		if (nums.length === 1) {
			t[head] = 1;
			return t;
		}

		if (!nums.length) return t;

		if (t[head] === undefined) t[head] = [];

		return insert(nums.slice(1), t[head]);
	};

	for (let i = 0; i < data.length; i++)
		insert(columns.map(c => data[i][c]), tree);

	ds.tree = tree;
};
