import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { signup } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { setSession } from '@/state/auth';
import { useAppDispatch } from '@/state/hooks';
import { isLikelyValidPhone, normalizePhoneInput } from '@/utils/phone';

export default function SignupScreen() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const phoneE164 = normalizePhoneInput(phone);
    if (!isLikelyValidPhone(phoneE164)) {
      setError('Enter a valid phone number');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    setBusy(true);
    try {
      const resp = await signup({
        phone: phoneE164,
        pin,
        name: name.trim() || undefined,
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
        Sign up with your mobile number and a 6-digit PIN. Remember it — there
        is no password reset.
      </Text>

      <TextInput
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        mode="outlined"
        style={styles.input}
      />
      <TextInput
        label="Your name (optional)"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
      />
      <TextInput
        label="6-digit PIN"
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        secureTextEntry={!showPin}
        maxLength={6}
        mode="outlined"
        style={styles.input}
        right={
          <TextInput.Icon
            icon={showPin ? 'eye-off' : 'eye'}
            onPress={() => setShowPin((v) => !v)}
          />
        }
      />
      <TextInput
        label="Confirm PIN"
        value={confirmPin}
        onChangeText={(v) => setConfirmPin(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        secureTextEntry={!showPin}
        maxLength={6}
        mode="outlined"
        style={styles.input}
      />

      <HelperText type="error" visible={!!error}>
        {error ?? ' '}
      </HelperText>

      <Button mode="contained" onPress={submit} loading={busy} disabled={busy}>
        Create account
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 4 },
  subtitle: { opacity: 0.7, marginBottom: 24 },
  input: { marginBottom: 12 },
});
