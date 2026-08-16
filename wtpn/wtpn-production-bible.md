# WTPN PRODUCTION BIBLE — RECONSTRUCTED 15 AUG 2026

**⚠ RECONSTRUCTION NOTICE.** The original bible (~1,500 lines, built 15 Jul–14 Aug) lived in the
session scratchpad and was DESTROYED when the container was recycled overnight 14→15 Aug, along
with all episode assets, tools, covers, end cards and `secrets/metricool.env`. This file is
rebuilt from working memory the same morning. It now lives IN THE REPO (branch
claude/youthful-ritchie-60axtu, `wtpn/`) precisely so that can never happen again.
**COMMIT AND PUSH AFTER EVERY SESSION. The scratchpad is disposable; this directory is not.**

## WHAT WAS LOST vs WHAT SURVIVES
LOST: all episode working dirs (ep23–ep40: scripts, narrations, alignments, stills, Kling clips,
builds, finals), covers/ + serif.ttf, endcards/endcard.mp4, mc_upload.py, measure.py originals,
the full bible with verbatim history, the credentials file.
SURVIVES: every ARMED POST on Metricool's servers (queue publishes through 18 Aug regardless);
everything already published; this reconstruction; the standards (the daily trigger prompt
itself carries most of them); the tools rebuilt below from in-context source.
NEEDED FROM THE USER TO RESUME PRODUCTION: `METRICOOL_TOKEN`, `ELEVENLABS_API_KEY`, `FAL_KEY`
(re-share securely; recreate as `scratchpad/secrets/metricool.env` AND note them nowhere else).
Known non-secret IDs: blogId=6562751, userId=3883072. Slot: 05:30 Europe/London daily.

## THE QUEUE AS OF 15 AUG (armed server-side, safe)
  15 Aug  Pontefract 30 East Drive   post 360917631
  16 Aug  Hampton Court CCTV v2      post 361180258
  17 Aug  Cheltenham Ghost           post 361645718
  18 Aug  Spring-heeled Jack         post 362064323
  **First at-risk night: 19 AUG** — cannot produce until credentials are restored.

## ★★★★★ 15 AUG — THE 328k FORMAT TEST IS DEAD. HYPOTHESIS #5 FAILED. ★★★★★
EP35 Queen Mary (14 Aug) was the faithful reconstruction of the 328k video's format (2 cuts, no
duck, wall-of-sound, participatory close). Day-1 FINAL: **329 views, 0 shares, 2.4% likes.**
In-band, zero conversion. Per the decision rule set before it ran: the reconstruction joins the
failed list (airfield repetition, duck length, story-type variation, bookable close, 328k format).
This also seals the 11 Aug finding: the 328k video was the channel's FIRST POST — a new-account
distribution event, not a formula. **The +4/+6 dB house audio gate governs everything again.
Do not invent hypothesis #6. Report facts; optimise dread (user-confirmed driver).**

## 15 AUG ANALYTICS (yt-dlp; shares/1k leads — user-approved 10 Aug)
  0.18d Pontefract   415 views  0 sh   <- **BEST 4-HOUR OPEN EVER RECORDED** (prev best Hexham 393)
  1.18d Queen Mary   329        0 sh   2.4%  <- test failed, above
  2.18d Chislehurst  253        3 sh   11.9 sh/1k  <- winner band (best daily conversion yet)
  4.18d Epworth      434        4 sh   9.2 sh/1k   <- winner band
  Winner-band shares: Chislehurst 11.9, Epworth 9.2. Big-views/no-shares: South Shields 701/1.4.

## STANDING STANDARDS (user-approved; dates = approval)
- HORROR RULES 1–6 (2 Aug) + PACING (11 Aug: first-12s breaks ≤0.8s; gaps 25–30%; long pauses
  mid-piece only) + DREAD ≤3s WITH SFX HIT (12 Aug: image completes with its sound by ~3s; if
  sentence one needs sentence two to frighten, swap them) + MULTIPLE PLACED EFFECTS per episode
  (12 Aug: 3–5 on story beats, never just bed+stab+heartbeat).
- END CARDS on every video (11 Aug): 5s, "Send this to someone. / Keep them up tonight." then
  wordmark + "Daily real ghost stories from the UK & Ireland. / Follow for more." Body ≤~85s.
  **endcard.mp4 LOST — regenerate via tools/make_endcards.py + re-source a serif font, and
  EYEBALL the render before first reuse.**
- ARM ON CREATION (1 Aug), create-new-then-delete-old, verify calendar after every write.
- 05:30 Europe/London. Voices: Gideon q1h5HGdnfVxp4TXTJRNN (England), Ally v2zbX16tJNtRIx8rSHDM
  (Scotland), Cillian B5jEZPqk2OJ2vkPw3wBM (Ire/NI), Wales = GAP. eleven_multilingual_v2 ONLY;
  stability .15 / similarity .85 / style .75 / speed .88 / speaker_boost on; break tags mandatory.
- AUDIO: narration loudnorm -16 first; bed continuous (check its LRA ≤~2 BEFORE mixing, else
  regenerate); sidechain duck; gentle bus glue (-12dB/2:1); NO loudnorm on the bus; flat pass →
  ONE static gain to -15 → alimiter; hook duck 0.54 for 2.5s; GATE +4..+6 dB speech-over-bed via
  tools/measure.py. Broadband beds mask more (Queen Mary needed -32; sparse beds don't respond
  to level at all).
- VERIFY: tools/verify_narration.py (digits→words + difflib; gate eng / p≥0.90 / ≥95%); decode
  check `ffmpeg -v error -i F -f null -` EMPTY; EYEBALL every contact sheet (caught a rotation
  fix 25/25 since, a stray human figure on 13 Aug, and kept a good accidental shadow on 14 Aug).
- SELECTION: grep **ledger.tsv AND channel-audit/live-titles.tsv** (refresh via yt-dlp both
  platforms) with PHENOMENON words, not just proper nouns — the 13 Aug Grey Man duplicate
  shipped because the ledger was a stale snapshot and the live title used none of my keywords.
  The user caught it; post pulled pre-publish. Banned: castles by default, roads, Glamis,
  Culloden, Treasurer's House York (user: DO NOT PRODUCE), anything already live.
- Captions: 14-15 hashtags, one emoji, END ON A DIRECT QUESTION, #wtpn #wherethepathnarrows,
  tiktokData.isAigc:true mandatory.
- REDO PROGRAMME (user-proposed 11 Aug): shortlist Enfield / 50 Berkeley Square / Willington
  Mill / Chained Oak — STILL AWAITING THE USER'S PICK.

## EPISODE LEDGER — see channel-audit/ledger.tsv (reconstructed; live-titles.tsv is authoritative
for what is published — 122 rows, both platforms, refreshed 15 Aug).

## 16 AUG — DAY 2 BLOCKED ON CREDENTIALS; PONTEFRACT POSTS THE BEST DAY-1 OF THE ERA
Analytics (yt-dlp; shares/1k first):
  1.18d Pontefract    1 sh  750 views  1.3 sh/1k  2.9%  <- **BEST DAY-1 OF THE RECENT ERA**
        (beats Hexham 729, South Shields 704). The scariest episode of the run now holds both
        the best 4-hour open (415) AND the best day-1. Conversion low so far.
  0.18d Hampton Court 0 sh  247 views  4.0%  (first fully-new-standards build; mid-band open)
  3.18d Chislehurst   3 sh  262 views  11.5 sh/1k — winner band holds.
  Followers 4,424. The old 230-283 day-1 band is now broken in BOTH directions (QM 329 low-mid,
  Pontefract 750 high): day-1 variance is finally moving. No causal claim.
CONTAINER NOTE: fresh box again — ffmpeg/pillow/yt-dlp had to be reinstalled (apt ffmpeg, pip
pillow yt-dlp). Assume NOTHING is installed after a recycle.
**END CARDS REBUILT** (endcards/ in repo now): Liberation Serif replaces the lost font —
near-identical render, eyeballed against memory of the originals; endcard.mp4 5.0s decode-clean,
now natively 48kHz MONO so the concat needs no aresample. STILL BLOCKED: Metricool/ElevenLabs/fal
keys. 17-18 Aug armed and safe; **19 Aug is the first night that will be missed** if keys have
not arrived by tomorrow morning's run.
