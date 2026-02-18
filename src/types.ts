export type DeviceState = "init" | "ready" | "sleeping" | "disconnected" | "lost";

export interface PropertyDescription {
  name?: string;
  datatype: string;
  settable?: boolean;
  retained?: boolean;
  unit?: string;
  format?: string;
}

export interface NodeDescription {
  name?: string;
  type?: string;
  properties: Record<string, PropertyDescription>;
}

export interface DeviceDescription {
  name?: string;
  type?: string;
  version?: string;
  homie?: string;
  nodes?: Record<string, NodeDescription>;
  children?: string[];
  root?: string;
  parent?: string;
  extensions?: string[];
}

export interface HomieProperty {
  description: PropertyDescription;
  value: string | null;
}

export interface HomieNode {
  description: NodeDescription;
  properties: Map<string, HomieProperty>;
}

export interface HomieDevice {
  id: string;
  state: DeviceState | null;
  description: DeviceDescription | null;
  nodes: Map<string, HomieNode>;
}
