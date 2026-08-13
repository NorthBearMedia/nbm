#!/usr/bin/env python3
"""Safe structural edits to the blog index card list.

The cards live inside `div.block-blog-list__list`, and the markup after that
container (paginator, footer) is full of `</a></div>` sequences. Earlier
versions of the add/sort code located the end of the last card with `rindex`
over everything that followed, which reached into the footer: the list's own
closing tag got swallowed and cards were re-emitted outside the container.
That is what pushed the oldest post out of the grid and wrecked the footer.

So the boundary is found properly here, by counting div depth from the opening
tag of the list until it closes. Everything else builds on that.
"""
import re

ANCHOR = '<div data-v-4b932081="" class="block-blog-list__list">'
CARD_START = '<div data-v-b99b1992="" data-v-4b932081="" class="block-blog-list-item"'
DATE_RE = re.compile(r'data-qa="blog-list-item-date">([^<]*)</span>')
SLUG_RE = re.compile(r'class="block-blog-list-item__content" href="/([a-z0-9-]+)"')

_DIV = re.compile(r'<div\b|</div>')


def _matching_close(html, open_end):
    """Index of the `</div>` that closes the element whose open tag ends at
    `open_end`. Raises if the document is unbalanced rather than guessing."""
    depth = 1
    for m in _DIV.finditer(html, open_end):
        depth += 1 if m.group(0) == '<div' else -1
        if depth == 0:
            return m.start()
    raise ValueError('unbalanced markup: list container never closes')


def split_cards(html):
    """(head, [card, ...], tail). Concatenating them reproduces the input."""
    i = html.index(ANCHOR) + len(ANCHOR)
    close = _matching_close(html, i)
    head, region, tail = html[:i], html[i:close], html[close:]
    chunks = region.split(CARD_START)
    assert not chunks[0].strip(), 'unexpected content before the first card'
    cards = [CARD_START + c for c in chunks[1:]]
    assert ''.join(cards) == region.lstrip() or ''.join(cards) == region, 'card split lost content'
    return head, cards, tail


def join_cards(head, cards, tail):
    return head + ''.join(cards) + tail


def slug_of(card):
    m = SLUG_RE.search(card)
    return m.group(1) if m else None


def date_of(card):
    m = DATE_RE.search(card)
    return m.group(1) if m else None


def remove_pagination(html):
    """Drop the paginator. It was server-rendered by the builder for 8 posts a
    page and is inert in the static build, so page 2 was unreachable."""
    m = re.search(r'<div class="pagination block-blog-list__pagination"[^>]*>', html)
    if not m:
        return html, False
    close = _matching_close(html, m.end())
    return html[:m.start()] + html[close + len('</div>'):], True
