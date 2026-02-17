import { HomieDeviceStore } from "./homie-device-store.js";
import { MqttClientManager } from "./mqtt-client.js";
import { DeviceState } from "./types.js";

const ACTIVE_STATES: DeviceState[] = ["ready", "sleeping"];

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function createHandlers(
  store: HomieDeviceStore,
  mqttClient: MqttClientManager,
  domain: string
) {
  return async function handleToolCall(
    name: string,
    args: Record<string, unknown>
  ) {
    switch (name) {
      case "homie_get_devices": {
        const includeAll = (args.include_all as boolean) ?? false;

        const result = [];
        for (const device of store.devices.values()) {
          if (
            !includeAll &&
            device.state &&
            !ACTIVE_STATES.includes(device.state)
          ) {
            continue;
          }
          result.push({
            id: device.id,
            name: device.description?.name ?? null,
            type: device.description?.type ?? null,
            state: device.state,
          });
        }

        return ok(JSON.stringify(result, null, 2));
      }

      case "homie_get_device": {
        const deviceId = args.device_id as string;
        const device = store.devices.get(deviceId);
        if (!device) {
          return err(`Device "${deviceId}" not found.`);
        }

        const nodes: Record<string, unknown> = {};
        for (const [nodeId, node] of device.nodes) {
          const properties: Record<string, unknown> = {};
          for (const [propId, prop] of node.properties) {
            properties[propId] = {
              ...prop.description,
              value: prop.value,
            };
          }
          nodes[nodeId] = {
            name: node.description.name ?? null,
            type: node.description.type ?? null,
            properties,
          };
        }

        const result = {
          id: device.id,
          state: device.state,
          name: device.description?.name ?? null,
          type: device.description?.type ?? null,
          nodes,
        };

        return ok(JSON.stringify(result, null, 2));
      }

      case "homie_get_value": {
        const deviceId = args.device_id as string;
        const nodeId = args.node_id as string;
        const propertyId = args.property_id as string;

        const device = store.devices.get(deviceId);
        if (!device) return err(`Device "${deviceId}" not found.`);

        const node = device.nodes.get(nodeId);
        if (!node)
          return err(`Node "${nodeId}" not found on device "${deviceId}".`);

        const prop = node.properties.get(propertyId);
        if (!prop)
          return err(
            `Property "${propertyId}" not found on node "${nodeId}" of device "${deviceId}".`
          );

        const result = {
          device_id: deviceId,
          node_id: nodeId,
          property_id: propertyId,
          value: prop.value,
          ...prop.description,
        };

        return ok(JSON.stringify(result, null, 2));
      }

      case "homie_set_value": {
        const deviceId = args.device_id as string;
        const nodeId = args.node_id as string;
        const propertyId = args.property_id as string;
        const value = args.value as string;

        const device = store.devices.get(deviceId);
        if (!device) return err(`Device "${deviceId}" not found.`);

        if (
          device.state !== "ready" &&
          device.state !== "sleeping"
        ) {
          return err(
            `Device "${deviceId}" is in state "${device.state}" and cannot accept commands. Device must be "ready" or "sleeping".`
          );
        }

        const node = device.nodes.get(nodeId);
        if (!node)
          return err(`Node "${nodeId}" not found on device "${deviceId}".`);

        const prop = node.properties.get(propertyId);
        if (!prop)
          return err(
            `Property "${propertyId}" not found on node "${nodeId}" of device "${deviceId}".`
          );

        if (!prop.description.settable) {
          return err(
            `Property "${propertyId}" on "${deviceId}/${nodeId}" is not settable.`
          );
        }

        const validationError = store.validateValue(prop.description, value);
        if (validationError) {
          return err(validationError);
        }

        const topic = `${domain}/5/${deviceId}/${nodeId}/${propertyId}/set`;
        try {
          // Homie spec: set commands are QoS 0, non-retained
          await mqttClient.publish(topic, value, 0, false);
          return ok(
            `Sent "${value}" to ${deviceId}/${nodeId}/${propertyId}`
          );
        } catch (e) {
          return err(
            `Failed to publish to ${topic}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      case "homie_discover": {
        try {
          await store.rediscover();
          // Give retained messages a moment to arrive
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const count = store.devices.size;
          return ok(
            `Re-discovery complete. Found ${count} device${count !== 1 ? "s" : ""}.`
          );
        } catch (e) {
          return err(
            `Re-discovery failed: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  };
}
