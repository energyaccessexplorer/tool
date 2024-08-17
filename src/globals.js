ea_views = {
	"inputs": {
		"name":        "Data",
		"description": "Underlying data that go into the analysis",
	},

	"filtered": {
		"name":        "Filtered Areas",
		"description": "Filtered areas",
	},

	"outputs": {
		"name":        "Analysis",
		"description": "Results of the analysis",
	},
};

ea_indexes = {
	"eai": {
		"name":        "Energy Access Potential",
		"compound":    ["demand", "supply"],
		"description": "Current and/or potential",
		"info":        `
The Energy Access Potential Index indentifies areas with higher energy demand and supply
which are characterized with higher index values. It is an aggregated measure of all selected
data sets under both Demand and Supply categories.`,
	},

	"demand": {
		"name":        "Demand Index",
		"compound":    ["demand"],
		"description": "Current and/or potential",
		"info":        `
The Demand Index identifies areas with higher energy demand which are characterized with
higher index values. It is an aggregated and weighted measure of all selected data sets
under Demographics and Socio-economic activities.`,
	},

	"supply": {
		"name":        "Supply Index",
		"compound":    ["supply"],
		"description": "Current and/or potential",
		"info":        `
The Supply Index identifies areas with higher energy supply which are characterized with
higher index values. It is an aggregated and weighted measure of all selected data sets
under Resource Availability and Infrastructure.`,
	},

	"ani": {
		"name":        "Assistance Need Index",
		"compound":    ["demand", "supply"],
		"description": "Areas where financial assistance is needed",
		"info":        `
The Assistance Need Index identifies areas where market assistance is needed the most
which are characterized with higher index values. It is an aggregated and weighted
measure of selected data sets under both Demand and Supply categories indicating high
energy demand, low economic activity, and low access to infrastructure and resources.`,
	},
};
