import {
  parseCameraWebSocketMessage,
  serializeCameraJsonMessage,
} from './websocket-protocol';

function createBinaryMessage(metadata: Record<string, unknown>, binary: number[]) {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const buffer = new ArrayBuffer(4 + metadataBytes.length + binary.length);
  const view = new DataView(buffer);
  view.setUint32(0, metadataBytes.length, false);
  new Uint8Array(buffer, 4, metadataBytes.length).set(metadataBytes);
  new Uint8Array(buffer, 4 + metadataBytes.length).set(binary);
  return buffer;
}

describe('camera websocket protocol', () => {
  it('parses JSON object messages', () => {
    expect(parseCameraWebSocketMessage('{"instruction":"ready"}')).toEqual({
      instruction: 'ready',
    });
  });

  it('serializes JSON control messages', () => {
    expect(serializeCameraJsonMessage({ method: 'ping' })).toBe(
      '{"method":"ping"}',
    );
  });

  it('parses big-endian metadata and preserves binary payload', () => {
    const message = parseCameraWebSocketMessage(
      createBinaryMessage({ device_name: 'Signal', instruction: 'stretch' }, [1, 2, 255]),
    );

    expect(message).toEqual({
      metadata: { device_name: 'Signal', instruction: 'stretch' },
      binaryData: new Uint8Array([1, 2, 255]).buffer,
    });
  });

  it('rejects short binary messages', () => {
    expect(() => parseCameraWebSocketMessage(new ArrayBuffer(3))).toThrow(
      'missing metadata length',
    );
  });

  it('rejects incomplete metadata', () => {
    const buffer = new ArrayBuffer(6);
    new DataView(buffer).setUint32(0, 10, false);

    expect(() => parseCameraWebSocketMessage(buffer)).toThrow(
      'incomplete metadata',
    );
  });

  it('rejects non-object JSON messages', () => {
    expect(() => parseCameraWebSocketMessage('[]')).toThrow(
      'must be a JSON object',
    );
  });
});
