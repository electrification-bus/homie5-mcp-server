import {
  DeviceState,
  DeviceDescription,
  HomieDevice,
  HomieNode,
  HomieProperty,
  PropertyDescription,
} from "./types.js";
import { MqttClientManager } from "./mqtt-client.js";

export class HomieDeviceStore {
  readonly devices = new Map<string, HomieDevice>();
  private domain: string;
  private mqttClient: MqttClientManager;
  private subscribedDevices = new Set<string>();

  constructor(domain: string, mqttClient: MqttClientManager) {
    this.domain = domain;
    this.mqttClient = mqttClient;
  }

  handleMessage(topic: string, payload: Buffer): void {
    const prefix = `${this.domain}/5/`;
    if (!topic.startsWith(prefix)) return;

    const rest = topic.slice(prefix.length);
    const parts = rest.split("/");
    if (parts.length < 2) return;

    const deviceId = parts[0];

    // $state topic: {domain}/5/{deviceId}/$state
    if (parts.length === 2 && parts[1] === "$state") {
      const state = payload.toString() as DeviceState;
      const device = this.getOrCreateDevice(deviceId);
      device.state = state;
      return;
    }

    // $description topic: {domain}/5/{deviceId}/$description
    if (parts.length === 2 && parts[1] === "$description") {
      const raw = payload.toString();
      if (!raw) return;
      try {
        const desc = JSON.parse(raw) as DeviceDescription;
        const device = this.getOrCreateDevice(deviceId);
        device.description = desc;
        this.buildNodesFromDescription(device, desc);
        this.subscribeToDeviceProperties(deviceId);
      } catch (e) {
        console.error(`Failed to parse $description for ${deviceId}:`, e);
      }
      return;
    }

    // Property value: {domain}/5/{deviceId}/{nodeId}/{propertyId}
    if (parts.length === 3) {
      const [, nodeId, propertyId] = parts;
      // Skip $-prefixed topics that aren't $state/$description
      if (nodeId.startsWith("$") || propertyId.startsWith("$")) return;

      const device = this.getOrCreateDevice(deviceId);
      const node = device.nodes.get(nodeId);
      if (node) {
        const prop = node.properties.get(propertyId);
        if (prop) {
          prop.value = payload.toString();
        }
      }
      return;
    }
  }

  private getOrCreateDevice(deviceId: string): HomieDevice {
    let device = this.devices.get(deviceId);
    if (!device) {
      device = {
        id: deviceId,
        state: null,
        description: null,
        nodes: new Map(),
      };
      this.devices.set(deviceId, device);
    }
    return device;
  }

  private buildNodesFromDescription(
    device: HomieDevice,
    desc: DeviceDescription
  ): void {
    if (!desc.nodes) return;

    for (const [nodeId, nodeDesc] of Object.entries(desc.nodes)) {
      const existingNode = device.nodes.get(nodeId);
      const properties = new Map<string, HomieProperty>();

      if (nodeDesc.properties) {
        for (const [propId, propDesc] of Object.entries(nodeDesc.properties)) {
          // Preserve existing value if we already have one
          const existingValue =
            existingNode?.properties.get(propId)?.value ?? null;
          properties.set(propId, {
            description: propDesc,
            value: existingValue,
          });
        }
      }

      const node: HomieNode = {
        description: nodeDesc,
        properties,
      };
      device.nodes.set(nodeId, node);
    }
  }

  private async subscribeToDeviceProperties(deviceId: string): Promise<void> {
    if (this.subscribedDevices.has(deviceId)) return;
    this.subscribedDevices.add(deviceId);

    const topic = `${this.domain}/5/${deviceId}/+/+`;
    try {
      await this.mqttClient.subscribe(topic);
      console.error(`Subscribed to properties: ${topic}`);
    } catch (e) {
      console.error(`Failed to subscribe to ${topic}:`, e);
      this.subscribedDevices.delete(deviceId);
    }
  }

  async startDiscovery(): Promise<void> {
    // Subscribe to device state and description topics
    const stateTopic = `${this.domain}/5/+/$state`;
    const descTopic = `${this.domain}/5/+/$description`;

    await this.mqttClient.subscribe(stateTopic, 1);
    await this.mqttClient.subscribe(descTopic, 1);
    console.error(
      `Subscribed to discovery topics: ${stateTopic}, ${descTopic}`
    );
  }

  async rediscover(): Promise<void> {
    // Unsubscribe from all property topics
    for (const deviceId of this.subscribedDevices) {
      try {
        await this.mqttClient.unsubscribe(
          `${this.domain}/5/${deviceId}/+/+`
        );
      } catch {
        // ignore unsubscribe errors during cleanup
      }
    }

    // Unsubscribe from discovery topics
    try {
      await this.mqttClient.unsubscribe(`${this.domain}/5/+/$state`);
      await this.mqttClient.unsubscribe(`${this.domain}/5/+/$description`);
    } catch {
      // ignore
    }

    // Clear state
    this.devices.clear();
    this.subscribedDevices.clear();

    // Re-subscribe to discovery topics — retained messages will arrive
    await this.startDiscovery();
  }

  validateValue(propDesc: PropertyDescription, value: string): string | null {
    const { datatype, format } = propDesc;

    switch (datatype) {
      case "boolean":
        if (value !== "true" && value !== "false") {
          return `Boolean property requires "true" or "false", got "${value}"`;
        }
        break;

      case "integer": {
        const n = Number(value);
        if (!Number.isInteger(n)) {
          return `Integer property requires a whole number, got "${value}"`;
        }
        if (format) {
          const match = format.match(/^(-?\d+):(-?\d+)$/);
          if (match) {
            const min = parseInt(match[1], 10);
            const max = parseInt(match[2], 10);
            if (n < min || n > max) {
              return `Integer value ${n} is out of range ${min}:${max}`;
            }
          }
        }
        break;
      }

      case "float": {
        const f = Number(value);
        if (isNaN(f)) {
          return `Float property requires a number, got "${value}"`;
        }
        if (format) {
          const match = format.match(/^(-?[\d.]+):(-?[\d.]+)$/);
          if (match) {
            const min = parseFloat(match[1]);
            const max = parseFloat(match[2]);
            if (f < min || f > max) {
              return `Float value ${f} is out of range ${min}:${max}`;
            }
          }
        }
        break;
      }

      case "enum": {
        if (format) {
          const allowed = format.split(",").map((s) => s.trim());
          if (!allowed.includes(value)) {
            return `Enum value "${value}" is not one of: ${allowed.join(", ")}`;
          }
        }
        break;
      }

      case "color": {
        if (format) {
          if (format === "rgb") {
            if (!/^\d{1,3},\d{1,3},\d{1,3}$/.test(value)) {
              return `Color RGB format requires "r,g,b" (0-255 each), got "${value}"`;
            }
          } else if (format === "hsv") {
            if (!/^\d{1,3},\d{1,3},\d{1,3}$/.test(value)) {
              return `Color HSV format requires "h,s,v", got "${value}"`;
            }
          }
        }
        break;
      }

      case "string":
        // No validation needed for strings
        break;

      case "datetime":
        // ISO 8601 format — basic check
        if (isNaN(Date.parse(value))) {
          return `Datetime property requires ISO 8601 format, got "${value}"`;
        }
        break;

      case "duration":
        // ISO 8601 duration — basic check for PT prefix
        if (!/^P/.test(value)) {
          return `Duration property requires ISO 8601 duration format (e.g. "PT30S"), got "${value}"`;
        }
        break;
    }

    return null; // valid
  }
}
