"""Regenerates PRIVACY.md and TERMS.md from src/features/legal.ts (the text the app shows).

Run from the dayprism-beta/ folder:  python scripts/legal-md.py
"""
import re

src = open('src/features/legal.ts', encoding='utf-8').read()
updated = re.search(r"LEGAL_UPDATED = '([^']+)'", src).group(1)
email = re.search(r"SUPPORT_EMAIL = '([^']+)'", src).group(1)
PAIR = re.compile(r"\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*(?:'((?:[^'\\]|\\.)*)'|`([^`]*)`)\s*\]")


def sections(name):
    block = src[src.index(f'export const {name}'):]
    block = block[:block.index('];')]
    for heading, plain, template in PAIR.findall(block):
        body = (plain or template).replace("\\'", "'").replace('${SUPPORT_EMAIL}', email)
        yield heading.replace("\\'", "'"), body


for name, title, path in [('PRIVACY', 'DayPrism privacy policy', 'PRIVACY.md'), ('TERMS', 'DayPrism terms of service', 'TERMS.md')]:
    lines = [
        f'# {title}', '', f'_Last updated: {updated}_', '',
        '> Generated from `src/features/legal.ts`, which is the text the app shows; edit that file and re-run '
        '`python scripts/legal-md.py`. Host this page at a public URL for the Play Store listing, and have a '
        'lawyer review it before publishing.', '',
    ]
    for heading, body in sections(name):
        lines += [f'## {heading}', '', body, '']
    open(path, 'w', encoding='utf-8').write('\n'.join(lines))
    print(path)
