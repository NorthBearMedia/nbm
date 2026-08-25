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

## ★★★★★ 19 AUG — KEYS RESTORED (user re-provided all three; verified live). RECOVERY DAY. ★★★★★
- ElevenLabs quota RESET on the new key: 0/177,776 chars.
- Metricool + fal verified. **mc_upload.py's source is unrecoverable** — interim standard flow:
  `fal_client.upload_file()` -> fal.media URL -> Metricool scheduler accepts it (this was the
  original pre-S3 flow). Rebuild a Metricool-native uploader only if fal hosting misbehaves.
- verify_narration.py had a REBUILD BUG: char-level SequenceMatcher autojunk junks spaces on
  ~900-char strings (scored a clean take 20.4%). Fixed: word-level ratio, autojunk=False. Third
  measurement-artifact bug of this class (positional zip 31 Jul, digits 10 Aug, autojunk 19 Aug).
- **ONE NIGHT MISSED: 19 Aug** — the key outage's total cost (posts up to 18 Aug were pre-armed).
  No backfill per standing rule. EP41 Cooneen armed for 20 Aug (post 363892259, fal-hosted,
  isAigc, verified): 82.8s w/ cards, 4.8 dB (moor bed needed -36 — wind masks hard), 99.4%
  ("Fermina"=Scribe on Cillian's accent), Cillian's first episode since 6 Aug. Thud/raps/ship-thud
  /heartbeat effects; lit-farmhouse -> derelict-farmhouse bookend. EP42 Borley staged, HELD —
  user asked for the analytics deep-dive before "building loads".

## ★★★★★ 19 AUG — THE 10k DEEP DIVE (user-requested pivot checkpoint) ★★★★★
FOLLOWERS: 4,426. Samples: ~4,340 (30 Jul) / 4,407 (10 Aug) / 4,412 (11) / 4,424 (16) / 4,426 (18-19).
  Rates: 20-day +4.3/day; 9-day +2.1/day; last 3 days +0.7/day. **DECELERATING.**
THE DECOUPLING (the central finding): the 700-club week (774/731/728/710 day-1s, views ~3x the
old band) produced +2/day followers — conversion ~1 follow per 250 views vs ~1 per 100 lifetime.
Views and follows have DECOUPLED. The affective metrics moved the OTHER way in the same window:
new-era like-rates 1.5-2.9% vs 4-10% old register; shares 0-2 on every 700-club episode.
92% of all channel likes (46.6k of 50.9k) sit on one video with a 14.2% like-rate AND 21.4 sh/1k —
when this channel actually converts, all three metrics move together.
ARITHMETIC: gap to 10k = 5,574. At current +2-4/day: 3.6-7.6 YEARS. At historical ~1 follow/100
views: needs ~560k further views ≈ two Greyfriars-scale outlier events. Steady state cannot get
there; only outliers + restored conversion can.
EPWORTH is the one new-era episode where views (442), likes (7.3%) and shares (9.0/1k) all held —
the existing proof the pipeline can produce all-three episodes.
END CARDS: no measurable follows/day lift since 11 Aug deployment. Stated, not spun.
PIVOT OPTIONS PUT TO USER (no standard changed): A keep pure dread course / B hybrid (dread
cold-open + affective body-close, A/B for two weeks, judge on follows-per-day + sh/1k) /
C narrow: clone Epworth's register. Follower count now scraped EVERY run — follows/day per
episode is finally a measurable per-register outcome.

## ★★★★★ 19 AUG — THE TOP-20 RULES. USER-APPROVED ("so lets introduce those rules now"). ★★★★★
Derived from the audit of the channel's 20 best-performing videos (15/20 present tense, 14/20
named figure, 9/20 witness chain incl. 4-for-4 first-person, 13/20 place in the first line,
19/20 from the 2025 catalogue). These COMPOSE WITH the horror rules — dread open ≤3s, pacing,
placed effects all still govern. Principles, not a template.

**T1. PRESENT TENSE — the haunting has not stopped.** The hook and the close carry "still"
grammar: it still walks, they still see her, the reports have not stopped. A story that is over
is a museum placard (rule 2 restated in time). Only claim "still" where the record supports
continuing reports — attribute where soft.

**T2. THE THING IS A WHO.** Named or titled, human-shaped where the record has one: the Black
Nun, the White Lady, the watchman, the man buried in 1814. **RETIRED: the "naming it makes it
smaller" note (11 Aug, mine) — the data says the audience shares entities with identities.**
Never invent a name (rule 4); use the record's name or title, or the strongest human anchor.

**T3. A WITNESS CHAIN YOU CAN STAND IN.** First person where the record contains first-hand
accounts (quote them; never fabricate an "I"), else the chain: named witnesses, "locals still
see", counts of independent observers. Every explicitly first-person video on the channel is
in the top 20.

**T4. PLACE IN THE FIRST LINE of the caption/title** (a titling practice, distinct from story
selection). Country still anchored for the US audience.

First episode built under these: EP42 Borley (below). EP41 Cooneen (armed 20 Aug) predates them —
partially compliant by accident (named Bridget Murphy, "the house still stands"); left as armed.


## ★★★★★ 25 AUG — THE WITNESS FORMAT. USER-APPROVED ("Excellent. Publish it"). ★★★★★
The channel's new flagship format, born from the user's craft verdict ("not even close")
and their ask: first-person, interview, feels real.
- **Form:** interview dramatisation. Typed question cards (mono font, black), the witness
  ANSWERS in voice. On-screen disclosure card: "Dramatised from [witness]'s signed
  statement / broadcast interviews / published account." isAigc:true always.
- **Truth line (hard rule):** every FACT documented (facts.md per episode, sourced
  verbatim where possible). Human texture (sensory detail, interiority) is dramatised —
  never new facts, never a fabricated witness, never an invented name.
- **Writing (the user's bar, met by Heeps v3/v4):** sensory anchors ("I remember her
  hands"), the mundane beside the impossible ("waiting for furniture"), witness
  characterisation of the event ("like it had done what it came to do"), cost/aftermath
  ("that's the part I think about"), authority frame in the close ("sober, on duty, in
  uniform"), refusal to plead ("make of it what you like"). AVOID abstractions like
  "the air went wrong" — user vetoed; concrete experience only.
- **Cold open:** witness voice at ~0.5s with the single scariest claim. Tape click first.
- **Voice:** eleven_v3_conversational, stability 0.5, disfluencies WRITTEN into the text
  (em-dashes, ellipses, restarts) + sparse tags [exhales]/[sighs]/[soft laugh].
  Witness voices from the library per character (Heeps = Blondie exsUS4vynmxd379XN4yO).
- **Processing (the "archive" sound):** highpass 240 / lowpass 3600 / aresample 8000->48000
  / acompressor -24dB 4:1 / vibrato 0.4Hz d=0.015; per-segment measured normalize to -16.
  Pink-noise hiss bed (amplitude 0.006, band 300-9000) runs until a tape-off click after
  the last answer; drone bed at -36 under; scrape/click stings from the sfx library.
- **Visuals:** black + typed cards + 2-3 existing stills degraded to near-mono
  (saturation 0.07, contrast 1.22, brightness -0.06, heavy grain, slow zoompan).
  Serif lowercase sentence captions, lower third. NO cinematic motion. ~ZERO generation cost.
- **Length:** ~2:00-2:20 ratified (the 90s ceiling does NOT apply to witness episodes).
- **Pipeline:** tools/mc_upload.py (REBUILT — Metricool S3 upload-transactions flow with
  x-amz-checksum-sha256 headers) means publishing needs NO fal. fal only for new stills.
- First episode: Enfield/WPC Heeps, armed 26 Aug 05:30, post 366475797.
- Witness bench (documented first-person records): Sauchie (Miss Stewart), Borley
  (Marianne Foyster), Pontefract, Battersea (Shirley Hitchings), Epworth letters,
  Renvyle (Yeats/Gogarty published accounts), Glasgow/Gorbals BBC retrospectives.
