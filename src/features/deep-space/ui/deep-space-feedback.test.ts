import { showMessage } from 'react-native-flash-message';
import { showDeepSpaceFeedback } from './deep-space-feedback';

jest.mock('react-native-flash-message', () => ({
  showMessage: jest.fn(),
}));

describe('showDeepSpaceFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a short success message for a completed sky action', () => {
    showDeepSpaceFeedback({ message: '已回到当前时间', tone: 'success' });

    expect(showMessage).toHaveBeenCalledWith({
      description: undefined,
      duration: 1800,
      icon: 'success',
      message: '已回到当前时间',
      type: 'success',
    });
  });

  it('uses an actionable danger message for unavailable sky features', () => {
    showDeepSpaceFeedback({
      description: '请先连接赤道仪后再试。',
      message: '望远镜未连接',
      tone: 'danger',
    });

    expect(showMessage).toHaveBeenCalledWith({
      description: '请先连接赤道仪后再试。',
      duration: 3200,
      icon: 'danger',
      message: '望远镜未连接',
      type: 'danger',
    });
  });
});
