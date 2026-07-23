export type CameraJsonMessage = Record<string, unknown>;

export type CameraBinaryMessage = {
  metadata: CameraJsonMessage;
  binaryData: ArrayBuffer;
};

export type CameraWebSocketMessage = CameraJsonMessage | CameraBinaryMessage;

export function parseCameraWebSocketMessage(
  data: string | ArrayBuffer,
): CameraWebSocketMessage {
  if (typeof data === 'string') {
    return parseJsonObject(data);
  }

  if (data.byteLength < 4) {
    throw new Error('Camera binary message is missing metadata length');
  }

  const view = new DataView(data);
  const metadataLength = view.getUint32(0, false);
  const metadataEnd = metadataLength + 4;

  if (metadataEnd > data.byteLength) {
    throw new Error('Camera binary message has incomplete metadata');
  }

  const metadataBytes = new Uint8Array(data, 4, metadataLength);
  const metadataJson = new TextDecoder().decode(metadataBytes);

  return {
    metadata: parseJsonObject(metadataJson),
    binaryData: data.slice(metadataEnd),
  };
}

export function serializeCameraJsonMessage(message: CameraJsonMessage): string {
  return JSON.stringify(message);
}

function parseJsonObject(value: string): CameraJsonMessage {
  const parsed: unknown = JSON.parse(value);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Camera WebSocket message must be a JSON object');
  }

  return parsed as CameraJsonMessage;
}
