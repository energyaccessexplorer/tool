include default.mk

LIB=./dist/lib
SRC=./src

start:
	@static-server -noauth -port ${WEB_PORT} -dir ./dist &
	@postgrest postgrest.conf &

stop:
	-@lsof -t -i :${WEB_PORT} | xargs -i kill {}
	-@lsof -t -i :${PGREST_PORT} | xargs -i kill {}

build: build-tool build-countries

build-tool:
	@cat ${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/plotty.js \
		${LIB}/mapbox-gl.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/location.js \
		${LIB}/htmlsortable.js > ./dist/tool/libs.js

	@cat ${SRC}/ea.js \
		${SRC}/auxiliary.js \
		${SRC}/client.js \
		${SRC}/svg.js \
		${SRC}/controls.js \
		${SRC}/ui.js \
		${SRC}/layers.js \
		${SRC}/datasets.js \
		${SRC}/mapbox.js > ./dist/tool/main.js

build-countries:
	@cat ${LIB}/d3.js \
		${LIB}/topojson.js \
		${LIB}/flash.js \
		${LIB}/modal.js > ./dist/countries/libs.js

	@cat ${SRC}/svg.js \
		${SRC}/ui.js \
		${SRC}/countries.js > ./dist/countries/main.js

synced:
	@rsync -OPrv \
		--dry-run \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		./${DIST}/ ${SRV_USER}@${SRV_SERVER}:${SRV_DEST}

deploy:
	@sed -i \
		-e 's%database: "${DB_SERV_DEV}",%database: "${DB_SERV_PROD}",%' \
		${DIST}/settings.js

	@rsync -OPrv \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		./${DIST}/ ${SRV_USER}@${SRV_SERVER}:${SRV_DEST}

	@sed -i \
		-e 's%database: "${DB_SERV_PROD}",%database: "${DB_SERV_DEV}",%' \
		${DIST}/settings.js
