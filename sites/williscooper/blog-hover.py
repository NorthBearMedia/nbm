#!/usr/bin/env python3
"""Hover treatment for the blog index cards.

The builder ships the cards with a bare box-shadow transition and nothing else,
so the grid sits inert. This adds a slow push-in on the cover image, a lift and
deepening shadow on the card, and a title colour shift.

Selectors are scoped under the blog block's id (#z2mOt4) because the builder's
own rules are attribute-qualified (`.block-blog-list-item[data-v-b99b1992]`,
specificity 0-2-0) and would otherwise win. The lift carries !important because
the entrance-animation rules also write `transform` on these elements.

Idempotent: re-running replaces the block rather than stacking copies.
"""
import os, re

SRC = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(SRC, 'blog-list.html')
MARK = '/* North Bear: blog card hover */'

CSS = f'''<style>
{MARK}
/* Shape is unconditional; only the motion is preference-gated. */
#z2mOt4 .block-blog-list-item__cover-image-wrapper{{
  overflow:hidden;border-radius:12px;
  box-shadow:0 2px 10px rgba(2,39,51,.09);}}
#z2mOt4 .block-blog-list-item__title{{transition:color .3s ease;}}

@media (hover:hover) and (prefers-reduced-motion:no-preference){{
  #z2mOt4 .block-blog-list-item{{
    transition:transform .45s cubic-bezier(.22,.61,.36,1);}}
  #z2mOt4 .block-blog-list-item__cover-image-wrapper{{
    transition:box-shadow .45s ease;}}
  #z2mOt4 .block-blog-list-item__cover-image{{
    transition:transform .8s cubic-bezier(.22,.61,.36,1);
    will-change:transform;}}

  #z2mOt4 .block-blog-list-item:hover,
  #z2mOt4 .block-blog-list-item:focus-within{{
    transform:translateY(-6px)!important;}}
  #z2mOt4 .block-blog-list-item:hover .block-blog-list-item__cover-image-wrapper,
  #z2mOt4 .block-blog-list-item:focus-within .block-blog-list-item__cover-image-wrapper{{
    box-shadow:0 16px 34px rgba(2,39,51,.20);}}
  #z2mOt4 .block-blog-list-item:hover .block-blog-list-item__cover-image,
  #z2mOt4 .block-blog-list-item:focus-within .block-blog-list-item__cover-image{{
    transform:scale(1.06);}}
  #z2mOt4 .block-blog-list-item:hover .block-blog-list-item__title,
  #z2mOt4 .block-blog-list-item:focus-within .block-blog-list-item__title{{
    color:#1a9b8f;}}
}}
</style>'''

h = open(PAGE, encoding='utf8').read()
h = re.sub(r'<style>\s*' + re.escape(MARK) + r'.*?</style>', '', h, flags=re.S)   # drop a previous copy
assert 'id="z2mOt4" class="block-blog-list"' in h, 'blog block id not found (did the export change?)'
h = h.replace('</head>', CSS + '</head>', 1)
open(PAGE, 'w', encoding='utf8').write(h)
print(f'hover styles applied to {os.path.basename(PAGE)}')
