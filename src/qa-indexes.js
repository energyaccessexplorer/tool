const mark = Object.freeze({
	"title":    null,
	"position": 'C',
	"align":    "middle",
	"close":    false,
});

export default [
	{
		mark,
		"target": '#index-graphs-info',
		"listen": {
			"action": 'click',
		},
	},
	{
		"lazy":   true,
		"target": '#eae-info-modal',
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
		"target": '#index-graphs-opacity .opacity-box',
		"listen": {
			"action": 'mouseleave',
		},
	},
];
