import * as mqtt from "mqtt";

export type MessageHandler = (topic: string, payload: Buffer) => void;

export interface MqttConnectionOptions {
  brokerUrl: string;
  clientId?: string;
  username?: string;
  password?: string;
}

export class MqttClientManager {
  private client: mqtt.MqttClient | null = null;
  private messageHandler: MessageHandler;

  constructor(messageHandler: MessageHandler) {
    this.messageHandler = messageHandler;
  }

  async connect(options: MqttConnectionOptions): Promise<void> {
    if (this.client?.connected) {
      return;
    }

    const mqttOptions: mqtt.IClientOptions = {
      clientId: options.clientId ?? "homie-mcp-server",
    };
    if (options.username) mqttOptions.username = options.username;
    if (options.password) mqttOptions.password = options.password;

    this.client = mqtt.connect(options.brokerUrl, mqttOptions);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("MQTT connection timeout after 10 seconds"));
      }, 10000);

      this.client!.on("connect", () => {
        clearTimeout(timeout);
        console.error(`Connected to MQTT broker at ${options.brokerUrl}`);
        resolve();
      });

      this.client!.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.client!.on("message", (topic, payload) => {
        this.messageHandler(topic, payload);
      });
    });
  }

  async subscribe(topic: string, qos: 0 | 1 | 2 = 0): Promise<void> {
    if (!this.client?.connected) {
      throw new Error("Not connected to MQTT broker");
    }
    return new Promise((resolve, reject) => {
      this.client!.subscribe(topic, { qos }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async unsubscribe(topic: string): Promise<void> {
    if (!this.client?.connected) {
      throw new Error("Not connected to MQTT broker");
    }
    return new Promise((resolve, reject) => {
      this.client!.unsubscribe(topic, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async publish(
    topic: string,
    message: string,
    qos: 0 | 1 | 2 = 0,
    retain: boolean = false
  ): Promise<void> {
    if (!this.client?.connected) {
      throw new Error("Not connected to MQTT broker");
    }
    return new Promise((resolve, reject) => {
      this.client!.publish(topic, message, { qos, retain }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    return new Promise((resolve) => {
      this.client!.end(false, {}, () => {
        this.client = null;
        resolve();
      });
    });
  }
}
