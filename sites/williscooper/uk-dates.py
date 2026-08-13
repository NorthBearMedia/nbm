#!/usr/bin/env python3
"""Put every blog date on the site into UK long form, and order the blog list
newest first.

The builder emitted American M/D/YYYY ("8/10/2026"), which a UK reader reads as
the wrong day for any date where both parts are under 13. The events page
already formats with en-GB long form, so the blog now matches it.

Also re-sorts the blog-list cards by date, since the cards were in insertion
order rather than chronological order.
"""
import re, os, glob
from datetime import datetime

SRC = os.path.dirname(os.path.abspath(__file__))
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
          'August', 'September', 'October', 'November', 'December']
US = re.compile(r'^(\d{1,2})/(\d{1,2})/(\d{4})$')
UK = re.compile(r'^(\d{1,2}) (' + '|'.join(MONTHS) + r') (\d{4})$')
DATE_SPAN = re.compile(r'(data-qa="blog-list-item-date">)([^<]*)(</span>)')


def to_uk(s):
    """M/D/YYYY -> '10 August 2026'. Already-UK strings pass through."""
    m = US.match(s.strip())
    if m:
        mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f'{d} {MONTHS[mo - 1]} {y}'
    if UK.match(s.strip()):
        return s.strip()
    raise ValueError(f'unrecognised date: {s!r}')


def sort_key(s):
    d = UK.match(to_uk(s))
    return datetime(int(d.group(3)), MONTHS.index(d.group(2)) + 1, int(d.group(1)))


# --- 1. every article page + the blog list -----------------------------------
changed = []
for path in sorted(glob.glob(os.path.join(SRC, '*.html'))):
    h = open(path, encoding='utf8').read()
    if not DATE_SPAN.search(h):
        continue
    new = DATE_SPAN.sub(lambda m: m.group(1) + to_uk(m.group(2)) + m.group(3), h)
    if new != h:
        open(path, 'w', encoding='utf8').write(new)
        changed.append(os.path.basename(path))
print('dates converted in:', ', '.join(changed) or 'nothing')

# --- 2. reorder the blog-list cards, newest first ----------------------------
bl_path = os.path.join(SRC, 'blog-list.html')
bl = open(bl_path, encoding='utf8').read()
ANCHOR = '<div data-v-4b932081="" class="block-blog-list__list">'
CARD = '<div data-v-b99b1992="" data-v-4b932081="" class="block-blog-list-item"'
head, rest = bl.split(ANCHOR, 1)
chunks = rest.split(CARD)
lead, cards = chunks[0], [CARD + c for c in chunks[1:]]
# the final card carries the markup that closes the list; split it off
tail_at = cards[-1].rindex('</a></div>') + len('</a></div>')
cards[-1], tail = cards[-1][:tail_at], cards[-1][tail_at:]

dated = [(sort_key(DATE_SPAN.search(c).group(2)), c) for c in cards]
order_before = [re.search(r'__content" href="/([a-z0-9-]+)"', c).group(1) for _, c in dated]
dated.sort(key=lambda t: t[0], reverse=True)
order_after = [re.search(r'__content" href="/([a-z0-9-]+)"', c).group(1) for _, c in dated]

open(bl_path, 'w', encoding='utf8').write(
    head + ANCHOR + lead + ''.join(c for _, c in dated) + tail)
print(f'\nblog-list re-sorted ({len(cards)} cards)')
for (d, c), slug in zip(dated, order_after):
    print(f'  {d:%d %B %Y:>18}  {slug}')
assert sorted(order_before) == sorted(order_after), 'lost a card while re-sorting'

# --- 3. sitemap lastmod for the three re-dated posts -------------------------
sm_path = os.path.join(SRC, 'sitemap.xml')
sm = open(sm_path, encoding='utf8').read()
for slug, iso in [('25-years-of-willis-cooper', '2026-03-20'),
                  ('mileage-rate-increase-2026', '2026-08-01'),
                  ('k2-basecamp-trek', '2026-07-10')]:
    sm = re.sub(r'(<loc>https://williscooper\.com/' + re.escape(slug) + r'</loc><lastmod>)[^<]*(</lastmod>)',
                lambda m: m.group(1) + iso + m.group(2), sm)
open(sm_path, 'w', encoding='utf8').write(sm)
print('\nsitemap lastmod updated for the three re-dated posts')
