.PHONY: install dev build test typecheck docker-build up down

install:
	npm install

dev:
	npm run dev

build:
	npm run build

test:
	npm test

typecheck:
	npm run typecheck

docker-build:
	docker build -t mcp-inspector-server:local .

up:
	docker compose up --build

down:
	docker compose down
