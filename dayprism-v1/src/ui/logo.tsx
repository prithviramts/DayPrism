import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The DayPrism mark: the sun's light falls into a prism and comes out as colours of different
 * lengths, like a small chart. Your ordinary day goes in; what it's really made of comes out. 64-unit grid, same geometry as the icons in
 * assets/ and store/ (drawn by scripts/make-icons.py).
 * `inverse` is the white tile for brand-coloured backgrounds, where the blue tile would disappear.
 */
export const PRISM = {
  /** Triangle: apex, bottom-left, bottom-right. */
  outline: 'M30 19L16.5 47H43.5Z',
  sun: { cx: 12, cy: 20, r: 4.6 },
  sunRays: 'M12 13.2V11.2M5.2 20H3.2M7.2 15.2L5.8 13.8',
  beam: 'M17.2 26.1L23.2 33.2',
  rays: ['M36.1 31.6L54 27.5', 'M37.4 34.4L58 35.5', 'M38.8 37.2L53 44'],
} as const;

const SPECTRUM = { onBlue: ['#ffd166', '#ff9a3c', '#ff6b8b'], onWhite: ['#f2a20c', '#ff7a2f', '#e8505b'] } as const;

export function Logo({ size = 48, inverse = false }: { size?: number; inverse?: boolean }) {
  const tile = inverse ? '#ffffff' : '#2a78d6';
  const mark = inverse ? '#2a78d6' : '#ffffff';
  const colors = inverse ? SPECTRUM.onWhite : SPECTRUM.onBlue;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="DayPrism">
      <Rect width={64} height={64} rx={14} fill={tile} />
      {PRISM.rays.map((d, i) => (
        <Path key={d} d={d} stroke={colors[i]} strokeWidth={3.4} strokeLinecap="round" />
      ))}
      <Circle cx={PRISM.sun.cx} cy={PRISM.sun.cy} r={PRISM.sun.r} fill={mark} />
      <Path d={PRISM.sunRays} stroke={mark} strokeWidth={2.4} strokeLinecap="round" />
      <Path d={PRISM.beam} stroke={mark} strokeWidth={3.4} strokeLinecap="round" />
      <Path d={PRISM.outline} fill={mark} fillOpacity={0.18} stroke={mark} strokeWidth={4.5} strokeLinejoin="round" />
    </Svg>
  );
}
