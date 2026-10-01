// Content collections: the site's words live in src/content/ as YAML and Markdown, and these
// schemas check them at build time, so a typo in a content file fails the build instead of
// shipping a broken page.
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { load as parse } from 'js-yaml';

const text = z.string().min(1);
const titled = z.object({ title: text, text });

/** A single YAML document becomes one entry with the given id. */
const single = (id: string) => (raw: string) => [{ id, ...(parse(raw) as object) }];

const home = defineCollection({
  loader: file('src/content/home.yaml', { parser: single('home') }),
  schema: z.object({
    hero: z.object({ headline: text, sub: text, secondary: text }),
    meaning: z.object({ eyebrow: text, headline: text, text, colours: z.array(text).min(3).max(5) }),
    problem: z.object({ headline: text, truths: z.array(titled.extend({ icon: text })).length(3) }),
    how: z.object({ eyebrow: text, headline: text, steps: z.array(titled.extend({ id: z.enum(['log', 'see', 'understand']) })).length(3) }),
    features: z.object({
      eyebrow: text,
      headline: text,
      shipped: z.array(titled.extend({ icon: text })),
      soon: z.array(titled),
    }),
    privacy: z.object({ eyebrow: text, headline: text, points: z.array(titled), link: text }),
    compare: z.object({
      eyebrow: text,
      headline: text,
      columns: z.array(text).length(3),
      note: text,
      rows: z.array(z.object({
        label: text,
        cells: z.array(z.object({ v: z.enum(['yes', 'some', 'no']), t: text })).length(3),
      })),
    }),
    pricing: z.object({
      eyebrow: text,
      headline: text,
      free: z.object({ name: text, text, items: z.array(text) }),
      plus: z.object({ name: text, text }),
      line: text,
    }),
    founder: z.object({ eyebrow: text, quote: text }),
    final: z.object({ headline: text }),
  }),
});

const faq = defineCollection({
  loader: file('src/content/faq.yaml', {
    parser: (raw) => (parse(raw) as object[]).map((item, i) => ({ id: String(i + 1).padStart(2, '0'), ...item })),
  }),
  schema: z.object({ q: text, a: text, link: z.object({ href: text, text }).optional() }),
});

const investors = defineCollection({
  loader: file('src/content/investors.yaml', { parser: single('investors') }),
  schema: z.object({
    intro: z.object({ eyebrow: text, headline: text, sub: text }),
    opportunity: z.object({ headline: text, text }),
    product: z.object({ headline: text, text, shipped: z.array(text), traction: text }),
    different: z.object({ headline: text, points: z.array(titled) }),
    model: z.object({ headline: text, text }),
    roadmap: z.object({ headline: text, phases: z.array(z.object({ name: text, title: text, text })), note: text }),
    founder: z.object({ headline: text, story: text }),
    ask: z.object({ headline: text, text }),
    contact: z.object({ headline: text, text }),
  }),
});

const legal = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/content/legal' }),
  schema: z.object({ title: text, description: text, updated: text, source: z.string().optional() }),
});

export const collections = { home, faq, investors, legal };
