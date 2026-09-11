import { showMessage } from 'react-native-flash-message';

type DeepSpaceFeedbackTone = 'danger' | 'success';

type DeepSpaceFeedbackInput = {
  description?: string;
  message: string;
  tone: DeepSpaceFeedbackTone;
};

const FEEDBACK_OPTIONS: Record<DeepSpaceFeedbackTone, { duration: number; icon: DeepSpaceFeedbackTone; type: DeepSpaceFeedbackTone }> = {
  danger: { duration: 3200, icon: 'danger', type: 'danger' },
  success: { duration: 1800, icon: 'success', type: 'success' },
};

export function showDeepSpaceFeedback({ description, message, tone }: DeepSpaceFeedbackInput): void {
  showMessage({
    description,
    message,
    ...FEEDBACK_OPTIONS[tone],
  });
}
