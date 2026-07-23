import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { useUniwind } from 'uniwind';
import { FocusAwareStatusBar, ScreenHeader, Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { changeWifiPassword } from '../services/settings-service';

/* eslint-disable max-lines-per-function */
export default function WifiPasswordScreen() {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (!newPassword || newPassword.length < 8) {
      Alert.alert(translate('wifi_password.error'), translate('wifi_password.too_short'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(translate('wifi_password.error'), translate('wifi_password.mismatch'));
      return;
    }

    setLoading(true);
    try {
      await changeWifiPassword(newPassword);
      Alert.alert(
        translate('wifi_password.success'),
        translate('wifi_password.success_message'),
        [
          {
            text: 'OK',
            onPress: () => {
              setNewPassword('');
              setConfirmPassword('');
            },
          },
        ],
      );
    }
    catch (err) {
      Alert.alert(translate('wifi_password.error'), String(err));
    }
    finally {
      setLoading(false);
    }
  };

  const rowBg = isDark ? 'bg-[#1A1A1A]' : 'bg-neutral-100';

  return (
    <>
      <FocusAwareStatusBar />
      <View className={`flex-1 ${isDark ? 'bg-black' : 'bg-white'}`}>
        <ScreenHeader title={translate('wifi_password.title')} />

        <View className="flex-1 gap-6 px-5 pt-6">
          <Text className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            {translate('wifi_password.hint')}
          </Text>

          <View>
            <Text className={`mb-1.5 text-sm font-medium ${isDark ? 'text-white' : 'text-black'}`}>
              {translate('wifi_password.new_password')}
            </Text>
            <View className={`flex-row items-center gap-3 rounded-xl px-4 py-3 ${rowBg}`}>
              <Text className={isDark ? 'text-white' : 'text-black'}>🔒</Text>
              <Pressable
                className="flex-1"
                onPress={() =>
                  Alert.alert(
                    translate('wifi_password.not_supported'),
                    translate('wifi_password.input_hint'),
                  )}
              >
                <Text className={`text-[16px] ${isDark ? 'text-white' : 'text-black'}`}>
                  ••••••••
                </Text>
              </Pressable>
            </View>
          </View>

          <View>
            <Text className={`mb-1.5 text-sm font-medium ${isDark ? 'text-white' : 'text-black'}`}>
              {translate('wifi_password.confirm_password')}
            </Text>
            <View className={`flex-row items-center gap-3 rounded-xl px-4 py-3 ${rowBg}`}>
              <Text className={isDark ? 'text-white' : 'text-black'}>🔒</Text>
              <Pressable
                className="flex-1"
                onPress={() =>
                  Alert.alert(
                    translate('wifi_password.not_supported'),
                    translate('wifi_password.input_hint'),
                  )}
              >
                <Text className={`text-[16px] ${isDark ? 'text-white' : 'text-black'}`}>
                  ••••••••
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleChange}
            disabled={loading}
            className={`mt-2 flex-row items-center justify-center rounded-2xl py-4 ${
              loading ? 'bg-orange-300' : 'bg-orange-500'
            }`}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text className="text-[16px] font-semibold text-white">{translate('wifi_password.change')}</Text>}
          </Pressable>
        </View>
      </View>
    </>
  );
}
