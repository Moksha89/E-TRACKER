import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { requestOtp, signup } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { setSession } from '@/state/auth';
import { useAppDispatch } from '@/state/hooks';
import { isLikelyValidPhone, normalizePhoneInput } from '@/utils/phone';

export default function SignupScreen() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const phoneE164 = normalizePhoneInput(phone);

  const sendOtp = async () => {
    setError(null);
    setInfo(null);
    if (!isLikelyValidPhone(phoneE164)) {
      setError('Enter a valid phone number');
      return;
    }
    setBusy(true);
    try {
      const resp = await requestOtp(phoneE164, 'signup');
      setOtpSent(true);
      setDebugCode(resp.debug_code);
      setInfo(
        resp.delivered
          ? `OTP sent via Telegram. Expires in ${Math.round(resp.expires_in_seconds / 60)} min.`
          : 'OTP generated locally (dev mode).',
      );
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (otp.length < 4) {
      setError('Enter the OTP you received');
      return;
    }
    setBusy(true);
    try {
      const resp = await signup({
        phone: phoneE164,
        password,
        name: name.trim() || undefined,
        otp,
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
        Create your account
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        We'll send a verification code over Telegram.
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
      <TextInput
        label="Your name (optional)"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
      />
      <TextInput
        label="Password (min 6 chars)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        mode="outlined"
        style={styles.input}
      />

      {otpSent ? (
        <TextInput
          label={debugCode ? `OTP (dev: ${debugCode})` : 'OTP'}
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          mode="outlined"
          style={styles.input}
          maxLength={6}
        />
      ) : null}

      <HelperText type="error" visible={!!error}>
        {error ?? ' '}
      </HelperText>
      <HelperText type="info" visible={!!info}>
        {info ?? ' '}
      </HelperText>

      {!otpSent ? (
        <Button mode="contained" onPress={sendOtp} loading={busy} disabled={busy}>
          Send OTP
        </Button>
      ) : (
        <>
          <Button mode="contained" onPress={submit} loading={busy} disabled={busy}>
            Create account
          </Button>
          <Button onPress={sendOtp} disabled={busy} style={styles.resend}>
            Resend OTP
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 4 },
  subtitle: { opacity: 0.7, marginBottom: 24 },
  input: { marginBottom: 12 },
  resend: { marginTop: 8 },
});
