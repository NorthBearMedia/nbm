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
import bloglist

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
# The card region is bounded by div depth (see bloglist). Doing this by hand
# with rindex previously walked into the footer and emitted a card outside the
# list container, which broke both the grid and the footer.
bl_path = os.path.join(SRC, 'blog-list.html')
bl = open(bl_path, encoding='utf8').read()
head, cards, tail = bloglist.split_cards(bl)
before = sorted(bloglist.slug_of(c) for c in cards)
cards.sort(key=lambda c: sort_key(bloglist.date_of(c)), reverse=True)
assert sorted(bloglist.slug_of(c) for c in cards) == before, 'lost a card while re-sorting'
bl = bloglist.join_cards(head, cards, tail)
assert bloglist.CARD_START not in tail, 'a card ended up outside the list container'
open(bl_path, 'w', encoding='utf8').write(bl)
print(f'\nblog-list re-sorted ({len(cards)} cards)')
for c in cards:
    print(f'  {bloglist.date_of(c):>18}  {bloglist.slug_of(c)}')

# --- 3. sitemap lastmod, derived from each post's own displayed date ---------
sm_path = os.path.join(SRC, 'sitemap.xml')
sm = open(sm_path, encoding='utf8').read()
for path in sorted(glob.glob(os.path.join(SRC, '*.html'))):
    slug = os.path.basename(path)[:-5]
    if slug == 'blog-list':
        continue
    h = open(path, encoding='utf8').read()
    m = DATE_SPAN.search(h)
    if not m:
        continue
    iso = f'{sort_key(m.group(2)):%Y-%m-%d}'
    sm = re.sub(r'(<loc>https://williscooper\.com/' + re.escape(slug) + r'</loc><lastmod>)[^<]*(</lastmod>)',
                lambda mm: mm.group(1) + iso + mm.group(2), sm)
open(sm_path, 'w', encoding='utf8').write(sm)
print('\nsitemap lastmod synced to the displayed post dates')
