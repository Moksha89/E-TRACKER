import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  HelperText,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import {
  changePassword,
  fetchMe,
  getTwoFactorStatus,
  requestOtp,
  setTwoFactor,
  updateMe,
} from '@/api/endpoints';
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

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdOtp, setPwdOtp] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdNeedsOtp, setPwdNeedsOtp] = useState(false);
  const [pwdOtpSending, setPwdOtpSending] = useState(false);

  const [tfaEnabled, setTfaEnabled] = useState(false);
  const [tfaOtp, setTfaOtp] = useState('');
  const [tfaOtpSent, setTfaOtpSent] = useState(false);
  const [tfaSending, setTfaSending] = useState(false);
  const [tfaSaving, setTfaSaving] = useState(false);
  const [tfaError, setTfaError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [user, status] = await Promise.all([fetchMe(), getTwoFactorStatus()]);
      setMe(user);
      setName(user.name ?? '');
      setEmail(user.email ?? '');
      setTfaEnabled(status.enabled);
    } catch (e) {
      setProfileError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

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

  const onChangePassword = async () => {
    setPwdError(null);
    if (newPwd.length < 6) {
      setPwdError('New password must be at least 6 characters.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('New passwords do not match.');
      return;
    }
    setSavingPwd(true);
    try {
      await changePassword({
        current_password: currentPwd,
        new_password: newPwd,
        otp: pwdNeedsOtp ? pwdOtp.trim() || undefined : undefined,
      });
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setPwdOtp('');
      setPwdNeedsOtp(false);
      Alert.alert('Password updated');
    } catch (e) {
      const msg = extractErrorMessage(e);
      if (msg === 'otp_required') {
        setPwdNeedsOtp(true);
        setPwdError('2FA is on for your account. Tap Send OTP and enter the code.');
      } else {
        setPwdError(msg);
      }
    } finally {
      setSavingPwd(false);
    }
  };

  const onSendPasswordOtp = async () => {
    if (!me) return;
    setPwdOtpSending(true);
    try {
      await requestOtp(me.phone, 'sensitive');
      Alert.alert('OTP sent', 'Check Telegram for the 6-digit code.');
    } catch (e) {
      setPwdError(extractErrorMessage(e));
    } finally {
      setPwdOtpSending(false);
    }
  };

  const onSendTfaOtp = async () => {
    if (!me) return;
    setTfaError(null);
    setTfaSending(true);
    try {
      await requestOtp(me.phone, 'sensitive');
      setTfaOtpSent(true);
      Alert.alert('OTP sent', 'Check Telegram for the 6-digit code.');
    } catch (e) {
      setTfaError(extractErrorMessage(e));
    } finally {
      setTfaSending(false);
    }
  };

  const onConfirmTfa = async (turnOn: boolean) => {
    setTfaError(null);
    if (!tfaOtp.trim()) {
      setTfaError('Enter the OTP first.');
      return;
    }
    setTfaSaving(true);
    try {
      const status = await setTwoFactor(turnOn, tfaOtp.trim());
      setTfaEnabled(status.enabled);
      setTfaOtp('');
      setTfaOtpSent(false);
      Alert.alert(status.enabled ? '2FA enabled' : '2FA disabled');
    } catch (e) {
      setTfaError(extractErrorMessage(e));
    } finally {
      setTfaSaving(false);
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
            <Text variant="bodyMedium" style={styles.muted}>{me.phone}</Text>
            {me.email ? (
              <Text variant="bodySmall" style={styles.muted}>{me.email}</Text>
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
            <HelperText type="error" visible={!!profileError}>{profileError ?? ' '}</HelperText>
            <Button mode="contained" onPress={onSaveProfile} loading={savingProfile} disabled={savingProfile}>
              Save profile
            </Button>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          <Card.Title title="Change password" />
          <Card.Content>
            <TextInput
              label="Current password"
              value={currentPwd}
              onChangeText={setCurrentPwd}
              secureTextEntry
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="New password"
              value={newPwd}
              onChangeText={setNewPwd}
              secureTextEntry
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Confirm new password"
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              secureTextEntry
              mode="outlined"
              style={styles.input}
            />
            {pwdNeedsOtp ? (
              <View style={styles.otpRow}>
                <TextInput
                  label="Telegram OTP"
                  value={pwdOtp}
                  onChangeText={setPwdOtp}
                  mode="outlined"
                  keyboardType="number-pad"
                  style={[styles.input, { flex: 1, marginRight: 8 }]}
                />
                <Button
                  mode="outlined"
                  onPress={onSendPasswordOtp}
                  loading={pwdOtpSending}
                  disabled={pwdOtpSending}
                >
                  Send OTP
                </Button>
              </View>
            ) : null}
            <HelperText type={pwdNeedsOtp ? 'info' : 'error'} visible={!!pwdError}>
              {pwdError ?? ' '}
            </HelperText>
            <Button mode="contained-tonal" onPress={onChangePassword} loading={savingPwd} disabled={savingPwd}>
              Update password
            </Button>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          <Card.Title title="Telegram 2-factor authentication" />
          <Card.Content>
            <View style={styles.tfaRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text variant="bodyMedium">
                  {tfaEnabled
                    ? 'Sensitive actions (delete business, change password) require a Telegram OTP.'
                    : 'Off — sensitive actions only require your password.'}
                </Text>
              </View>
              <Switch
                value={tfaEnabled || tfaOtpSent}
                onValueChange={() => {
                  if (!tfaOtpSent) {
                    onSendTfaOtp();
                  } else {
                    setTfaOtp('');
                    setTfaOtpSent(false);
                  }
                }}
                disabled={tfaSending || tfaSaving}
              />
            </View>
            {tfaOtpSent ? (
              <View>
                <TextInput
                  label="Telegram OTP"
                  value={tfaOtp}
                  onChangeText={setTfaOtp}
                  mode="outlined"
                  keyboardType="number-pad"
                  style={styles.input}
                />
                <View style={styles.tfaButtonsRow}>
                  <Button
                    mode="contained"
                    onPress={() => onConfirmTfa(!tfaEnabled)}
                    loading={tfaSaving}
                    disabled={tfaSaving}
                    style={{ flex: 1, marginRight: 8 }}
                  >
                    {tfaEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={onSendTfaOtp}
                    loading={tfaSending}
                    disabled={tfaSending}
                  >
                    Resend
                  </Button>
                </View>
              </View>
            ) : null}
            <HelperText type="error" visible={!!tfaError}>{tfaError ?? ' '}</HelperText>
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
  otpRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  tfaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tfaButtonsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
});
