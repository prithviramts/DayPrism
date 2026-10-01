// App entry: Expo Router, plus the home-screen widget's background handler (Android runs it
// without opening the app, so it has to be registered here rather than inside a screen).
import 'expo-router/entry';

import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './src/widget/task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
