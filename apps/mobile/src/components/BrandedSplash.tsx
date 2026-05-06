import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { palette } from '@/theme';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LOGO = require('../../assets/icon.png');

export function BrandedSplash({ label }: { label?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.logoWrap, { transform: [{ scale }], opacity }]}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>
      {label ? (
        <Animated.Text style={[styles.label, { opacity }]}>{label}</Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 160, height: 160, borderRadius: 32 },
  label: {
    marginTop: 24,
    fontSize: 14,
    color: palette.textMuted,
    letterSpacing: 0.5,
  },
});
