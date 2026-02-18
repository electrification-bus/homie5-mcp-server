#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import https from "node:https";
import { readFileSync } from "node:fs";
import express from "express";
import selfsigned from "selfsigned";

import { TOOLS, CONNECT_TOOL } from "./tools.js";
import { MqttClientManager } from "./mqtt-client.js";
import { HomieDeviceStore } from "./homie-device-store.js";
import { createHandlers } from "./handlers.js";

const BROKER_URL = process.env.HOMIE_BROKER_URL;
const CLIENT_ID = process.env.HOMIE_CLIENT_ID; // undefined = auto-generated in MqttClientManager
const DOMAIN = process.env.HOMIE_DOMAIN ?? "homie";
const SSE_PORT = process.env.HOMIE_SSE_PORT
  ? parseInt(process.env.HOMIE_SSE_PORT, 10)
  : null;
const TLS_CERT = process.env.HOMIE_TLS_CERT;
const TLS_KEY = process.env.HOMIE_TLS_KEY;

const connectEnabled = !BROKER_URL;

// MQTT + Homie store setup
const mqttClient = new MqttClientManager((topic, payload) => {
  store.handleMessage(topic, payload);
});
const store = new HomieDeviceStore(DOMAIN, mqttClient);
const handleToolCall = createHandlers(store, mqttClient, DOMAIN, CLIENT_ID, connectEnabled);

// Build tool list: include connect tool only when no env var broker is configured
const allTools = connectEnabled ? [CONNECT_TOOL, ...TOOLS] : TOOLS;

// MCP server
const server = new Server(
  { name: "homie-mcp-server", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await handleToolCall(name, (args ?? {}) as Record<string, unknown>);
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  // If broker URL is pre-configured, connect and discover on startup
  if (BROKER_URL) {
    await mqttClient.connect({ brokerUrl: BROKER_URL, clientId: CLIENT_ID });
    await store.startDiscovery();
    console.error("Homie device discovery started.");
  }

  if (SSE_PORT) {
    // SSE transport
    const app = express();
    let sseTransport: SSEServerTransport | null = null;

    app.get("/sse", async (req, res) => {
      sseTransport = new SSEServerTransport("/messages", res);
      await server.connect(sseTransport);
    });

    app.post("/messages", async (req, res) => {
      if (sseTransport) {
        await sseTransport.handlePostMessage(req, res);
      } else {
        res.status(400).json({ error: "No SSE connection established" });
      }
    });

    let tlsOptions: https.ServerOptions;

    if (TLS_CERT && TLS_KEY) {
      tlsOptions = {
        cert: readFileSync(TLS_CERT),
        key: readFileSync(TLS_KEY),
      };
      console.error("Using provided TLS certificates");
    } else if (!TLS_CERT && !TLS_KEY) {
      const attrs = [{ name: "commonName", value: "localhost" }];
      const pems = await selfsigned.generate(attrs, { algorithm: "sha256" });
      tlsOptions = { cert: pems.cert, key: pems.private };
      console.error("Using auto-generated self-signed certificate");
    } else {
      console.error(
        "Error: Both HOMIE_TLS_CERT and HOMIE_TLS_KEY must be set, or neither"
      );
      process.exit(1);
    }

    https.createServer(tlsOptions, app).listen(SSE_PORT, () => {
      console.error(`Homie MCP Server running on HTTPS/SSE port ${SSE_PORT}`);
    });
  } else {
    // Stdio transport (default)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Homie MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
