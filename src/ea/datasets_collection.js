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
        color_scale: 'hot-reverse',
      }
    }
  },
  {
    id: "windspeed",
    type: "raster",
    description: "Windspeed",
    unit: "?",

    views: {
      heatmaps: {
        url: "windspeed.tif",

        clamp: true,
        domain: [0, 10],
        color_scale: 'hot-reverse',
      }
    }
  },
  {
    id: "poverty",
    type: "raster",
    description: "Poverty",
    unit: "< 2USD/day",

    views: {
      heatmaps: {
        url: "poverty.tif",
        clamp: false,
        domain: [0, 1],
        color_scale: 'yignbu-reverse',
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
        domain: [0, 250],
        range: [1, 0],
        color_scale: 'hot-reverse',
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
        symbol: "wye",
      },

      heatmaps: {
        url: "mines-distance.tif",
        clamp: false,
        domain: [0, 250],
        range: [1, 0],
        color_scale: 'hot-reverse',
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
        color_scale: 'jet',
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
        domain: [0, 250],
        range: [1, 0],
        color_scale: 'hot-reverse',
      }
    },
  },
  {
    id: "facilities",
    type: "points",
    description: "Facilities",

    views: {
      polygons: {
        endpoint: 'envelope_facilities',
        symbol: "cross",
      },
      heatmaps: {
        url: "facilities-distance.tif",
        clamp: false,
        domain: [0, 250],
        range: [1, 0],
        color_scale: 'hot-reverse',
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
        domain: [0, 250],
        range: [1, 0],
        color_scale: 'hot-reverse',
      }
    },
  },
  {
    id: "hydro",
    type: "points",
    description: "Hydro",

    views: {
      polygons: {
        endpoint: 'envelope_hydro',
        symbol: "circle",
      },
      heatmaps: {
        url: "hydro-distance.tif",
        clamp: false,
        domain: [0, 250],
        range: [1, 0],
        color_scale: 'hot-reverse',
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
        clamp: true,
        domain: [10, 6000],
        color_scale: 'jet',
        weight: 5,
      }
    }
  },
  {
    id: "livestock",
    type: "raster",
    description: "Livestock",
    unit: "%",

    views: {
      heatmaps: {
        url: "districts.tif",
        parse: ea_datasets_districts_tiff,
         scale: 'livestock',
        clamp: false,
        domain: [0, 100],
        color_scale: 'greys',
        weight: 5,
      }
    }
  },
  {
    id: "mobile",
    type: "raster",
    description: "Mobile phone ownership",
    unit: "%",

    views: {
      heatmaps: {
        url: "districts.tif",
        scale: 'mobile',
        clamp: false,
        domain: [0, 100],
        color_scale: 'greys',
        weight: 5,
      }
    }
  },
  {
    id: "ironrooftop",
    type: "raster",
    description: "Iron Rooftop",
    unit: "%",

    views: {
      heatmaps: {
        url: "districts.tif",
        scale: 'ironrooftop',
        clamp: false,
        domain: [0, 100],
        color_scale: 'greys',
        weight: 5,
      }
    }
  },
  {
    id: "nighttime-lights",
    type: "raster",
    description: "Nighttime Lights",
    unit: "?",

    views: {
      heatmaps: {
        url: "nighttime-lights.tif",
        clamp: true,
        domain: [0, 255],
        color_scale: 'hot-reverse',
        weight: 5,
      }
    }
  },
];
