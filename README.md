# Homie MCP Server

An MCP server that lets LLMs interact with [Homie 5](https://homieiot.github.io/) smart home devices over MQTT. It abstracts away MQTT topics and the Homie convention, presenting a clean device-oriented API.

## How it works

1. On startup (or after `homie_connect`), subscribes to `{domain}/5/+/$state` and `{domain}/5/+/$description`
2. When a device's `$description` arrives (retained JSON), parses it and subscribes to `{domain}/5/{deviceId}/+/+` for all property values
3. Property values are cached as they arrive — the cache is always up to date
4. When a device's `$state` is cleared (empty payload), the device is removed from the cache
5. Tool calls read from the cache (instant) or publish set commands to MQTT

## Setup

```bash
npm install
npm run build
```

## Configuration

Configuration is via environment variables. There are two modes:

**Pre-configured mode**: Set `HOMIE_BROKER_URL` and the server connects on startup. The `homie_connect` tool is not exposed.

**Interactive mode**: Omit `HOMIE_BROKER_URL` and the LLM connects via the `homie_connect` tool.

Credentials are included in the broker URL (e.g. `mqtt://user:pass@broker:1883`).

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `HOMIE_BROKER_URL` | MQTT broker URL (e.g. `mqtt://user:pass@host:1883`) | No | — |
| `HOMIE_CLIENT_ID` | MQTT client ID | No | `homie-mcp-{random}` |
| `HOMIE_DOMAIN` | Homie topic domain prefix | No | `homie` |
| `HOMIE_SSE_PORT` | If set, run SSE transport on this port instead of stdio | No | — |

## Usage

### Claude Code (pre-configured)

```bash
claude mcp add homie-mcp -- env HOMIE_BROKER_URL=mqtt://localhost:1883 node /path/to/homie-mcp-server/build/index.js
```

### Claude Code (interactive)

```bash
claude mcp add homie-mcp -- node /path/to/homie-mcp-server/build/index.js
```

The LLM will need to call `homie_connect` before it can interact with devices.

### Standalone (stdio)

```bash
HOMIE_BROKER_URL=mqtt://localhost:1883 node build/index.js
```

### SSE transport

```bash
HOMIE_BROKER_URL=mqtt://localhost:1883 HOMIE_SSE_PORT=3000 node build/index.js
```

Connect to `http://localhost:3000/sse` for the SSE stream, POST to `/messages` for requests.

### Docker

```bash
docker build -t homie-mcp-server .
docker run --init -e HOMIE_BROKER_URL=mqtt://user:pass@broker:1883 homie-mcp-server
```

`HOMIE_BROKER_URL` is required — the container will refuse to start without it.

To use SSE transport:

```bash
docker run --init -e HOMIE_BROKER_URL=mqtt://broker:1883 -e HOMIE_SSE_PORT=3000 -p 3000:3000 homie-mcp-server
```

## Tools

### `homie_connect`

*Only available when `HOMIE_BROKER_URL` is not set.*

Connect to an MQTT broker. If already connected, disconnects first and reconnects to the new broker. Automatically starts device discovery after connecting.

| Param | Type | Required |
|-------|------|----------|
| `broker_url` | string | yes |

Credentials go in the URL: `mqtt://user:pass@host:1883`.

### `homie_get_devices`

List all discovered devices. Returns device ID, name, type, and state.

By default only returns active devices (state `ready` or `sleeping`). Pass `include_all: true` to also include devices in `init`, `disconnected`, and `lost` states.

### `homie_get_device`

Get full details for a single device: state, description, all nodes and properties with their current values.

| Param | Type | Required |
|-------|------|----------|
| `device_id` | string | yes |

### `homie_get_value`

Get the current value of a specific property, plus its metadata (datatype, unit, format, settable).

| Param | Type | Required |
|-------|------|----------|
| `device_id` | string | yes |
| `node_id` | string | yes |
| `property_id` | string | yes |

### `homie_set_value`

Send a command to a settable property. The value is validated against the property's datatype and format before publishing.

| Param | Type | Required |
|-------|------|----------|
| `device_id` | string | yes |
| `node_id` | string | yes |
| `property_id` | string | yes |
| `value` | string | yes |

Validation rules:
- **boolean**: must be `"true"` or `"false"`
- **integer**: must be a whole number, checked against min:max range from format
- **float**: must be a number, checked against min:max range from format
- **enum**: must be one of the comma-separated values in format
- **color**: validated against `rgb` or `hsv` format
- **datetime**: must be valid ISO 8601
- **duration**: must be ISO 8601 duration (e.g. `PT30S`)

The command is published to `{topic}/set` with QoS 0, non-retained, per the Homie spec.

### `homie_discover`

Force re-discovery. Clears the device store, unsubscribes from everything, and resubscribes to discovery topics. Retained messages will repopulate the store. No parameters.
