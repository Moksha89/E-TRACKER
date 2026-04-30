import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Switch, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';

import { extractErrorMessage } from '@/api/client';
import { fetchBackup, restoreBackup } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { useAppDispatch, useAppSelector } from '@/state/hooks';
import { logout, setActiveBusiness } from '@/state/auth';
import { setBiometricLock } from '@/state/settings';
import { palette } from '@/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
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

  const onRestoreBackup = async () => {
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) {
        setBusy(false);
        return;
      }
      const asset = picked.assets[0];
      const raw = await FileSystem.readAsStringAsync(asset.uri);
      let snapshot: Record<string, unknown>;
      try {
        snapshot = JSON.parse(raw);
      } catch {
        Alert.alert('Restore failed', 'Selected file is not valid JSON.');
        setBusy(false);
        return;
      }
      const created = await restoreBackup({ snapshot });
      dispatch(setActiveBusiness(created.id));
      Alert.alert(
        'Restored',
        `New business "${created.name}" created from backup. Switch to Books to view it.`,
      );
    } catch (e) {
      Alert.alert('Error', extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => router.back()} color={palette.white} />
        <Appbar.Content title={t('settings.title')} color={palette.white} />
      </Appbar.Header>
      <Screen padded={false}>
        <ScrollView contentContainerStyle={styles.container}>
          <Card mode="outlined" style={styles.card}>
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

          <Card mode="outlined" style={styles.card}>
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
                Download backup (JSON)
              </Button>
              <Button
                mode="outlined"
                icon="upload"
                onPress={onRestoreBackup}
                loading={busy}
                disabled={busy}
                style={{ marginTop: 8 }}
              >
                Restore from backup
              </Button>
              <Text variant="bodySmall" style={styles.muted}>
                Restore creates a new business from a JSON snapshot. Existing data is not modified.
              </Text>
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
  header: { backgroundColor: palette.black },
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  card: { backgroundColor: palette.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muted: { color: palette.textMuted, marginTop: 8 },
});
