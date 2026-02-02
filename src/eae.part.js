EAE['indexes'] = {
	"eai": {
		"name":     "Energy Access Potential",
		"compound": ["demand", "supply"],
		"subtext":  "Current and/or potential",
		"explain":  "Identifies areas with higher energy demand and supply which are characterized with higher index values. It is an aggregated measure of all selected data sets under both Demand and Supply categories.",
	},

	"demand": {
		"name":     "Demand Index",
		"subtext":  "Current and/or potential",
		"compound": ["demand"],
		"explain":  "Identifies areas with higher energy demand which are characterized with higher index values. It is an aggregated and weighted measure of all selected data sets under Demographics and Socio-economic activities.",
	},

	"supply": {
		"name":     "Supply Index",
		"subtext":  "Current and/or potential",
		"compound": ["supply"],
		"explain":  "Identifies areas with higher energy supply which are characterized with higher index values. It is an aggregated and weighted measure of all selected data sets under Resource Availability and Infrastructure.",
	},

	"ani": {
		"name":     "Assistance Need Index",
		"subtext":  "Areas where financial assistance is needed",
		"compound": ["demand", "supply"],
		"explain":  "Identifies areas where market assistance is needed the most which are characterized with higher index values. It is an aggregated and weighted measure of selected data sets under both Demand and Supply categories indicating high energy demand, low economic activity, and low access to infrastructure and resources.",
	},
};
