export type DeviceStatus
  = | 'available'
    | 'connecting'
    | 'connected'
    | 'unavailable';

export type SignalStrength = 'strong' | 'medium' | 'weak';

export type Device = {
  id: string;
  name: string;
  status: DeviceStatus;
  signal?: SignalStrength;
};
