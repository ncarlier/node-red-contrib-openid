.SILENT :

# App name
APPNAME:=node-red-contrib-openid

## This help screen
help:
	printf "Available targets:\n\n"
	awk '/^[a-zA-Z\-\_0-9]+:/ { \
		helpMessage = match(lastLine, /^## (.*)/); \
		if (helpMessage) { \
			helpCommand = substr($$1, 0, index($$1, ":")); \
			helpMessage = substr(lastLine, RSTART + 3, RLENGTH); \
			printf "%-15s %s\n", helpCommand, helpMessage; \
		} \
	} \
	{ lastLine = $$0 }' $(MAKEFILE_LIST)
.PHONY : help

## Create Docker image
image:
	echo ">> Building Docker image..."
	docker build --rm -t ncarlier/$(APPNAME) .
.PHONY: image

## Deploy Docker compose stack
deploy:
	echo ">> Deploy Docker Compose stack..."
	docker compose up
.PHONY: deploy

## Un-deploy Docker compose stack
undeploy:
	echo ">> Un-deploy Docker Compose stack..."
	docker compose down
.PHONY: undeploy
