import { useForm } from '@tanstack/react-form';
import * as React from 'react';
import { Pressable } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as z from 'zod';

import { Button, Checkbox, Input, Text, View } from '@/components/ui';
import { getFieldError } from '@/components/ui/form-utils';
import { translate } from '@/lib/i18n';

const schema = z.object({
  email: z
    .string({ message: 'Email is required' })
    .min(1, 'Email is required')
    .email('Invalid email format'),
  password: z
    .string({ message: 'Password is required' })
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

export type FormType = z.infer<typeof schema>;

export type LoginFormProps = {
  onSubmit?: (data: FormType) => void;
  onRegisterPress?: () => void;
};

export function LoginForm({ onSubmit = () => {}, onRegisterPress }: LoginFormProps) {
  const [remember, setRemember] = React.useState(false);

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },

    validators: {
      onChange: schema as any,
    },
    onSubmit: async ({ value }) => {
      onSubmit(value);
    },
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={10}
    >
      <View className="flex-1 bg-black px-6 pt-32">
        <Text
          testID="login-title"
          tx="login.title"
          className="mb-16 text-center text-[30px]/8 font-bold text-white"
        />

        <form.Field
          name="email"
          children={field => (
            <Input
              testID="email-input"
              label={translate('login.email_label')}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChangeText={field.handleChange}
              error={getFieldError(field)}
              placeholder="***"
              className="bg-[#E4E4E4]/20 text-white"
              style={{ backgroundColor: 'rgba(228, 228, 228, 0.2)' }}
              placeholderTextColor="rgba(255,255,255,0.5)"
            />
          )}
        />

        <form.Field
          name="password"
          children={field => (
            <Input
              testID="password-input"
              label={translate('login.password_label')}
              placeholder="***"
              secureTextEntry={true}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChangeText={field.handleChange}
              error={getFieldError(field)}
              className="bg-[#E4E4E4]/20 text-white"
              style={{ backgroundColor: 'rgba(228, 228, 228, 0.2)' }}
              placeholderTextColor="rgba(255,255,255,0.5)"
            />
          )}
        />

        <View className="mt-2 flex-row items-center justify-between">
          <Checkbox.Root
            checked={remember}
            onChange={setRemember}
            accessibilityLabel="remember"
            className="flex-row items-center"
          >
            <Checkbox.Icon checked={remember} />
            <Text className="pl-2 text-base text-white">
              {translate('login.remember')}
            </Text>
          </Checkbox.Root>
          <Pressable hitSlop={8} onPress={onRegisterPress}>
            <Text className="text-base text-white">
              {translate('login.register')}
            </Text>
          </Pressable>
        </View>

        <View className="flex-1" />

        <form.Subscribe
          selector={state => [state.isSubmitting]}
          children={([isSubmitting]) => (
            <Button
              testID="login-button"
              label={translate('login.submit')}
              onPress={form.handleSubmit}
              loading={isSubmitting}
              className="mb-8 h-[69px] w-full rounded-[34.5px]"
              style={{ backgroundColor: '#FF8F1C' }}
            />
          )}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
