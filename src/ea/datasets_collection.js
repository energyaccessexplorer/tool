const ea_default_color_scheme = 'jet';

const ea_datasets_collection = [
  {
    id: "ghi",
    type: "raster",
    description: "Solar Potential",
    unit: "kWh/m<sup>2</sup>",

    views: {
      heatmaps: {
        url: "ghi.tif",
        clamp: false,
        domain: [500, 2800],
      }
    }
  },
  {
    id: "windspeed",
    type: "raster",
    description: "Windspeed",
    unit: "m/s",

    views: {
      heatmaps: {
        url: "windspeed.tif",
        clamp: false,
        domain: [0, 10],
      }
    }
  },
  {
    id: "poverty",
    type: "raster",
    description: "Poverty",
    unit: "> 2USD/day",

    views: {
      heatmaps: {
        url: "poverty.tif",
        clamp: false,
        domain: [1, 0],
        precision: 2,
        factor: 100,
        weight: 5,
      }
    }
  },
  {
    id: "minigrids",
    type: "points",
    description: "Minigrids",

    views: {
      polygons: {
        endpoint: 'envelope_minigrids',
        symbol: "square",
      },
      heatmaps: {
        url: "minigrid-distance.tif",
        clamp: false,
        domain: [250, 0],
      }
    },
  },
  {
    id: "mines",
    type: "points",
    description: "Mines",

    views: {
      polygons: {
        endpoint: 'envelope_mines',
        symbol: "diamond",
      },

      heatmaps: {
        url: "mines-distance.tif",
        clamp: false,
        domain: [250, 0],
      }
    },
  },
  {
    id: "schools",
    type: "points",
    description: "Schools",

    views: {
      polygons: {
        endpoint: 'envelope_schools',
        symbol: "square",
      },

      heatmaps: {
        url: "schools-distance.tif",
        clamp: false,
        domain: [120, 0],
        weight: 3,
      }
    },
  },
  {
    id: "transmission-lines",
    type: "polygon",
    description: "Transmission Lines",

    init: 1,
    steps: [1, 10, 20, 30, 50, 100],

    views: {
      polygons: {
        endpoint: 'rpc/merged_transmission_lines_geojson',
        symbol: "wye",
        parse: async function(v) {
          let ds = ea_datasets_collection.find(d => d.id === 'transmission-lines');

          await ea_client(
            `${ea_settings.database}/${ds.views.polygons.endpoint}`,
            'POST', { km: (v || ds.init) },
            (r) => {
              ds.features = [r[0]['payload']];

              ea_map_load_features({
                map: ea_map,
                features: ds.features,
                cls: ds.id,
                scale: 1,
              });
            }
          );
        },
      },
      heatmaps: {
        url: "transmission-lines-distance.tif",
        clamp: false,
        domain: [250, 0],
      }
    },
  },
  {
    id: "facilities",
    type: "points",
    description: "Health Facilities",

    views: {
      polygons: {
        endpoint: 'envelope_facilities',
        symbol: "cross",
      },
      heatmaps: {
        url: "facilities-distance.tif",
        clamp: false,
        domain: [120, 0],
      }
    },
  },
  {
    id: "powerplants",
    type: "points",
    description: "Power Plants",

    views: {
      polygons: {
        endpoint: 'envelope_powerplants',
        symbol: "star",
      },
      heatmaps: {
        url: "powerplants-distance.tif",
        clamp: false,
        domain: [250, 0],
      }
    },
  },
  {
    id: "hydro",
    type: "points",
    description: "Hydro (mini and small)",

    views: {
      polygons: {
        endpoint: 'envelope_hydro',
        symbol: "circle",
      },
      heatmaps: {
        url: "hydro-distance.tif",
        clamp: false,
        domain: [0, 250],
      }
    },
  },
  {
    id: "population",
    type: "raster",
    description: "Population density",
    unit: "people/1km<sup>2</sup>",

    views: {
      heatmaps: {
        url: "population.tif",
        clamp: false,
        domain: [0, 5000],
        weight: 5,
      }
    }
  },
  {
    id: "income",
    description: "Income Indicator",
    type: "raster",
    views: {
      heatmaps: {
        url: "districts.tif",
        scale: 'key',
        clamp: false,
        domain: [0, 100],
        weight: 5,
      }
    },
    options: ['radio', 'livestock', 'mobile', 'ironrooftop'],
  },
  {
    id: "nighttime-lights",
    type: "raster",
    description: "Nighttime Lights",
    unit: "radiance",

    views: {
      heatmaps: {
        url: "nighttime-lights.tif",
        clamp: false,
        domain: [0, 255],
        weight: 5,
      }
    }
  },
];
