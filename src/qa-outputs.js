const mark = Object.freeze({
	"title":    null,
	"position": 'C',
	"align":    "middle",
	"close":    false,
});

export default [
	{
		mark,
		"target": '#view-outputs',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"target": '#mapbox-container',
		"run":    function() {
			if (!INFOMODE) O.info_mode();
			MAPBOX.fire('click', { "lngLat": MAPBOX.getCenter() });
		},
		"listen": {
			"action": 'click',
		},
	},
	{
		"lazy":   true,
		"target": 'body',
		"run":    function() {
			qs('bubble-message').remove();
		},
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#indexes-list [bind="demand"]',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#indexes-list [bind="supply"]',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#indexes-list [bind="ani"]',
		"listen": {
			"action": 'click',
		},
	},
	{
		mark,
		"lazy":   true,
		"target": '#indexes-list [bind="eai"]',
		"listen": {
			"action": 'click',
		},
	},
];
