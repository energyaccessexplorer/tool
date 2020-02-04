# Copy and customise these in a default.mk
#
# WEB_PORT = 4231
#
# SRV_USER = someuser
# SRV_SERVER = example.org
# SRV_DEST = /srv/http/energyaccessexplorer
#
# DB_SERV_DEV = http://api-eneryaccessexplorer.localhost
# DB_SERV_PROD = https://api-energyaccessexplorer.example.org
#
# STATIC_SERVER = python3 -m http.server ${WEB_PORT}
# WATCH = <whatever daemon you use observe code changes>
#
# MAPBOX_DEFAULT_THEME=mapbox/basic-v9
#
include default.mk

DIST = ./dist
SRC = ./src
VIEWS = ./views
CSS = ./stylesheets
LIB = ${DIST}/lib

default: build

build: build-a build-t build-s

deps:
	DEST=${DIST}/lib deps

start:
	cd ${DIST} && ${STATIC_SERVER}

watch:
	@ WATCH_CMD="make build" watch-code ${SRC} ${CSS} ${VIEWS}

stop:
	@stop-port ${WEB_PORT}

build-a:
	@echo "Building a"
	@mkdir -p ${DIST}/a
	@cp ${VIEWS}/a.html ${DIST}/a/index.html
	@cp ${CSS}/ripple.css ${DIST}/a/ripple.css
	@cp ${CSS}/svg.css ${DIST}/a/svg.css

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/location.js \
		${LIB}/htmlsortable.js \
		${LIB}/nanny.js \
		${LIB}/selectlist.js \
		${LIB}/dropdown.js \
		> ${DIST}/a/libs.js

	@echo -n "const ea_settings = " | cat - \
		settings.json \
		${SRC}/shared.js \
		${SRC}/api.js \
		${SRC}/analysis.js \
		${SRC}/a.js \
		${SRC}/overlord.js \
		${SRC}/svg.js \
		${SRC}/controls.js \
		${SRC}/ui.js \
		${SRC}/cards.js \
		${SRC}/indexes.js \
		${SRC}/datasets.js \
		${SRC}/mapbox.js \
		${SRC}/nanny-steps.js \
		${SRC}/report.js \
		${SRC}/summary.js \
		${SRC}/mobile.js \
		> ${DIST}/a/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/a.css \
		${CSS}/layout.css \
		${CSS}/controls.css \
		${CSS}/maparea.css \
		${CSS}/indexes.css \
		${CSS}/views.css \
		${CSS}/ripple.css \
		${CSS}/svg.css \
		${CSS}/summary.css \
		${CSS}/mobile.css \
		${CSS}/cards.css \
		> ${DIST}/a/main.css

	@cp ${SRC}/browser.js ${DIST}/a/

build-t:
	@echo "Building t"
	@mkdir -p ${DIST}/t
	@cp ${VIEWS}/t.html ${DIST}/t/index.html
	@cp ${CSS}/ripple.css ${DIST}/t/ripple.css
	@cp ${CSS}/svg.css ${DIST}/t/svg.css

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/location.js \
		${LIB}/htmlsortable.js \
		${LIB}/nanny.js \
		${LIB}/selectlist.js \
		${LIB}/dropdown.js \
		> ${DIST}/t/libs.js

	@echo -n "const ea_settings = " | cat - \
		settings.json \
		${SRC}/shared.js \
		${SRC}/api.js \
		${SRC}/t.js \
		${SRC}/overlord.js \
		${SRC}/svg.js \
		${SRC}/controls.js \
		${SRC}/ui.js \
		${SRC}/cards.js \
		${SRC}/datasets.js \
		${SRC}/mapbox.js \
		${SRC}/report.js \
		${SRC}/summary.js \
		${SRC}/mobile.js \
		> ${DIST}/t/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/t.css \
		${CSS}/layout.css \
		${CSS}/controls.css \
		${CSS}/maparea.css \
		${CSS}/views.css \
		${CSS}/ripple.css \
		${CSS}/svg.css \
		${CSS}/summary.css \
		${CSS}/mobile.css \
		${CSS}/cards.css \
		${CSS}/filtered.css \
		> ${DIST}/t/main.css

	@cp ${SRC}/browser.js ${DIST}/t/

build-s:
	@echo "Building s"
	@mkdir -p ${DIST}/s
	@cp ${VIEWS}/s.html ${DIST}/s/index.html

	@cat \
		${LIB}/d3.js \
		${LIB}/topojson.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/selectlist.js \
		> ${DIST}/s/libs.js

	@echo -n "const ea_settings = " | cat - \
		settings.json \
		${SRC}/api.js \
		${SRC}/svg.js \
		${SRC}/ui.js \
		${SRC}/s.js \
		> ${DIST}/s/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/s.css \
		${CSS}/maparea.css \
		${CSS}/views.css \
		${CSS}/ripple.css \
		> ${DIST}/s/main.css

	@cp ${SRC}/browser.js ${DIST}/s/

synced:
	@rsync -OPrv \
		--dry-run \
		--info=FLIST0 \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		${DIST}/ ${SRV_USER}@${SRV_SERVER}:${SRV_DEST}

deploy:
	make reconfig env=${env}
	make build

	@rsync -OPrv \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		--exclude=data \
		${DIST}/ ${SRV_USER}@${SRV_SERVER}:${SRV_DEST}

	make reconfig env=development
	make build

reconfig:
ifeq (${env}, production)
	@sed -i \
		-e 's%"database": "${DB_SERV_DEV}",%"database": "${DB_SERV_PROD}",%' \
		-e 's%"mapbox_theme": "",%"mapbox_theme": "${MAPBOX_DEFAULT_THEME}",%' \
		settings.json
else
	@sed -i \
		-e 's%"database": "${DB_SERV_PROD}",%"database": "${DB_SERV_DEV}",%' \
		-e 's%"mapbox_theme": "${MAPBOX_DEFAULT_THEME}",%"mapbox_theme": "",%' \
		settings.json
endif

include extras.mk
