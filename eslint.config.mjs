import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
	"baseDirectory": path.dirname(fileURLToPath(import.meta.url)),
	"recommendedConfig": js.configs.recommended,
	"allConfig": js.configs.all
});

export default [{
	"ignores": ["lib/*.js"],
}, ...compat.extends("eslint:recommended"), {
	"languageOptions": {
		"globals": {
			...globals.browser,
			"d3": "readonly",
			"sortable": "readonly",
			"mapboxgl": "readonly",
			"GeoTIFF": "readonly",
			"geojsonExtent": "readonly",
			"SphericalMercator": "readonly",
			"jwt_decode": "readonly",
			"DST": "readonly",
			"GEOGRAPHY": "writable",
			"OUTLINE": "writable",
			"MAPBOX": "writable",
			"INFOMODE": "writable",
			"COORDINATES": "writable",
			"COORDINATESMODE": "writable",
			"MOBILE": "writable",
			"U": "writable",
			"O": "writable",
			"ENV": "writable",
			"PARAMS": "writable",
			"SUMMARY": "writable",
			"qs": "readonly",
			"qsa": "readonly",
			"ce": "readonly",
			"delay": "readonly",
			"debounce": "readonly",
			"until": "readonly",
			"maybe": "readonly",
			"has": "readonly",
			"empty": "readonly",
			"and": "readonly",
			"or": "readonly",
			"coalesce": "readonly",
			"attach": "readonly",
			"tmpl": "readonly",
			"slot_populate": "readonly",
			"Whatever": "readonly",
			"same": "readonly",
			"font_icon": "readonly",
			"fake_blob_download": "readonly",
			"FLASH": "readonly",
			"API": "readonly",
			"ea_settings": "readonly",
			"ea_views": "writable",
			"ea_params": "writable",
			"ea_indexes": "writable",
			"ea_default_colorscale": "writable",
			"ea_analysis_colorscale": "writable",
			"ea_lowmedhigh_scale": "writable",
			"colorscale": "readonly",
			"svg_pie": "readonly",
			"svg_interval": "readonly",
			"svg_checkbox": "readonly",
			"opacity_control": "readonly",
			"elem_collapse": "readonly",
			"loading": "readonly",
			"super_error": "readonly",
			"table_data": "readonly",
			"coordinates_to_raster_pixel": "readonly",
			"raster_pixel_to_coordinates": "readonly",
			"unique": "readonly",
			"unique_by": "readonly",
			"jsonclone": "readonly",
		},

		"ecmaVersion": "latest",
		"sourceType": "module",
	},

	"rules": {
		"comma-dangle": ["error", "always-multiline"],
		"indent": ["error", "tab"],

		"key-spacing": ["error", {
			"align": {
				"beforeColon": false,
				"afterColon": true,
				"on": "value",
				"mode": "minimum",
			},
		}],

		"linebreak-style": ["error", "unix"],
		"quotes": "off",
		"quote-props": ["error", "always"],
		"semi": ["error", "always"],
		"no-cond-assign": "off",
		"no-console": "off",
		"no-useless-escape": "off",
		"no-extra-semi": "off",
		"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
		"no-prototype-builtins": "off",

		"no-unused-vars": ["warn", {
			"varsIgnorePattern": "^_",
			"argsIgnorePattern": "^_",
		}],
	},
}];
