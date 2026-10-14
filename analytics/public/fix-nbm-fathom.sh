#!/bin/sh
# One-off repair for northbearmedia.co.uk, October 2026.
#
# The pages on disk load Google Analytics eagerly but carry no Fathom
# script at all. Visitors have been served a stale cached copy of the
# site that still had Fathom in it, which is the only reason Fathom kept
# recording. Before that cache is cleared, this script puts the Fathom
# tag back into every page, directly after the gtag script line, so the
# fresh pages carry all the tracking the cached ones did and more.
#
# Idempotent: a page already carrying Fathom is left alone. Each changed
# file keeps its first-ever backup as <file>.nbmbak.
D=/home/u275789987/domains/northbearmedia.co.uk/public_html
S='<script src="https://cdn.usefathom.com/script.js" data-site="JYTZFMCF" defer></script>'
find "$D" -type f -name '*.html' | while read f; do
  if grep -q 'cdn\.usefathom\.com' "$f"; then echo "already $f"; continue; fi
  if ! grep -q 'gtag/js?id=G-9NX0CJ85CL' "$f"; then echo "NO-GTAG $f"; continue; fi
  [ -f "$f.nbmbak" ] || cp "$f" "$f.nbmbak"
  awk -v s="$S" '{ print; if (!d && index($0, "gtag/js?id=G-9NX0CJ85CL") > 0) { print "    " s; d = 1 } }' "$f" > "$f.tmpfix" && mv "$f.tmpfix" "$f" && echo "added $f"
done
echo NBM-FATHOM-FIX-COMPLETE
