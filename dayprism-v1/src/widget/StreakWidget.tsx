import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

import { SCHEME } from '../lib/channel';
import type { WidgetSnapshot } from './snapshot';

// The streak widget: a flame and your day streak, warm when today is logged and grey when it
// still needs you, with the last seven days underneath. Tapping it opens a check-in when today
// isn't logged yet (the quickest way to keep the streak), otherwise your week.

const WHITE = '#ffffff';
const SOFT = '#ffffffcc';
const FONT = 'PlusJakartaSans_700Bold';
const FONT_REGULAR = 'PlusJakartaSans_500Medium';

const flame = (fill: string, core: string) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="${fill}" d="M12 1.5c.6 3.2-1 5.3-2.6 7.2C7.8 10.6 6 12.6 6 15.5 6 19.1 8.7 22 12 22s6-2.9 6-6.5c0-2.4-1-4.2-2.2-5.6-.3 1.4-1.1 2.6-2.3 3.1.6-3.7-.3-8.4-1.5-11.5z"/>
  <path fill="${core}" d="M12 22c-1.9 0-3.4-1.6-3.4-3.6 0-1.7 1.1-2.9 2.1-3.9.3 1 .9 1.7 1.7 2 .1-1.3.6-2.6 1.6-3.4.8 1.3 1.4 2.5 1.4 4 0 2.4-1.5 4.9-3.4 4.9z"/>
</svg>`;

export function StreakWidget({ snapshot, width = 160, height = 160 }: { snapshot: WidgetSnapshot | null; width?: number; height?: number }) {
  const s = snapshot && !snapshot.locked ? snapshot.streak : null;
  const lit = !!s?.loggedToday;
  const n = s?.current ?? 0;
  const compact = height < 140 || width < 140;
  const showWeek = !!s && height >= 120 && width >= 130;
  const message = !snapshot ? 'Open DayPrism' : snapshot.locked ? 'Locked'
    : lit ? (n === 1 ? 'Day one. Nice start!' : 'Done for today')
      : n > 0 ? 'Log today to keep it' : 'Log today to start';

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: lit ? `${SCHEME}://week` : `${SCHEME}://quick?action=checkin` }}
      accessibilityLabel={`${n} day streak. ${message}`}
      style={{
        height: 'match_parent', width: 'match_parent', borderRadius: 22, padding: compact ? 8 : 12,
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backgroundGradient: lit
          ? { from: '#ff9a3c', to: '#e8505b', orientation: 'TL_BR' }
          : { from: '#2c3350', to: '#1a1f33', orientation: 'TL_BR' },
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 4 }}>
        <SvgWidget svg={lit ? flame('#fff3c4', '#ffd166') : flame('#5d6688', '#7d87ab')} style={{ height: compact ? 30 : 40, width: compact ? 30 : 40 }} />
        <TextWidget text={String(n)} maxLines={1} style={{ fontSize: compact ? 30 : 40, color: WHITE, fontFamily: FONT }} />
      </FlexWidget>
      <TextWidget text="day streak" maxLines={1} style={{ fontSize: 11, color: SOFT, fontFamily: FONT_REGULAR }} />
      {showWeek ? (
        <FlexWidget style={{ flexDirection: 'row', flexGap: 4, marginTop: 8 }}>
          {s!.week.map((d, i) => (
            <FlexWidget key={i} style={{ flexDirection: 'column', alignItems: 'center', flexGap: 2 }}>
              <FlexWidget style={{
                width: 12, height: 12, borderRadius: 6,
                backgroundColor: d.logged ? (lit ? '#fff3c4' : '#ff9a3c') : '#ffffff33',
              }} />
              <TextWidget text={d.label} style={{ fontSize: 8, color: SOFT, fontFamily: FONT_REGULAR }} />
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : null}
      <TextWidget text={message} maxLines={1} style={{ fontSize: 10, color: WHITE, fontFamily: FONT_REGULAR, marginTop: showWeek ? 6 : 4 }} />
    </FlexWidget>
  );
}
