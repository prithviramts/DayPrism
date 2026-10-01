import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { StreakWidget } from './StreakWidget';
import { TodayWidget } from './TodayWidget';
import { loadWidgetSnapshot } from './snapshot';

export const TODAY_WIDGET = 'Today';
export const STREAK_WIDGET = 'Streak';

/** Called by Android when a widget is added, refreshed (every 30 min) or resized. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetName, width, height } = props.widgetInfo;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = await loadWidgetSnapshot();
      if (widgetName === TODAY_WIDGET) props.renderWidget(<TodayWidget snapshot={snapshot} width={width} height={height} />);
      else if (widgetName === STREAK_WIDGET) props.renderWidget(<StreakWidget snapshot={snapshot} width={width} height={height} />);
      break;
    }
    default:
      break;
  }
}

/** Redraws every DayPrism widget on the home screen (called by the app after data changes). */
export async function refreshWidgets(): Promise<void> {
  const snapshot = await loadWidgetSnapshot();
  await requestWidgetUpdate({
    widgetName: TODAY_WIDGET,
    renderWidget: (info) => <TodayWidget snapshot={snapshot} width={info.width} height={info.height} />,
  }).catch(() => {});
  await requestWidgetUpdate({
    widgetName: STREAK_WIDGET,
    renderWidget: (info) => <StreakWidget snapshot={snapshot} width={info.width} height={info.height} />,
  }).catch(() => {});
}
