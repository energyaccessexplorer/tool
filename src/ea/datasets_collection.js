const ea_datasets_collection = [
  {
    id: "dummy",
    type: "raster",
    description: "Dummy dataset",

    url: "empty_8bui.tif",
    parse: ea_datasets_tiff_url,

    band: 0
  },
  {
    id: "ghi",
    type: "raster",
    description: "Solar Potential",
    unit: "kWh/m<sup>2</sup>",

    url: "ghi.tif",
    parse: ea_datasets_tiff_url,

    clamp: false,
    domain: [500, 2800],
    color_scale: 'hot-reverse',
  },
  {
    id: "windspeed",
    type: "raster",
    description: "Windspeed",
    unit: "?",

    url: "windspeed.tif",
    parse: ea_datasets_tiff_url,

    clamp: true,
    domain: [0, 10],
    color_scale: 'hot-reverse',
  },
  {
    id: "poverty",
    type: "raster",
    description: "Poverty",
    unit: "< 2USD/day",

    url: "poverty.tif",
    parse: ea_datasets_tiff_url,

    clamp: false,

    domain: [0, 1],
    color_scale: 'yignbu-reverse',
    weight: 5,
  },
  {
    id: "minigrids",
    type: "points",
    description: "Minigrids",

    endpoint: 'envelope_minigrids',
    parse: ea_datasets_points,

    hide: ea_map_unload,
    symbol: "square",
  },
  {
    id: "minigrids-distance",
    type: "raster",
    description: "Minigrids Distance",
    unit: "km",

    url: "minigrid-distance.tif",
    parse: ea_datasets_tiff_url,

    clamp: false,
    domain: [0, 250],
    range: [1, 0],
    color_scale: 'hot-reverse',
  },
  {
    id: "mines",
    type: "points",
    description: "Mines",

    endpoint: 'envelope_mines',
    parse: ea_datasets_points,

    hide: ea_map_unload,
    symbol: "wye",
  },
  {
    id: "mines-distance",
    type: "raster",
    description: "Mines Distance",
    unit: "km",

    url: "mines-distance.tif",
    parse: ea_datasets_tiff_url,

    clamp: false,
    domain: [0, 250],
    range: [1, 0],
    color_scale: 'hot-reverse',
  },
  {
    id: "schools",
    type: "points",
    description: "Schools",

    endpoint: 'envelope_schools',
    parse: ea_datasets_points,

    hide: ea_map_unload,
    symbol: "square",
  },
  {
    id: "schools-distance",
    type: "raster",
    description: "Schools Distance",
    unit: "km",

    url: "schools-distance.tif",
    parse: ea_datasets_tiff_url,

    clamp: false,
    domain: [120, 0],
    color_scale: 'jet',
    weight: 3,
  },
  {
    id: "transmission-lines",
    type: "polygon",
    description: "Transmission Lines",

    init: 20,
    steps: [1, 10, 20, 30, 50, 100],

    endpoint: 'rpc/merged_transmission_lines_geojson',
    parse: async function(v) {
      await ea_client(
        `${ea_settings.database}/${this.endpoint}`,
        'POST', { km: (v || this.init) },
        (r) => {
          this.features = [r[0]['payload']];

          ea_map_load_features({
            map: ea_map,
            features: this.features,
            cls: this.id,
            scale: 1,
          });
        }
      );
    },

    hide: ea_map_unload,
  },
  {
    id: "transmission-lines-distance",
    type: "raster",
    description: "Transmission Lines Distance",
    unit: "km",

    url: "transmission-lines-distance.tif",
    parse: ea_datasets_tiff_url,

    clamp: false,
    domain: [0, 250],
    range: [1, 0],
    color_scale: 'hot-reverse',
  },
  {
    id: "transmission-lines-exclusion disabled",
    type: "raster",
    description: "Transmission Lines Exclusion",
    unit: "km",

    init: 20,
    steps: [1, 10, 20, 30, 50, 100],

    endpoint: 'rpc/transmission_lines_buffered_tiff',
    parse: ea_datasets_tiff_rpc_stream,

    scale: 'identity',
    clamp: false,
    domain: [0, 1],
    range: [0,-1],
    weight: Infinity,

    datatype: "boolean",
  },
  {
    id: "facilities",
    type: "points",
    description: "Facilities",

    endpoint: 'envelope_facilities',
    parse: ea_datasets_points,

    hide: ea_map_unload,
    symbol: "cross",
  },
  {
    id: "facilities-distance",
    type: "raster",
    description: "Facilities Distance",
    unit: "km",

    url: "facilities-distance.tif",
    parse: ea_datasets_tiff_url,

    clamp: false,
    domain: [0, 250],
    range: [1, 0],
    color_scale: 'hot-reverse',
  },
  {
    id: "powerplants",
    type: "points",
    description: "Power Plants",

    endpoint: 'envelope_powerplants',
    parse: ea_datasets_points,

    hide: ea_map_unload,
    symbol: "star",
  },
  {
    id: "powerplants-distance",
    type: "raster",
    description: "Powerplants Distance",
    unit: "km",

    url: "powerplants-distance.tif",
    parse: ea_datasets_tiff_url,

    clamp: false,
    domain: [0, 250],
    range: [1, 0],
    color_scale: 'hot-reverse',
  },
  {
    id: "hydro",
    type: "points",
    description: "Hydro",

    endpoint: 'envelope_hydro',
    parse: ea_datasets_points,

    hide: ea_map_unload,
    symbol: "circle",
  },
  {
    id: "hydro-distance",
    type: "raster",
    description: "Hydro Distance",
    unit: "km",

    url: "hydro-distance.tif",
    parse: ea_datasets_tiff_url,

    clamp: false,
    domain: [0, 250],
    range: [1, 0],
    color_scale: 'hot-reverse',
  },
  {
    id: "population",
    type: "raster",
    description: "Population density",
    unit: "people/1km<sup>2</sup>",

    url: "population.tif",
    parse: ea_datasets_tiff_url,

    clamp: true,
    domain: [10, 6000],
    color_scale: 'jet',
    weight: 5,
  },
  {
    id: "livestock",
    type: "raster",
    description: "Livestock",
    unit: "%",

    url: "districts.tif",
    parse: ea_datasets_districts_tiff,

    scale: 'livestock',
    clamp: false,
    domain: [0, 100],
    color_scale: 'greys',
    weight: 5,
  },
  {
    id: "mobile",
    type: "raster",
    description: "Mobile phone ownership",
    unit: "%",

    url: "districts.tif",
    parse: ea_datasets_tiff_url,

    scale: 'mobile',
    clamp: false,
    domain: [0, 100],
    color_scale: 'greys',
    weight: 5,
  },
  {
    id: "ironrooftop",
    type: "raster",
    description: "Iron Rooftop",
    unit: "%",

    url: "districts.tif",
    parse: ea_datasets_tiff_url,

    scale: 'ironrooftop',
    clamp: false,
    domain: [0, 100],
    color_scale: 'greys',
    weight: 5,
  },
  {
    id: "nighttime-lights",
    type: "raster",
    description: "Nighttime Lights",
    unit: "?",

    url: "nighttime-lights.tif",
    parse: ea_datasets_tiff_url,

    clamp: true,
    domain: [0, 255],
    color_scale: 'hot-reverse',
    weight: 5,
  },
];
