const mark = Object.freeze({
	"title":    null,
	"position": 'C',
	"align":    "middle",
	"close":    false,
});

export default [
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
