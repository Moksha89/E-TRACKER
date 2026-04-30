import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  HelperText,
  Text,
  TextInput,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { changePin, fetchMe, updateMe } from '@/api/endpoints';
import type { User } from '@/api/types';
import { Screen } from '@/components/Screen';
import { palette } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const user = await fetchMe();
      setMe(user);
      setName(user.name ?? '');
      setEmail(user.email ?? '');
    } catch (e) {
      setProfileError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSaveProfile = async () => {
    setProfileError(null);
    setSavingProfile(true);
    try {
      const updated = await updateMe({
        name: name.trim() || null,
        email: email.trim() || null,
      });
      setMe(updated);
      Alert.alert('Profile saved');
    } catch (e) {
      setProfileError(extractErrorMessage(e));
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePin = async () => {
    setPinError(null);
    if (!/^\d{6}$/.test(currentPin)) {
      setPinError('Enter your current 6-digit PIN.');
      return;
    }
    if (!/^\d{6}$/.test(newPin)) {
      setPinError('New PIN must be exactly 6 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PINs do not match.');
      return;
    }
    setSavingPin(true);
    try {
      await changePin({ current_pin: currentPin, new_pin: newPin });
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      Alert.alert('PIN updated');
    } catch (e) {
      setPinError(extractErrorMessage(e));
    } finally {
      setSavingPin(false);
    }
  };

  if (loading || !me) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  const initial = (me.name ?? me.phone ?? '?').trim().charAt(0).toUpperCase();

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color={palette.white} onPress={() => router.back()} />
        <Appbar.Content color={palette.white} title="Profile" />
      </Appbar.Header>
      <Screen scroll>
        <View style={styles.identityRow}>
          <Avatar.Text size={64} label={initial} style={styles.avatar} color={palette.white} />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text variant="titleLarge">{me.name ?? 'Unnamed'}</Text>
            <Text variant="bodyMedium" style={styles.muted}>
              {me.phone}
            </Text>
            {me.email ? (
              <Text variant="bodySmall" style={styles.muted}>
                {me.email}
              </Text>
            ) : null}
          </View>
        </View>

        <Card mode="outlined" style={styles.card}>
          <Card.Title title="Account details" />
          <Card.Content>
            <TextInput
              label="Name"
              value={name}
              onChangeText={setName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
            <HelperText type="error" visible={!!profileError}>
              {profileError ?? ' '}
            </HelperText>
            <Button
              mode="contained"
              onPress={onSaveProfile}
              loading={savingProfile}
              disabled={savingProfile}
            >
              Save profile
            </Button>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          <Card.Title title="Change PIN" />
          <Card.Content>
            <TextInput
              label="Current PIN"
              value={currentPin}
              onChangeText={(v) => setCurrentPin(v.replace(/\D/g, ''))}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="New PIN"
              value={newPin}
              onChangeText={(v) => setNewPin(v.replace(/\D/g, ''))}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Confirm new PIN"
              value={confirmPin}
              onChangeText={(v) => setConfirmPin(v.replace(/\D/g, ''))}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              mode="outlined"
              style={styles.input}
            />
            <HelperText type="error" visible={!!pinError}>
              {pinError ?? ' '}
            </HelperText>
            <Button
              mode="contained-tonal"
              onPress={onChangePin}
              loading={savingPin}
              disabled={savingPin}
            >
              Update PIN
            </Button>
          </Card.Content>
        </Card>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  identityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: { backgroundColor: palette.black },
  card: { marginBottom: 12, backgroundColor: palette.surface },
  input: { marginBottom: 8 },
  muted: { color: palette.textMuted },
});
