import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  Divider,
  SegmentedButtons,
  Text,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { extractErrorMessage, getApiBaseUrl } from '@/api/client';
import {
  buildExportUrl,
  downloadExport,
  fetchBookReport,
  fetchBusinessReport,
  listBooks,
} from '@/api/endpoints';
import type { BookWithBalance, ExportFormat, ReportSummary } from '@/api/types';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';
import { formatCents } from '@/utils/money';

type RangeKey = 'this_month' | 'last_30' | 'this_year' | 'all_time';

function rangeForKey(key: RangeKey): { from?: string; to?: string } {
  const now = new Date();
  const isoStart = (d: Date) => d.toISOString();
  if (key === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: isoStart(start), to: now.toISOString() };
  }
  if (key === 'last_30') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { from: isoStart(start), to: now.toISOString() };
  }
  if (key === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: isoStart(start), to: now.toISOString() };
  }
  return {};
}

async function blobToBase64(blob: Blob): Promise<string> {
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function blobToText(blob: Blob): Promise<string> {
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(blob);
  });
}

export default function ReportsScreen() {
  const router = useRouter();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const [scope, setScope] = useState<'business' | 'book'>('business');
  const [range, setRange] = useState<RangeKey>('this_month');
  const [books, setBooks] = useState<BookWithBalance[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadBooks = useCallback(async () => {
    if (!businessId) return;
    try {
      const list = await listBooks(businessId);
      setBooks(list);
      if (!bookId && list[0]) setBookId(list[0].id);
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }, [businessId, bookId]);

  const loadReport = useCallback(async () => {
    if (!businessId) return;
    if (scope === 'book' && !bookId) return;
    setLoading(true);
    setError(null);
    try {
      const r = rangeForKey(range);
      const data =
        scope === 'business'
          ? await fetchBusinessReport(businessId, r)
          : await fetchBookReport(businessId, bookId as string, r);
      setReport(data);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [businessId, scope, bookId, range]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  useFocusEffect(
    useCallback(() => {
      loadReport();
    }, [loadReport]),
  );

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const onExport = async (fmt: ExportFormat) => {
    if (!businessId || !bookId) {
      Alert.alert('Pick a book', 'Choose a book to export.');
      return;
    }
    setExporting(true);
    try {
      const { blob, filename } = await downloadExport(businessId, bookId, fmt, rangeForKey(range));
      const base64 = await blobToBase64(blob);
      const target = `${FileSystem.cacheDirectory ?? ''}${filename}`;
      await FileSystem.writeAsStringAsync(target, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const can = await Sharing.isAvailableAsync();
      if (can) {
        await Sharing.shareAsync(target);
      } else {
        Alert.alert(
          'Saved',
          `Export saved at ${target}. Open the URL ${getApiBaseUrl()}${buildExportUrl(
            businessId,
            bookId,
            fmt,
            rangeForKey(range),
          )} in your browser to download instead.`,
        );
      }
    } catch (e) {
      Alert.alert('Export failed', extractErrorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const onCopyCsv = async () => {
    if (!businessId || !bookId) {
      Alert.alert('Pick a book', 'Choose a book to copy.');
      return;
    }
    setExporting(true);
    try {
      const { blob } = await downloadExport(businessId, bookId, 'csv', rangeForKey(range));
      const text = await blobToText(blob);
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied', 'CSV report copied to clipboard.');
    } catch (e) {
      Alert.alert('Copy failed', extractErrorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => router.back()} color={palette.white} />
        <Appbar.Content title="Reports" color={palette.white} />
      </Appbar.Header>
      <Screen padded={false}>
        <ScrollView contentContainerStyle={styles.container}>
          <SegmentedButtons
            value={scope}
            onValueChange={(v) => setScope(v as 'business' | 'book')}
            buttons={[
              { value: 'business', label: 'Business' },
              { value: 'book', label: 'Book' },
            ]}
          />
          {scope === 'book' ? (
            <View style={styles.chips}>
              {books.map((b) => (
                <Chip
                  key={b.id}
                  selected={bookId === b.id}
                  onPress={() => setBookId(b.id)}
                  style={styles.chip}
                >
                  {b.name}
                </Chip>
              ))}
            </View>
          ) : null}
          <SegmentedButtons
            value={range}
            onValueChange={(v) => setRange(v as RangeKey)}
            density="medium"
            style={styles.range}
            buttons={[
              { value: 'this_month', label: 'Month' },
              { value: 'last_30', label: '30d' },
              { value: 'this_year', label: 'Year' },
              { value: 'all_time', label: 'All' },
            ]}
          />
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}
          {loading || !report ? (
            <ActivityIndicator style={{ marginTop: 32 }} />
          ) : (
            <>
              <Card mode="outlined" style={styles.card}>
                <Card.Content>
                  <Text variant="titleMedium">Summary</Text>
                  <View style={styles.row}>
                    <View style={styles.cell}>
                      <Text variant="labelSmall">Cash In</Text>
                      <Text variant="titleMedium" style={styles.in}>
                        {formatCents(report.in_total_cents)}
                      </Text>
                    </View>
                    <View style={styles.cell}>
                      <Text variant="labelSmall">Cash Out</Text>
                      <Text variant="titleMedium" style={styles.out}>
                        {formatCents(report.out_total_cents)}
                      </Text>
                    </View>
                  </View>
                  <Divider style={styles.divider} />
                  <View style={styles.row}>
                    <Text variant="titleSmall">Net</Text>
                    <Text variant="titleMedium" style={styles.net}>
                      {formatCents(report.net_cents)}
                    </Text>
                  </View>
                  <Text variant="bodySmall" style={styles.muted}>
                    {report.entry_count} entries
                  </Text>
                </Card.Content>
              </Card>

              <Card mode="outlined" style={styles.card}>
                <Card.Content>
                  <Text variant="titleMedium">By category</Text>
                  {report.by_category.length === 0 ? (
                    <Text style={styles.muted}>No data</Text>
                  ) : (
                    report.by_category.map((b) => (
                      <View key={b.category_id ?? 'none'} style={styles.row}>
                        <Text style={{ flex: 1 }}>{b.category_name}</Text>
                        <Text style={styles.in}>+ {formatCents(b.in_total_cents)}</Text>
                        <Text style={styles.out}> − {formatCents(b.out_total_cents)}</Text>
                      </View>
                    ))
                  )}
                </Card.Content>
              </Card>

              <Card mode="outlined" style={styles.card}>
                <Card.Content>
                  <Text variant="titleMedium">By payment mode</Text>
                  {report.by_payment_mode.length === 0 ? (
                    <Text style={styles.muted}>No data</Text>
                  ) : (
                    report.by_payment_mode.map((b) => (
                      <View key={b.payment_mode_id ?? 'none'} style={styles.row}>
                        <Text style={{ flex: 1 }}>{b.payment_mode_name}</Text>
                        <Text style={styles.in}>+ {formatCents(b.in_total_cents)}</Text>
                        <Text style={styles.out}> − {formatCents(b.out_total_cents)}</Text>
                      </View>
                    ))
                  )}
                </Card.Content>
              </Card>

              <Card mode="outlined" style={styles.card}>
                <Card.Content>
                  <Text variant="titleMedium">Export</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {scope === 'book' && bookId
                      ? 'Download or share entries from the selected book.'
                      : 'Switch to a single book to enable export.'}
                  </Text>
                  <View style={styles.exportRow}>
                    <Button
                      mode="outlined"
                      icon="file-delimited"
                      onPress={() => onExport('csv')}
                      loading={exporting}
                      disabled={exporting || scope !== 'book' || !bookId}
                    >
                      CSV
                    </Button>
                    <Button
                      mode="outlined"
                      icon="microsoft-excel"
                      onPress={() => onExport('xlsx')}
                      loading={exporting}
                      disabled={exporting || scope !== 'book' || !bookId}
                    >
                      Excel
                    </Button>
                    <Button
                      mode="outlined"
                      icon="file-pdf-box"
                      onPress={() => onExport('pdf')}
                      loading={exporting}
                      disabled={exporting || scope !== 'book' || !bookId}
                    >
                      PDF
                    </Button>
                    <Button
                      mode="contained"
                      icon="content-copy"
                      onPress={onCopyCsv}
                      loading={exporting}
                      disabled={exporting || scope !== 'book' || !bookId}
                    >
                      Copy
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            </>
          )}
        </ScrollView>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginRight: 4 },
  range: { marginTop: 4 },
  card: { backgroundColor: palette.surface },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  cell: { flex: 1 },
  in: { color: palette.cashIn, fontWeight: '600' },
  out: { color: palette.cashOut, fontWeight: '600' },
  net: { fontWeight: '700' },
  divider: { marginVertical: 8 },
  muted: { color: palette.textMuted, marginTop: 4 },
  error: { color: palette.cashOut },
  exportRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
});
