import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, List, Switch, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';

import { extractErrorMessage } from '@/api/client';
import { fetchBackup } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { setAppLocale, type SupportedLocale } from '@/i18n';
import { useAppDispatch, useAppSelector } from '@/state/hooks';
import { logout } from '@/state/auth';
import { setBiometricLock, setLocale } from '@/state/settings';

export default function SettingsScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const locale = useAppSelector((s) => s.settings.locale);
  const biometricLock = useAppSelector((s) => s.settings.biometricLock);
  const [hardware, setHardware] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setHardware(has && enrolled);
    })();
  }, []);

  const onPickLocale = async (next: SupportedLocale) => {
    dispatch(setLocale(next));
    await setAppLocale(next);
  };

  const onToggleBiometric = async (value: boolean) => {
    if (value && hardware === false) {
      Alert.alert('Unavailable', t('settings.biometric_unavailable'));
      return;
    }
    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm to enable lock',
      });
      if (!result.success) return;
    }
    dispatch(setBiometricLock(value));
  };

  const onDownloadBackup = async () => {
    if (!businessId) return;
    setBusy(true);
    try {
      const data = await fetchBackup(businessId);
      const json = JSON.stringify(data, null, 2);
      await Share.share({ message: json });
    } catch (e) {
      Alert.alert('Error', extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Appbar.Header style={{ backgroundColor: '#16A34A' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title={t('settings.title')} color="#fff" />
      </Appbar.Header>
      <Screen padded={false}>
        <ScrollView contentContainerStyle={styles.container}>
          <Card mode="elevated">
            <Card.Content>
              <Text variant="titleMedium">{t('settings.language')}</Text>
              <List.Item
                title={t('settings.english')}
                left={(p) => <List.Icon {...p} icon={locale === 'en' ? 'check' : 'translate'} />}
                onPress={() => onPickLocale('en')}
              />
              <List.Item
                title={t('settings.hindi')}
                left={(p) => <List.Icon {...p} icon={locale === 'hi' ? 'check' : 'translate'} />}
                onPress={() => onPickLocale('hi')}
              />
            </Card.Content>
          </Card>

          <Card mode="elevated">
            <Card.Content>
              <View style={styles.row}>
                <Text variant="titleMedium" style={{ flex: 1 }}>
                  {t('settings.biometric_lock')}
                </Text>
                <Switch value={biometricLock} onValueChange={onToggleBiometric} />
              </View>
              {hardware === false ? (
                <Text variant="bodySmall" style={styles.muted}>
                  {t('settings.biometric_unavailable')}
                </Text>
              ) : null}
            </Card.Content>
          </Card>

          <Card mode="elevated">
            <Card.Content>
              <Text variant="titleMedium">{t('settings.backup')}</Text>
              <Button
                mode="outlined"
                icon="download"
                onPress={onDownloadBackup}
                loading={busy}
                disabled={busy || !businessId}
                style={{ marginTop: 12 }}
              >
                {t('settings.backup')}
              </Button>
            </Card.Content>
          </Card>

          <Button
            mode="contained-tonal"
            icon="logout"
            onPress={() => dispatch(logout())}
            style={{ marginTop: 8 }}
          >
            {t('common.logout')}
          </Button>
        </ScrollView>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muted: { color: '#64748B', marginTop: 8 },
});
