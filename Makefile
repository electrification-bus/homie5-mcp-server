NAME := homie-mcp-server
VERSION := $(shell node -p "require('./package.json').version")
DOCKER_IMAGE := $(NAME):$(VERSION)
CONTAINER_RT := $(shell command -v docker 2>/dev/null || command -v podman 2>/dev/null)

.PHONY: help build run mcpb docker docker-push clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Compile TypeScript
	npx tsc

run: build ## Run the server locally (set HOMIE_BROKER_URL, optional HOMIE_SSE_PORT)
	node build/index.js

mcpb: build ## Build .mcpb bundle for Claude Desktop
	mcpb pack . $(NAME)-$(VERSION).mcpb
	@echo "Built $(NAME)-$(VERSION).mcpb"

docker: ## Build container image (docker or podman)
ifeq ($(CONTAINER_RT),)
	$(error Neither docker nor podman found in PATH)
endif
	$(CONTAINER_RT) build -t $(DOCKER_IMAGE) -t $(NAME):latest .

docker-push: docker ## Push container image to Docker Hub (requires DOCKER_USERNAME and DOCKER_PASSWORD)
ifndef DOCKER_USERNAME
	$(error DOCKER_USERNAME is not set)
endif
ifndef DOCKER_PASSWORD
	$(error DOCKER_PASSWORD is not set)
endif
	@echo "$(DOCKER_PASSWORD)" | $(CONTAINER_RT) login -u "$(DOCKER_USERNAME)" --password-stdin docker.io
	$(CONTAINER_RT) tag $(DOCKER_IMAGE) docker.io/$(DOCKER_USERNAME)/$(DOCKER_IMAGE)
	$(CONTAINER_RT) tag $(NAME):latest docker.io/$(DOCKER_USERNAME)/$(NAME):latest
	$(CONTAINER_RT) push docker.io/$(DOCKER_USERNAME)/$(DOCKER_IMAGE)
	$(CONTAINER_RT) push docker.io/$(DOCKER_USERNAME)/$(NAME):latest

clean: ## Remove build artifacts
	rm -rf build/
	rm -f $(NAME)-*.mcpb
