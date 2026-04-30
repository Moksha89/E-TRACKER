import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}

export function Screen({ children, scroll = false, padded = true }: Props) {
  const inner = (
    <View style={[styles.container, padded && styles.padded]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  padded: { padding: 16 },
  scroll: { flexGrow: 1 },
});
