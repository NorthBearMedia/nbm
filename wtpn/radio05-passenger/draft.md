# TRANSMISSION — "PASSENGER" (Part 1) — draft v2

User's notes on draft 1: slow the ending, add delay; show the passage of time (he's asleep, it's the middle of the
night when it starts, not straight after he parks); something's presence first (the trailer rocking, more than the
wind), then the sensor, then it goes quiet and he calms down, then the passenger warning.
Kept from my QC: scared performance, real whispers 6 dB under his talking, breathing, Tony's curtain rule, Tony on the
phone's own speaker once the ignition is off. Not used: "someone inside the trailer" (reads as stowaways): the trailer
rocks on a dead-still foggy night instead. draft v1 + QC notes: draft_v1.md, script_v1.json, passenger_audio_v1.py.

PART 1 — driving, parking, goodnight (0:00-0:54)
[Cab, fog. Ding... ding... the passenger seatbelt.]
JAMIE: Oh, shut up. / TONY (hands-free): What's that? / JAMIE: Passenger seatbelt. It thinks me bag's a person. [bag in the bunk; chime stops]
TONY: Where are you? / JAMIE: Top of Stainmore. Fog's like soup. And I'm out of hours in ten minutes.
TONY: So where you stopping? / JAMIE: Bowes Moor lay-by. / TONY: ...Nobody parks there. / JAMIE: Why? / TONY: Just keep your curtains shut, son.
[Pull-in; the side sensor beeps at the barrier] JAMIE: Yeah, alright, I can see it! / TONY: What's that one? / JAMIE: Side sensor. Beeps if anything's down the passenger side.
[Engine off — Tony moves to the phone speaker] Right. Engine off. [keys] Key out. [locks] Doors locked. [curtains] Curtains shut.
TONY: You alright? / JAMIE: Don't like it up here, Tone. It's too quiet. / TONY: Want me to sing you to sleep? / JAMIE: [laughs] Do one.
TONY: [laughs] Big baby. Get your head down. Ring me if you need me. / JAMIE: Night, Tone. [call ends]

TIME JUMP — fade to silence; on screen: 3:12 AM (0:56-0:59)

PART 2 — the night (0:59-2:14)
[Dead quiet. The heater. His slow sleeping breath.] [The trailer creaks and rocks. He wakes with a gasp. Fast, shallow breathing.]
[He rings Tony.] TONY: Jamie? It's gone three. You alright? / JAMIE (whisper): The trailer's rocking.
TONY: It'll be the wind, son. / JAMIE: There's no wind, Tone. It's fog. [The trailer lurches. Still.]
[The ignition relay clicks on by itself. One beep.] JAMIE: That's the side sensor. / TONY: You said the key's out. / JAMIE: It is. It's up here with me.
[Beep... beep... faster and faster] JAMIE: It's coming up the passenger side. [continuous tone — stops dead; the heater winds down and dies; he holds his breath]
TONY: Jamie? / JAMIE: It's stopped. / TONY: Doors? / JAMIE: Locked. / TONY: Don't open them curtains.
[A long quiet. His breathing slows.] TONY: Still there? / [a relieved breath] JAMIE: Yeah. I think it's gone. / TONY: Try and get your head down. I'm not going anywhere.
[Quiet. Then: ding. ding. ding.] TONY: Is that your bag? / JAMIE (whisper): It's in here with me. [ding. ding.] [click — the belt goes in] [silence] CUT.

Build notes: voices = best Scribe-cut line from six v3 dialogue takes (score2.py -> picks2.json; three at stability 0.5,
three at 0.0); j23 came out spoken (63-86% voiced) in all 14 attempts, so the chosen take is whisperized (whisperize.py:
LPC fit per frame, re-excited with noise; 10% voiced, Scribe still hears every word). The "sleep" breathing clips and the
lay-by/heater beds were ~95% sub-80 Hz rumble: high-passed before levelling; slow breaths are single breaths cut from
breathfast_0 and spaced out.
