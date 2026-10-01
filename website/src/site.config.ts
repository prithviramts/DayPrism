/**
 * Every value that changes the site's behaviour lives here, so nothing is hard-coded twice.
 * Nothing in this file is secret: it all ends up in the public site (the email only in encoded form).
 */
export const siteConfig = {
  name: 'DayPrism',

  /** The public address. Change to 'https://dayprism.app' once the domain is connected. */
  url: 'https://dayprism.pages.dev',

  /**
   * The Google Play listing. Leave empty until the app is live: every "Get it on Google Play"
   * badge then shows its "Coming soon" state. Fill it in and rebuild to switch them all to live.
   */
  PLAY_STORE_URL: '',

  /**
   * Contact address. It is never written into the HTML as plain text: the build encodes it and a
   * small script assembles the mailto: link in the browser, which stops simple scraping bots.
   */
  contactEmail: 'prithviram19@gmail.com',

  /** The founder section. Placeholders until the founder supplies them; never invent facts. */
  founder: {
    name: '[Founder name]',
    role: 'Founder',
    /** Path of a portrait in src/assets (for example 'founder.jpg'), or null for the initial. */
    photo: null as string | null,
  },

  /** Facts about the shipped app, shown on the site. Keep them in step with dayprism-v1/app.json. */
  app: {
    version: '1.6',
    minAndroid: '8.0',
    status: 'in closed testing',
  },

  /** Year in the footer. */
  copyrightYear: 2026,
} as const;

export const isStoreLive = siteConfig.PLAY_STORE_URL.trim() !== '';
