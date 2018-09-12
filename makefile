include default.mk

start:
	@static-server -noauth -port ${WEB_PORT} -dir ./dist &

stop:
	-@lsof -t -i :${WEB_PORT} | xargs -i kill {}

deploy:
	sed -i \
		-e 's%database: "${DB_SERV_DEV}",%database: "${DB_SERV_PROD}",%' \
		-e 's%mapboxstyle: null%mapboxstyle: "light"%' \
		${DIST}/config.js

	@rsync -OPrv \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		./${DIST}/ ${SRV_USER}@${SRV_SERVER}:${SRV_DEST}

	sed -i \
		-e 's%database: "${DB_SERV_PROD}",%database: "${DB_SERV_DEV}",%' \
		-e 's%mapboxstyle: "light"%mapboxstyle: null%' \
		${DIST}/config.js
