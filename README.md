# Energy Access Explorer Tool

This project houses the source code for the main visualization platform of Energy Access Explorer, providing an interactive interface for exploring energy access data.  A live version can be found at the Energy Access Explorer website.

## Getting Started

These instructions will help you set up the project locally for development and testing.

### Prerequisites

* **Standard Unix-like environment:**  Common Unix utilities (`cat`, `sed`, `rsync`, `bmake`) are required.
* **Energy Access Explorer Infrastructure:** You'll need running instances of the Energy Access Explorer database, API, and website.  See the respective project documentation for setup instructions.
* **Node.js and npm:**  Required for managing JavaScript dependencies.


### Installation

1. **Clone the repository:** Clone this repository to your local machine.

2. **Install dependencies:**  Navigate to the project directory and run:

  ```bash
  npm install
  ```

3. **Environment Configuration**: Copy `.env.example` to `.env` and adjust the values within to match your local setup (database connection, API endpoints, etc.). The `.env.example` file contains descriptions of each variable.

4. **Build the project:**

  ```bash
  make build
  ```

### Running the application

Start the development server:

  ```bash
  make start
  ```

This will typically start the application at http://localhost:8080 (check .env or console output for the exact address).


## Project Structure (High-Level)

- **src**: JavaScript source code for application logic, visualization, and data processing.
- **stylesheets**: CSS files for styling and appearance.
- **views**: HTML templates for the user interface.
- **bin**: Scripts and executable files for development and deployment.

## Key Dependencies

- [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js): Interactive map rendering and geospatial data visualization.
- [geotiff](https://github.com/geotiffjs/geotiff.js): Parsing and processing GeoTIFF raster data.
- [D3js](https://d3js.org): Creating interactive controls and charts.

## Development Workflow

This project uses `bmake` (BSDmake) for build tasks and other development workflows. See the `Makefile` and run `make help` for more details.

## Contributing

Contributions are welcome! See the project wiki for detailed information on contributing, reporting issues, and making suggestions.

## License

This project is licensed under MIT. Additionally, you must read the [attribution page](https://www.energyaccessexplorer.org/attribution) before using any part of this project.
