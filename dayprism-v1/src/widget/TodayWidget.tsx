import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { packRows } from '../features/tile-grid';
import { SCHEME } from '../lib/channel';
import type { WidgetSnapshot, WidgetTile } from './snapshot';

// The "Today" home-screen widget: up to four tiles you choose in Settings (the cycle tile takes
// two). Built from widget primitives (not normal React Native views): Android renders it outside
// the app. Brand gradient so it reads well on light and dark wallpapers.
//
// Responsive: launchers size widgets differently (cell sizes vary by phone, grid and font scale),
// so the layout comes from the widget's real size in dp:
//   wide (≥ 250dp)    one row of four slots
//   narrow            two columns, as many rows as fit
//   tall (≥ 150dp)    each tile also shows its sub-label
// Every tile is a shortcut: water adds a glass, energy opens a check-in, and so on.

const WHITE = '#ffffff';
const SOFT = '#ffffffcc';
const FAINT = '#ffffff33';
const DONE = '#7cf0c2';
const OVER = '#ffb4b4';
const FONT = 'PlusJakartaSans_700Bold';
const FONT_REGULAR = 'PlusJakartaSans_500Medium';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Tile({ tile, flex, tall, height }: { tile: WidgetTile; flex: number; tall: boolean; height: number }) {
  const p = tile.progress == null ? null : Math.max(0, Math.min(1, tile.progress));
  const click = tile.action
    ? { clickAction: 'OPEN_URI' as const, clickActionData: { uri: `${SCHEME}://quick?action=${tile.action}` } }
    : { clickAction: 'OPEN_APP' as const };
  return (
    <FlexWidget {...click} accessibilityLabel={`${tile.label} ${tile.value}`}
      style={{ flex, height, flexDirection: 'column', justifyContent: 'center', backgroundColor: '#ffffff1f', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 }}>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextWidget text={tile.label} maxLines={1} style={{ fontSize: 10, color: SOFT, fontFamily: FONT_REGULAR }} />
        {tile.done ? <FlexWidget style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: DONE }} /> : null}
      </FlexWidget>
      <TextWidget text={tile.value} maxLines={1} style={{ fontSize: tall ? 16 : 14, color: tile.over ? OVER : WHITE, fontFamily: FONT }} />
      {tall ? <TextWidget text={tile.sub} maxLines={1} style={{ fontSize: 9, color: SOFT, fontFamily: FONT_REGULAR }} /> : null}
      {p != null ? (
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: 3, marginTop: 4, borderRadius: 2, backgroundColor: FAINT }}>
          {p > 0 ? <FlexWidget style={{ flex: Math.round(p * 100), height: 3, borderRadius: 2, backgroundColor: tile.over ? OVER : WHITE }} /> : null}
          {p < 1 ? <FlexWidget style={{ flex: Math.round((1 - p) * 100), height: 3 }} /> : null}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

export function TodayWidget({ snapshot, width = 320, height = 180 }: { snapshot: WidgetSnapshot | null; width?: number; height?: number }) {
  const s = snapshot;
  const fresh = s?.date === today();
  const pad = height < 120 ? 10 : 12;
  const tall = height >= 150;
  const columns = width >= 250 ? 4 : 2;
  const header = 22;
  const gap = 6;
  const tiles = s && fresh ? s.tiles : [];
  const rows = packRows(tiles, columns);
  const tileH = columns === 4 ? height - pad * 2 - header - gap : tall ? 64 : 50;
  const fit = Math.max(1, Math.floor((height - pad * 2 - header + gap) / (tileH + gap)));

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="DayPrism, today"
      style={{
        height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: pad, borderRadius: 22,
        backgroundGradient: { from: '#2a78d6', to: '#4a3aa7', orientation: 'TL_BR' },
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: header, alignItems: 'center', justifyContent: 'space-between' }}>
        <TextWidget text="DayPrism" maxLines={1} style={{ fontSize: 14, color: WHITE, fontFamily: FONT }} />
        <TextWidget
          text={!s ? 'Open to set up' : s.locked ? 'Locked' : fresh ? 'Today' : 'New day'}
          maxLines={1}
          style={{ fontSize: 11, color: SOFT, fontFamily: FONT_REGULAR }}
        />
      </FlexWidget>

      {!s || s.locked || !fresh || tiles.length === 0 ? (
        <FlexWidget style={{ flex: 1, width: 'match_parent', justifyContent: 'center' }}>
          <TextWidget
            text={!s ? 'Open DayPrism to set up your day.' : s.locked ? 'Your day is private. Tap to unlock.'
              : !fresh ? 'A new day. Tap to start logging.' : 'Choose tiles in DayPrism > Settings > Widget.'}
            maxLines={2}
            style={{ fontSize: 13, color: WHITE, fontFamily: FONT_REGULAR }}
          />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'column', flexGap: gap, marginTop: gap }}>
          {rows.slice(0, fit).map((row, i) => (
            <FlexWidget key={i} style={{ flexDirection: 'row', width: 'match_parent', flexGap: gap }}>
              {row.map((tile) => <Tile key={tile.id} tile={tile} flex={Math.min(tile.span, columns)} tall={tall} height={tileH} />)}
              {/* keep a short last row aligned to the grid */}
              {row.reduce((n, x) => n + Math.min(x.span, columns), 0) < columns
                ? <FlexWidget style={{ flex: columns - row.reduce((n, x) => n + Math.min(x.span, columns), 0), height: tileH }} />
                : null}
            </FlexWidget>
          ))}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
