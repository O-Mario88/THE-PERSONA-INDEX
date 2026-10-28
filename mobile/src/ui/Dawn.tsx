// The sunrise behind the loading and welcome pages (Edwin's design,
// 2026-10-29): misty forested hills, the sun low on the right, a leafy
// branch in front. Drawn for the app by mobile/assets/brand/dawn.html, in
// two shapes: tall for phones, wide for tablets, the Mac and the web. Its own
// cream shows while the picture loads, so nothing flashes.
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native'
import { brand } from '../theme'

const TALL = require('../../assets/brand/dawn-tall.jpg')
const WIDE = require('../../assets/brand/dawn-wide.jpg')
// Narrower than this (width over height), the tall picture fits best.
const TALL_BELOW = 0.75

export function Dawn() {
  const { width, height } = useWindowDimensions()
  const tall = width / Math.max(1, height) < TALL_BELOW
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: brand.dawn }]}>
      <Image source={tall ? TALL : WIDE} resizeMode="cover" style={styles.fill} accessibilityIgnoresInvertColors />
    </View>
  )
}

// A bundled picture brings its own size, so the screen's is given outright.
const styles = StyleSheet.create({ fill: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' } })
