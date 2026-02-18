FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/build/ build/

ENTRYPOINT ["sh", "-c", "if [ -z \"$HOMIE_BROKER_URL\" ]; then echo 'HOMIE_BROKER_URL is required (e.g. mqtt://user:pass@host:1883)' >&2; exit 1; fi; exec node build/index.js"]
