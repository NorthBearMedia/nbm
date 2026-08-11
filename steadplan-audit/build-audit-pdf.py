#!/usr/bin/env python3
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, Image, PageBreak)

GREEN = HexColor('#3EAF84'); DARK = HexColor('#151B25'); GREY = HexColor('#5A6572')
LIGHT = HexColor('#F2F6F4'); BORD = HexColor('#D8DEDA'); TXT = HexColor('#222222')

A = '/tmp/claude-0/-home-user-nbm/93a7fe94-e487-5d20-a725-67f1bc85a609/scratchpad'
OUT = A + '/audit/Steadplan_SEO_Audit_NorthBearMedia.pdf'

st = dict(
  body=ParagraphStyle('body', fontName='Helvetica', fontSize=10, leading=14.5, textColor=TXT, spaceAfter=7),
  bullet=ParagraphStyle('bullet', fontName='Helvetica', fontSize=10, leading=13.5, textColor=TXT,
                        leftIndent=14, bulletIndent=2, spaceAfter=4),
  h1=ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=15.5, leading=19, textColor=DARK,
                    spaceBefore=16, spaceAfter=8),
  h2=ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=12, leading=15, textColor=GREEN,
                    spaceBefore=12, spaceAfter=6),
  cell=ParagraphStyle('cell', fontName='Helvetica', fontSize=9, leading=12, textColor=TXT),
  cellh=ParagraphStyle('cellh', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=white),
  cover1=ParagraphStyle('c1', fontName='Helvetica-Bold', fontSize=30, leading=36, textColor=DARK, alignment=TA_CENTER, spaceAfter=8),
  cover2=ParagraphStyle('c2', fontName='Helvetica-Bold', fontSize=16, leading=20, textColor=GREEN, alignment=TA_CENTER, spaceAfter=6),
  cover3=ParagraphStyle('c3', fontName='Helvetica', fontSize=10.5, leading=14, textColor=GREY, alignment=TA_CENTER, spaceAfter=4),
  foot=ParagraphStyle('foot', fontName='Helvetica', fontSize=9, leading=12, textColor=GREY),
)

def P(t): return Paragraph(t, st['body'])
def B(t): return Paragraph(t, st['bullet'], bulletText='–')
def H1(t): return Paragraph(t, st['h1'])
def H2(t): return Paragraph(t, st['h2'])

def tbl(rows, widths):
    data = [[Paragraph(c, st['cellh']) for c in rows[0]]] + \
           [[Paragraph(c, st['cell']) for c in r] for r in rows[1:]]
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), DARK),
        ('GRID', (0, 0), (-1, -1), 0.5, BORD),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(rows)):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0, i), (-1, i), LIGHT))
    t.setStyle(TableStyle(style))
    return t

flow = []
# ---- cover
flow += [Spacer(1, 4.6*cm),
         Image(A + '/nbm-logo-doc.png', width=7.4*cm, height=3.45*cm),
         Spacer(1, 1.4*cm),
         Paragraph('STEADPLAN', st['cover1']),
         Paragraph('SEO Audit &amp; Growth Strategy', st['cover2']),
         Paragraph('steadplan.co.uk', st['cover3']),
         Spacer(1, 3.4*cm),
         Paragraph('Prepared for Hal Jackson, Steadplan Group', st['cover3']),
         Paragraph('North Bear Media &nbsp;·&nbsp; August 2026', st['cover3']),
         PageBreak()]

# ---- executive summary
flow += [H1('Executive summary'),
P('Steadplan’s website is a strong asset: a modern, well-designed site with a genuine vehicle showroom fed live from your stock system, clear service pages and a working enquiry pipeline. The foundation Hal described is real. Our full crawl and code-level review confirms the structure is sound, every core page loads cleanly, and there is nothing that needs rebuilding.'),
P('What has held it back is maintenance and momentum, which matches your experience with the previous arrangement. We found a set of specific technical faults that have been quietly limiting Google’s view of the site, including a fault that puts <b>two competing page titles on every single page</b>, the <b>news section being hidden from Google entirely</b> (marked “noindex”), and vehicle pages whose titles <b>omit the make and model</b> (“MAN TGE” appears in the page but not in the title Google reads). None of these are visible to a visitor; all of them matter to a search engine.'),
P('The blog stopped in February 2026, which removed the main engine Holdens were relying on for organic growth. And the single biggest untapped opportunity is local: Steadplan trades from <b>Leeds, Rochdale and Burnley</b>, but the website has <b>no page for any of the three locations</b>, so Google has nothing to rank when local businesses search for a van dealer or commercial vehicle workshop near them.'),
P('The move to our hosting is complete and fully tested, which unblocks everything above: we now control the code and can fix, measure and publish at will. This document sets out exactly what we found, what has already been fixed during the move, and a 90-day plan in priority order. Everything listed maps to the Growth retainer deliverables agreed in June.')]

# ---- already done
flow += [H1('Already done during the migration'),
P('The following was completed as part of moving the site to North Bear Media’s hosting, before this audit was issued:'),
B('<b>Full site migration</b> to fast UK hosting under Steadplan/NBM control: files, database and vehicle stock integration verified working end-to-end on a private test link (all pages, showroom, vehicle pages, enquiry forms).'),
B('<b>Server modernised</b>: PHP updated to the correct supported version, debug mode switched off (it was left on, writing errors to disk), and 85MB of accumulated log junk removed from the site.'),
B('<b>Security tidy-up</b>: the previous host’s leftover configuration removed; firewall (Wordfence) re-pointed correctly so it protects the new server.'),
B('<b>Meta Pixel installed</b> site-wide for Sam’s ad campaigns, so ad conversion tracking is ready the moment the domain switches.'),
B('<b>Monitoring live</b>: Google Search Console and Analytics access is in place and already alerting (it flagged indexing errors on 18 July; addressed in the plan below).'),
B('<b>Site credit updated</b> to North Bear Media.')]

# ---- technical findings
flow += [H1('Technical findings'),
P('Ordered by impact. “Fix” items are quick, definite wins; none require design changes.'),
tbl([
 ['Finding', 'Why it matters', 'Priority'],
 ['Every page carries two title tags: the theme hardcodes a second, generic “Steadplan” title after the real one', 'The page title is the single strongest on-page signal; a duplicate makes Google pick unpredictably', 'Critical'],
 ['The News listing page is marked noindex, and a duplicate “Blog” page competes with it', 'Your blog (the content Holdens relied on for growth) has its index page hidden from Google', 'Critical'],
 ['Vehicle page titles and web addresses omit make &amp; model (e.g. no “MAN TGE”)', 'Vehicle stock is invisible for the exact searches buyers use; this is the flagship keyword set', 'Critical'],
 ['Two pages fight over /showroom/ (a page and the vehicle archive share the same address)', 'Google gets an ambiguous answer for your most commercial page', 'High'],
 ['Old staging copy of the site still indexed by Google (flagged in June)', 'A duplicate of the whole site competes with the real one in search results', 'High'],
 ['Search Console reporting pages blocked by 4xx errors (18 July alerts)', 'Pages Google cannot fetch cannot rank; needs the error list working through', 'High'],
 ['No browser caching for CSS/JS (rules present but switched off) and no caching plugin', 'Slower repeat visits; page speed is a ranking and conversion factor', 'Medium'],
 ['Duplicate and render-blocking scripts in the page head; one library loaded from an unversioned third-party source', 'Wasted load time and a stability/security risk we don’t control', 'Medium'],
 ['/sitemap.xml returns “not found” (the real sitemap lives at a different address); one listed sitemap is empty', 'Minor crawl friction; easy tidy', 'Low'],
 ['Old config-file copies left in the web root by the previous developer', 'Server configuration files should never be publicly reachable; removing at go-live', 'Cleanup'],
], [6.8*cm, 7.2*cm, 2.4*cm]),
Spacer(1, 0.25*cm),
P('All “Critical” items are code-level fixes we can now make directly, since the site is on our hosting. The two-title fault is already fixed at the time of writing.')]

# ---- content findings
flow += [H1('Content findings'),
H2('Blog'),
P('18 published articles, on a healthy monthly rhythm through 2025, then nothing since <b>26 February 2026</b>. The content itself is good (MAN TGE guides, industry pieces, local angles), which makes the stall the problem, not the quality. Google rewards sites that keep publishing; five stale months is why organic growth flattened.'),
H2('Page descriptions'),
P('Meta descriptions (the text Google shows under your listing) exist on <b>9 of 15 pages</b>, and on <b>none of the 18 blog posts or 30 vehicle pages</b>. Where they exist they are well-written; the gaps mean Google improvises your shop-window text for most of the site.'),
H2('Images'),
P('Roughly <b>1 in 4 images</b> (76 of 298) has alt text, the description Google reads. Vehicle and conversion photography is a genuine strength of the site; most of it is currently invisible to image search.'),
H2('Small tidy-ups'),
B('The careers section’s Google title reads “Careers Archive”, a leftover technical default.'),
B('One article has a broken web address (“/2565-2/” instead of a readable one).'),
B('The homepage’s internal name is still “sample-page”: cosmetic, but worth fixing while we’re in.')]

# ---- local + vehicles
flow += [H1('The local opportunity: Leeds, Rochdale, Burnley'),
P('This is the largest single gap. Steadplan operates from three sites across the north of England, but the website has <b>no dedicated page for any location</b>. The branches exist only as an address block in the footer. When someone in Leeds searches “van dealer Leeds” or a Rochdale operator searches “commercial vehicle servicing near me”, Google has no Steadplan page to show.'),
P('The fix is a proper landing page per branch (local team, services at that site, directions, opening hours, local stock), each connected to its <b>Google Business Profile</b>, which we’ll manage as part of the retainer (posts, photos, reviews, Q&amp;A). Three well-built location pages plus active profiles is how a genuinely local business beats the national marketplaces in its own towns.'),
H1('Vehicle pages &amp; rich results'),
P('Each vehicle already has its own real page, which is excellent and unusual (many dealers have one JavaScript page Google can’t read). But the pages carry <b>no vehicle structured data</b>: the machine-readable price, mileage, make and model that lets Google show rich results. Adding Vehicle and AutoDealer markup, and putting make &amp; model into titles and addresses, turns 30 stock pages into 30 search landing pages that refresh themselves every time stock updates.')]

# ---- keywords
flow += [H1('Keyword strategy: fight where we can win'),
P('We will not chase generic terms like “used vans for sale”: those results are owned by AutoTrader, eBay and Gumtree, and budget spent there is wasted. The strategy targets three groups Steadplan can genuinely own:'),
B('<b>MAN TGE and model terms</b>: “MAN TGE dealer”, “new MAN TGE for sale”, “MAN TGE crew van”: high buying intent, thin competition, and Steadplan’s actual specialism.'),
B('<b>Conversions and services</b>: “van conversions north west”, “fridge van conversion”, “commercial vehicle maintenance contract”, “van leasing 3–7 years”: service pages already exist and need targeting, depth and internal links.'),
B('<b>Local terms × three towns</b>: “van dealer / van servicing / MAN dealer + Leeds / Rochdale / Burnley”: delivered by the location pages and Google Business Profiles above.'),
P('The blog restarts in service of these terms (two posts per month), and every vehicle page reinforces the model terms automatically once titles and markup are fixed.')]

# ---- measurement
flow += [H1('Measurement: from visits to vans sold'),
P('Analytics (GA4) and Search Console are connected, and the Meta Pixel is installed for Sam’s campaigns. The next step is wiring <b>enquiry tracking</b>: every form submission and phone-number tap recorded as a conversion, attributed to the page and channel that produced it.'),
P('That gives us the numbers that matter: how many visitors it takes to produce an enquiry, and, with your close rates, how many enquiries it takes to sell a vehicle. Monthly reporting will show rankings and traffic, but it will be built around <b>enquiries and calls</b>, so you can judge the retainer on business produced, not graphs.')]

# ---- roadmap
flow += [H1('90-day roadmap'),
tbl([
 ['When', 'Work', 'Outcome'],
 ['Weeks 1–2', 'Domain switch-over with full checks · remove staging site from Google · fix the 4xx indexing errors · two-title fault (done) · un-hide the news section · resolve the /showroom/ conflict · descriptions on the six missing pages', 'Clean, fully-indexable site on fast hosting; Search Console errors cleared'],
 ['Month 1', 'Vehicle titles &amp; addresses carry make/model · Vehicle + AutoDealer structured data · speed pass (caching on, scripts tidied) · alt text across commercial pages', '30 stock pages become search landing pages; measurably faster site'],
 ['Month 2', 'Three location pages built (Leeds, Rochdale, Burnley) · Google Business Profiles optimised and actively managed · blog restarted at two posts/month against the keyword plan', 'Local visibility in all three towns; publishing momentum back'],
 ['Month 3', 'Link building (local press, industry directories, supplier partners) · enquiry tracking live in reports · first full ranking &amp; enquiry report vs. this baseline', 'Authority building; results measured in enquiries, not just positions'],
], [2.2*cm, 8.6*cm, 5.6*cm]),
Spacer(1, 0.3*cm),
P('From month 3 the retainer settles into its ongoing rhythm: content, local management, technical care and link building, reported monthly against enquiries. Paid spend can begin tapering as agreed once organic enquiries demonstrably replace it. That decision stays yours, made on the numbers.'),
Spacer(1, 0.5*cm),
Paragraph('<b>North Bear Media</b>', ParagraphStyle('sig', fontName='Helvetica-Bold', fontSize=10.5, textColor=DARK, spaceAfter=3)),
Paragraph('Norton Hunt · info@northbearmedia.co.uk · 01773 307 308 · northbearmedia.co.uk', st['foot'])]

def deco(canvas, docobj):
    canvas.saveState()
    if docobj.page > 1:
        canvas.setFillColor(GREEN)
        canvas.rect(0, A4[1] - 0.35*cm, A4[0], 0.35*cm, stroke=0, fill=1)
        canvas.setFillColor(GREY)
        canvas.setFont('Helvetica', 8)
        canvas.drawString(2.3*cm, 1.2*cm, 'Steadplan · SEO Audit & Growth Strategy · North Bear Media')
        canvas.drawRightString(A4[0] - 2.3*cm, 1.2*cm, str(docobj.page - 1))
    canvas.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=2.3*cm, rightMargin=2.3*cm,
                      topMargin=2.1*cm, bottomMargin=2.1*cm,
                      title='Steadplan SEO Audit & Growth Strategy', author='North Bear Media')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([PageTemplate(id='p', frames=[frame], onPage=deco)])
doc.build(flow)
print('PDF written')
