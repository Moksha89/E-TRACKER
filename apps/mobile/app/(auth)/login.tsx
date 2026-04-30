import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { Link, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { login } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { setSession } from '@/state/auth';
import { useAppDispatch } from '@/state/hooks';
import { palette } from '@/theme';
import { isLikelyValidPhone, normalizePhoneInput } from '@/utils/phone';

export default function LoginScreen() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    const normalized = normalizePhoneInput(phone);
    if (!isLikelyValidPhone(normalized)) {
      setError('Enter a valid phone number');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits');
      return;
    }
    setSubmitting(true);
    try {
      const resp = await login(normalized, pin);
      dispatch(setSession({ token: resp.access_token, user: resp.user }));
      router.replace('/(app)/businesses');
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="headlineMedium" style={styles.title}>
        Welcome back
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Sign in with your mobile number and 6-digit PIN.
      </Text>

      <TextInput
        label="Mobile number"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={phone}
        onChangeText={setPhone}
        style={styles.input}
        mode="outlined"
      />
      <TextInput
        label="6-digit PIN"
        keyboardType="number-pad"
        secureTextEntry={!showPin}
        maxLength={6}
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, ''))}
        right={
          <TextInput.Icon
            icon={showPin ? 'eye-off' : 'eye'}
            onPress={() => setShowPin((v) => !v)}
          />
        }
        style={styles.input}
        mode="outlined"
      />

      <HelperText type="error" visible={!!error}>
        {error ?? ' '}
      </HelperText>

      <Button
        mode="contained"
        onPress={onSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.cta}
      >
        Sign in
      </Button>

      <View style={styles.links}>
        <Link href="/(auth)/signup" style={styles.link}>
          Create an account
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 4 },
  subtitle: { opacity: 0.7, marginBottom: 24 },
  input: { marginBottom: 12 },
  cta: { marginTop: 8, paddingVertical: 6 },
  links: { marginTop: 24, gap: 12, alignItems: 'center' },
  link: { color: palette.black, fontWeight: '600' },
});
