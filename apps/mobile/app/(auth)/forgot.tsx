import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { requestOtp, resetPassword } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { setSession } from '@/state/auth';
import { useAppDispatch } from '@/state/hooks';
import { isLikelyValidPhone, normalizePhoneInput } from '@/utils/phone';

export default function ForgotScreen() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const phoneE164 = normalizePhoneInput(phone);

  const sendOtp = async () => {
    setError(null);
    if (!isLikelyValidPhone(phoneE164)) {
      setError('Enter a valid phone number');
      return;
    }
    setBusy(true);
    try {
      const resp = await requestOtp(phoneE164, 'reset_password');
      setOtpSent(true);
      setDebugCode(resp.debug_code);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setBusy(true);
    try {
      const resp = await resetPassword({
        phone: phoneE164,
        otp,
        new_password: newPassword,
      });
      dispatch(setSession({ token: resp.access_token, user: resp.user }));
      router.replace('/(app)/businesses');
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="headlineMedium" style={styles.title}>
        Reset your password
      </Text>

      <TextInput
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        mode="outlined"
        style={styles.input}
        disabled={otpSent}
      />

      {otpSent ? (
        <>
          <TextInput
            label={debugCode ? `OTP (dev: ${debugCode})` : 'OTP'}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            mode="outlined"
            style={styles.input}
            maxLength={6}
          />
          <TextInput
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            mode="outlined"
            style={styles.input}
          />
        </>
      ) : null}

      <HelperText type="error" visible={!!error}>
        {error ?? ' '}
      </HelperText>

      {!otpSent ? (
        <Button mode="contained" onPress={sendOtp} loading={busy} disabled={busy}>
          Send OTP
        </Button>
      ) : (
        <Button mode="contained" onPress={submit} loading={busy} disabled={busy}>
          Update password
        </Button>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 16 },
  input: { marginBottom: 12 },
});
