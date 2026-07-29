# Location landing pages

Five pages target the towns around Belper: Duffield, Ripley, Alfreton, Heanor
and Derby. They live at `/accountants-in-<town>`.

## Adding or editing a town

Edit `sites/williscooper/locations.json`, then run:

```bash
node sites/williscooper/build-locations.mjs
```

Each entry needs `slug`, `town`, `distance`, `direction`, `intro`,
`localContext`, `journey` and a `faqExtra` (a question and answer specific to
that town). The generator builds the page, its title, meta description,
canonical, Open Graph tags and the WebPage / BreadcrumbList / FAQPage schema.

After adding a town, also add it to `sitemap.xml`, to the "Areas we cover"
section of `llms.txt`, and to the pill lists on index, contact-us and
our-services so it is not orphaned.

## The one rule that matters

**Distinct copy per town, or do not add the town.** Near-identical location
pages are doorway pages: Google filters them, and at scale they can drag down
the rest of the site. The `intro`, `localContext`, `journey` and `faqExtra`
fields exist to carry that difference, and they are the fields worth spending
time on. Shared scaffolding (the service grid, the office details, the closing
call to action) is fine and normal.

Roughly 200 of the ~730 words on each page are currently town-specific. The
single best way to raise that, and the strongest trust signal available, is a
real client quote from that town. Those need to come from Willis Cooper.

## Deliberately not included

No invented client counts, case studies or testimonials, and no claims about
having existing clients in a given town. Local detail is limited to plainly
verifiable geography. Everything said about the firm (ICAEW registration,
established 2000, the Belper office, opening hours, software) comes from the
site itself.
