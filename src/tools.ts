import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const CONNECT_TOOL: Tool = {
  name: "homie_connect",
  description:
    "Connect to an MQTT broker running Homie 5 devices. If already connected, disconnects first and reconnects to the new broker. Credentials can be included in the URL (e.g. mqtt://user:pass@host:1883).",
  inputSchema: {
    type: "object",
    properties: {
      broker_url: {
        type: "string",
        description:
          "MQTT broker URL (e.g. mqtt://localhost:1883 or mqtt://user:pass@broker:1883)",
      },
    },
    required: ["broker_url"],
  },
};

export const TOOLS: Tool[] = [
  {
    name: "homie_get_devices",
    description:
      "List all discovered Homie 5 devices. Returns device ID, name, type, and state. By default only returns active devices (state ready or sleeping).",
    inputSchema: {
      type: "object",
      properties: {
        include_all: {
          type: "boolean",
          description:
            "If true, also include devices in init, disconnected, and lost states. Default is false.",
        },
      },
    },
  },
  {
    name: "homie_get_device",
    description:
      "Get full details for a single Homie device: state, description, all nodes and properties with their current values.",
    inputSchema: {
      type: "object",
      properties: {
        device_id: {
          type: "string",
          description: "The Homie device ID.",
        },
      },
      required: ["device_id"],
    },
  },
  {
    name: "homie_get_value",
    description:
      "Get the current value of a specific device property, plus its metadata (datatype, unit, format, settable).",
    inputSchema: {
      type: "object",
      properties: {
        device_id: {
          type: "string",
          description: "The Homie device ID.",
        },
        node_id: {
          type: "string",
          description: "The node ID within the device.",
        },
        property_id: {
          type: "string",
          description: "The property ID within the node.",
        },
      },
      required: ["device_id", "node_id", "property_id"],
    },
  },
  {
    name: "homie_set_value",
    description:
      'Send a command to a settable property. The value is validated against the property\'s datatype and format before sending. For booleans use "true"/"false", for enums use one of the allowed values from the format field.',
    inputSchema: {
      type: "object",
      properties: {
        device_id: {
          type: "string",
          description: "The Homie device ID.",
        },
        node_id: {
          type: "string",
          description: "The node ID within the device.",
        },
        property_id: {
          type: "string",
          description: "The property ID within the node.",
        },
        value: {
          type: "string",
          description: "The value to set, as a string.",
        },
      },
      required: ["device_id", "node_id", "property_id", "value"],
    },
  },
  {
    name: "homie_discover",
    description:
      "Force re-discovery of all Homie devices. Clears the device store and resubscribes to discovery topics. Use this if devices seem stale or missing.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];
