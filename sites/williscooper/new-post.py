#!/usr/bin/env python3
"""Add a blog post to the Willis Cooper static site.

Clones an existing post as the template (so the builder markup, header block
and meta layout stay byte-identical to the rest of the blog), swaps every
title/description/date/image field, drops in the article body, then registers
the post in blog-list.html, sitemap.xml and llms.txt.

Idempotent: re-running replaces an existing post of the same slug rather than
duplicating its blog-list card or sitemap entry.
"""
import re, sys, os
import bloglist

SRC = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = 'summer-vat-reduction-2026.html'
BASE = 'https://williscooper.com'
AUTHOR = 'Willis Cooper Chartered Accountants'


# Shared article-body typography. The builder styles <p class="body"> but leaves
# headings, lists, quotes and figures unstyled, and the posts rely on all four.
POST_CSS = """
/* North Bear: article body typography. The builder's text box styles paragraphs
   but leaves headings, lists, pull quotes and figures unstyled. */
.wc-post h2{margin:34px 0 12px;font-family:'Montserrat',system-ui,sans-serif;font-size:clamp(21px,2.2vw,27px);line-height:1.3;font-weight:700;color:#022733;}
.wc-post h3{margin:26px 0 10px;font-family:'Montserrat',system-ui,sans-serif;font-size:clamp(17px,1.7vw,20px);line-height:1.35;font-weight:700;color:#1a9b8f;}
.wc-post ul,.wc-post ol{margin:0 0 18px;padding-left:24px;}
.wc-post li{margin:0 0 8px;font-size:16px;line-height:1.75;color:#4b5563;}
.wc-post ul{list-style:disc;}
.wc-post ol{list-style:decimal;}
.wc-post ol li{margin-bottom:14px;}
.wc-post blockquote{margin:30px 0;padding:4px 0 4px 22px;border-left:4px solid #1a9b8f;}
.wc-post blockquote p{margin:0;font-family:'Montserrat',system-ui,sans-serif;font-size:clamp(18px,1.9vw,22px);line-height:1.5;font-weight:600;color:#022733;}
.wc-post figure{margin:28px 0;}
.wc-post figure img{width:100%;height:auto;display:block;border-radius:10px;}
.wc-post figcaption{margin:9px 2px 0;font-size:14px;line-height:1.5;color:#6b7280;font-style:italic;}
.wc-post .wc-post-standfirst{font-size:18px;line-height:1.7;color:#374151;}
.wc-post .wc-post-cta{margin:30px 0 0;padding:22px 24px;background:#f6f8f9;border-left:4px solid #1a9b8f;border-radius:0 10px 10px 0;}
.wc-post .wc-post-cta p{margin:0 0 10px;}
.wc-post .wc-post-cta p:last-child{margin:0;}
"""


def _sub1(html, pattern, repl, label):
    """Substitute and fail loudly if the pattern stopped matching."""
    out, n = re.subn(pattern, lambda m: repl, html, flags=re.S)
    if n == 0:
        raise SystemExit(f'FATAL: no match for {label}')
    return out


def word_count(body_html):
    t = re.sub(r'<[^>]+>', ' ', body_html)
    return len(t.split())


def build(post):
    slug, title, seo_title = post['slug'], post['title'], post['seo_title']
    desc, date, body = post['description'], post['date'], post['body']
    img, alt = post['image'], post['image_alt']
    url = f'{BASE}/{slug}'
    img_url = f'{BASE}/assets/images/{img}'
    read = post.get('read') or max(1, round(word_count(body) / 240))
    iso = post['iso']

    h = open(os.path.join(SRC, TEMPLATE), encoding='utf8').read()

    # --- head: structured data ---------------------------------------------
    ld = re.search(r'<script type="application/ld\+json">\{"@context.*?\}</script>', h, re.S).group(0)
    new_ld = ld
    new_ld = re.sub(r'"name": "[^"]*"', f'"name": "{title}"', new_ld, count=1)
    new_ld = re.sub(r'"url": "[^"]*"', f'"url": "{url}"', new_ld, count=1)
    new_ld = re.sub(r'"description": "[^"]*"', f'"description": "{desc}"', new_ld, count=1)
    new_ld = re.sub(r'"image": "[^"]*"', f'"image": "{img_url}"', new_ld, count=1)
    new_ld = re.sub(r'"datePublished": "[^"]*"', f'"datePublished": "{iso}"', new_ld, count=1)
    new_ld = re.sub(r'"dateModified": "[^"]*"', f'"dateModified": "{iso}"', new_ld, count=1)
    new_ld = re.sub(r'"timeRequired": "[^"]*"', f'"timeRequired": "PT{read}M"', new_ld, count=1)
    h = h.replace(ld, new_ld, 1)

    # --- head: canonical / og / twitter -------------------------------------
    h = h.replace(f'{BASE}/summer-vat-reduction-2026', url)
    h = _sub1(h, r'<title>.*?</title>', f'<title>{seo_title}</title>', 'title')
    # every description field, meta + og + twitter (the template shipped with a
    # stale og:description inherited from ITS template, so replace all of them)
    h = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + desc + m.group(2), h)
    h = re.sub(r'(<meta property="og:description" content=")[^"]*(")', lambda m: m.group(1) + desc + m.group(2), h)
    h = re.sub(r'(<meta name="twitter:description" content=")[^"]*(")', lambda m: m.group(1) + desc + m.group(2), h)
    h = re.sub(r'(<meta content=")[^"]*(" property="og:title">)', lambda m: m.group(1) + seo_title + m.group(2), h)
    h = re.sub(r'(<meta name="twitter:title" content=")[^"]*(")', lambda m: m.group(1) + seo_title + m.group(2), h)
    h = h.replace(f'{BASE}/assets/images/summer-vat-family-day-out.jpg', img_url)
    h = h.replace('A family walking into a theme park', alt)

    # --- shared article CSS --------------------------------------------------
    h = _sub1(h, r'\n/\* North Bear: article body typography.*?\n</style>', POST_CSS + '</style>', 'post css')

    # --- header block --------------------------------------------------------
    h = re.sub(r'(<h1 class="font-primary block-blog-header__title"[^>]*>).*?(</h1>)',
               lambda m: m.group(1) + title + m.group(2), h, count=1, flags=re.S)
    h = re.sub(r'(<p class="font-secondary block-blog-header__description"[^>]*>).*?(</p>)',
               lambda m: m.group(1) + desc + m.group(2), h, count=1, flags=re.S)
    h = re.sub(r'(data-qa="blog-list-item-date">)[^<]*(</span>)',
               lambda m: m.group(1) + date + m.group(2), h, count=1)
    h = re.sub(r'(data-qa="blog-list-item-date">[^<]*</span><span data-v-7baf6691="">)[^<]*(</span>)',
               lambda m: m.group(1) + f'{read} min read' + m.group(2), h, count=1)

    # --- article body --------------------------------------------------------
    h = re.sub(r'(<div class="wc-post text-box[^>]*data-qa="gridtextbox:zwbzb2">).*?(</div><!---->)',
               lambda m: m.group(1) + body + m.group(2), h, count=1, flags=re.S)

    open(os.path.join(SRC, f'{slug}.html'), 'w', encoding='utf8').write(h)
    return read, word_count(body)


def register(post, read):
    """Blog-list card + sitemap + llms.txt. Newest card goes to the top."""
    slug, title, desc = post['slug'], post['title'], post['description']
    img, alt, date = post['image'], post['image_alt'], post['date']

    bl_path = os.path.join(SRC, 'blog-list.html')
    bl = open(bl_path, encoding='utf8').read()
    if f'href="/{slug}"' in bl:
        # Replace rather than duplicate on a re-run. bloglist bounds the card
        # region by div depth, so this cannot reach past the list container.
        head, cards, tail = bloglist.split_cards(bl)
        kept = [c for c in cards if bloglist.slug_of(c) != slug]
        assert len(kept) == len(cards) - 1, f'expected to drop exactly one card for {slug}'
        bl = bloglist.join_cards(head, kept, tail)
    card = (
        '<div data-v-b99b1992="" data-v-4b932081="" class="block-blog-list-item" data-animation-role="block-element"'
        ' data-qa="blog-list-item" data-animation-state="active" style="--v525116cd: 24px;">'
        f'<a data-v-b99b1992="" href="/{slug}" class="block-blog-list-item__cover-image-container"'
        ' data-qa="blog-list-item-image"><div data-v-b99b1992="" class="block-blog-list-item__cover-image-wrapper">'
        f'<img data-v-b99b1992="" class="block-blog-list-item__cover-image" alt="{alt}"'
        ' sizes="(min-width: 920px) 1800px, calc((100vw - 0px - 20px) / 1)"'
        f' src="assets/images/{img}" srcset="assets/images/{img[:-4]}-w480.jpg 480w,'
        f' assets/images/{img[:-4]}-w800.jpg 800w, assets/images/{img} 1080w"></div></a>'
        '<p data-v-aefb04f0="" data-v-b99b1992="" class="categories font-secondary" style="display: none;"></p>'
        f'<a data-v-b99b1992="" class="block-blog-list-item__content" href="/{slug}"'
        ' data-qa="block-blog-list-item-content">'
        f'<h3 data-v-b99b1992="" class="font-primary block-blog-list-item__title">{title}</h3>'
        f'<p data-v-b99b1992="" class="block-blog-list-item__description font-secondary">{desc}</p>'
        '<div data-v-7baf6691="" data-v-b99b1992="" class="blog-list-item-meta"><div data-v-7baf6691=""'
        ' class="font-secondary"><p data-v-7baf6691="" class="blog-list-item-meta__author-name"'
        f' data-qa="blog-author">{AUTHOR}</p><p data-v-7baf6691="" class="blog-list-item-meta__subtitle">'
        f'<span data-v-7baf6691="" data-qa="blog-list-item-date">{date}</span>'
        f'<span data-v-7baf6691="">{read} min read</span></p></div></div></a></div>'
    )
    bl = bl.replace(bloglist.ANCHOR, bloglist.ANCHOR + card, 1)
    open(bl_path, 'w', encoding='utf8').write(bl)

    sm_path = os.path.join(SRC, 'sitemap.xml')
    sm = open(sm_path, encoding='utf8').read()
    if f'<loc>{BASE}/{slug}</loc>' not in sm:
        entry = (f'<url><loc>{BASE}/{slug}</loc><lastmod>{post["iso"][:10]}</lastmod>'
                 '<changefreq>monthly</changefreq><priority>0.6</priority></url>')
        sm = sm.replace('</urlset>', entry + '</urlset>')
        open(sm_path, 'w', encoding='utf8').write(sm)

    for name in ('llms.txt',):
        p = os.path.join(SRC, name)
        if not os.path.exists(p):
            continue
        txt = open(p, encoding='utf8').read()
        if slug in txt:
            continue
        line = f'- [{title}]({BASE}/{slug}): {desc}\n'
        m = re.search(r'\n(- \[[^\]]*\]\(https://williscooper\.com/(?:summer-vat|bank-imperson)[^\n]*\n)', txt)
        txt = txt.replace(m.group(1), line + m.group(1), 1) if m else txt + line
        open(p, 'w', encoding='utf8').write(txt)


def related(slug, title, blurb, pages):
    """Add a related-reading card on the given service pages."""
    card = (f'        <a class="wc-rel-card" href="/{slug}">\n'
            f'          <p class="wc-rel-title">{title}</p>\n'
            f'          <p class="wc-rel-desc">{blurb}</p>\n'
            '        </a>')
    done = []
    for name in pages:
        p = os.path.join(SRC, name)
        h = open(p, encoding='utf8').read()
        if f'href="/{slug}"' in h or '<div class="wc-rel-grid">' not in h:
            continue
        i = h.index('<div class="wc-rel-grid">') + len('<div class="wc-rel-grid">')
        open(p, 'w', encoding='utf8').write(h[:i] + '\n' + card + h[i:])
        done.append(name)
    return done


if __name__ == '__main__':
    import posts
    for post in posts.POSTS:
        read, words = build(post)
        register(post, read)
        rel = related(post['slug'], post['rel_title'], post['rel_blurb'], post['rel_pages'])
        print(f'  {post["slug"]:32s} {words:5d} words  {read} min  related: {", ".join(rel) or "none"}')
