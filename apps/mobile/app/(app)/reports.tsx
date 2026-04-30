import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Card, Chip, Divider, SegmentedButtons, Text } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import {
  buildExportUrl,
  fetchBookReport,
  fetchBusinessReport,
  listBooks,
} from '@/api/endpoints';
import type { BookWithBalance, ExportFormat, ReportSummary } from '@/api/types';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
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

  const onExport = (fmt: ExportFormat) => {
    if (!businessId || !bookId) {
      Alert.alert('Pick a book', 'Choose a book to export.');
      return;
    }
    const url = buildExportUrl(businessId, bookId, fmt, rangeForKey(range));
    Alert.alert(
      'Export ready',
      `Download URL:\n${url}\n\nThe app will open this in the browser to save the file once linking is wired.`,
    );
  };

  return (
    <>
      <Appbar.Header style={{ backgroundColor: '#16A34A' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Reports" color="#fff" />
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
              <Card mode="elevated" style={styles.card}>
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

              <Card mode="elevated" style={styles.card}>
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

              <Card mode="elevated" style={styles.card}>
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

              <Card mode="elevated" style={styles.card}>
                <Card.Content>
                  <Text variant="titleMedium">Export</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {scope === 'book' && bookId
                      ? 'Download entries from the selected book.'
                      : 'Pick a book to export entries.'}
                  </Text>
                  <View style={styles.exportRow}>
                    <Button
                      mode="outlined"
                      icon="file-delimited"
                      onPress={() => onExport('csv')}
                      disabled={scope !== 'book' || !bookId}
                    >
                      CSV
                    </Button>
                    <Button
                      mode="outlined"
                      icon="microsoft-excel"
                      onPress={() => onExport('xlsx')}
                      disabled={scope !== 'book' || !bookId}
                    >
                      Excel
                    </Button>
                    <Button
                      mode="outlined"
                      icon="file-pdf-box"
                      onPress={() => onExport('pdf')}
                      disabled={scope !== 'book' || !bookId}
                    >
                      PDF
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
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginRight: 4 },
  range: { marginTop: 4 },
  card: {},
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  cell: { flex: 1 },
  in: { color: '#16A34A', fontWeight: '600' },
  out: { color: '#DC2626', fontWeight: '600' },
  net: { fontWeight: '700' },
  divider: { marginVertical: 8 },
  muted: { color: '#64748B', marginTop: 4 },
  error: { color: '#DC2626' },
  exportRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
