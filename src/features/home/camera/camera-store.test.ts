import { useCameraStore } from './camera-store';

describe('camera store', () => {
  beforeEach(() => {
    useCameraStore.setState({
      cameraStatus: 'idle',
      connectionStatus: 'idle',
      exposureConfigs: [
        { id: 2, name: 'Full Moon', exposure_time: 0.003, gain: 1 },
      ],
      currentExposureConfig: {
        id: 2,
        name: 'Full Moon',
        exposure_time: 0.003,
        gain: 1,
      },
      streamingInProgress: false,
      powerLevel: 4,
      inCharge: false,
      usedSpace: null,
      allSpace: null,
      serial: null,
      version: null,
      newestCameraJpgUrl: '',
      newestStreamJpgUrl: '',
      remainingExposureTime: 0,
    });
  });

  it('updates camera status and hardware status', () => {
    useCameraStore.getState().setCameraStatus('in_exposure');
    useCameraStore.getState().setPower(3.85, 1);
    useCameraStore.getState().setDisk(20, 100);

    expect(useCameraStore.getState()).toMatchObject({
      cameraStatus: 'in_exposure',
      powerLevel: 3.85,
      inCharge: true,
      usedSpace: 20,
      allSpace: 100,
    });
  });

  it('adds, updates, selects, and deletes exposure configs', () => {
    useCameraStore.getState().addExposureConfig({
      name: 'Test',
      exposure_time: 1,
      gain: 20,
    });
    const added = useCameraStore.getState().currentExposureConfig;

    expect(added).toMatchObject({ name: 'Test', exposure_time: 1, gain: 20 });
    expect(useCameraStore.getState().exposureConfigs).toContainEqual(added);

    useCameraStore.getState().updateExposureConfig({ ...added, gain: 30 });
    expect(useCameraStore.getState().currentExposureConfig.gain).toBe(30);

    useCameraStore.getState().deleteExposureConfig(added.id);
    expect(useCameraStore.getState().exposureConfigs).not.toContainEqual(
      expect.objectContaining({ id: added.id }),
    );
  });
});
