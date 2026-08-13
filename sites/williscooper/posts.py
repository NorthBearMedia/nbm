# -*- coding: utf-8 -*-
"""The three Willis Cooper blog drafts that were sitting in Google Drive
unpublished. Body copy is the client's own, carried over verbatim from the
.docx files; only headings, links and the closing call-to-action block are
North Bear additions, and those are noted per post.
"""

P = '<p class="body" dir="auto">'

# ---------------------------------------------------------------------------
# 1. Mileage rate increase
#    Source: 06_Documents/Blog - Mileage Rate Increase - DRAFT.docx
#    Verbatim. The internal "Draft for approval" line is dropped; the doc's
#    own sub-headings become h2s and its bold run-ins stay as written.
# ---------------------------------------------------------------------------
MILEAGE_BODY = (
    f'{P}If you use your own car for work, this one’s worth paying attention to. For the first time '
    'since 2011, HMRC has put up the approved mileage rate, and the change is already in effect.</p>'

    '<h2>The headline</h2>'
    f'{P}From <strong>April 2026</strong>, the tax-free mileage rate (officially called the AMAP rate) '
    'has gone up from <strong>45p to 55p per mile</strong> for the first 10,000 business miles in a tax '
    'year. After that, it stays at 25p per mile.</p>'
    f'{P}Chancellor Rachel Reeves confirmed the increase on 21 May 2026, and importantly it’s been '
    'backdated to the start of the 2026/27 tax year. So if you’ve been claiming since April, you can go '
    'back and reclaim at the higher rate.</p>'

    '<h2>A quick refresher on what counts</h2>'
    f'{P}The mileage rate is for business travel in your own vehicle. Things like:</p>'
    '<ul><li>Visiting clients or customers</li>'
    '<li>Travel between different work locations</li>'
    '<li>Field-based work or call-outs</li></ul>'
    f'{P}It doesn’t cover your ordinary commute from home to your normal workplace. That bit hasn’t '
    'changed.</p>'

    '<h2>What hasn’t moved</h2>'
    f'{P}A few rates have stayed the same:</p>'
    '<ul><li>25p per mile after the first 10,000 business miles</li>'
    '<li>24p per mile for motorcycles</li>'
    '<li>20p per mile for bicycles</li></ul>'
    f'{P}So the big change is really the first 10,000 miles, which is where most people sit.</p>'

    '<h2>What you should do now</h2>'
    f'{P}<strong>If you’re employed and your employer pays mileage:</strong> Check what rate they’re '
    'paying you. If it’s still 45p, you can claim the 10p difference back as Mileage Allowance Relief, '
    'via a P87 form (if your total work expenses claim is under £2,500) or through self assessment. If '
    'your employer pays more than 55p per mile, the excess counts as taxable income.</p>'
    f'{P}<strong>If you’re self-employed:</strong> Make sure your bookkeeping is using the new 55p rate '
    'from April onwards. If you’ve already submitted figures using 45p, we can look at adjusting those.</p>'
    f'{P}<strong>If you employ people who drive for work:</strong> This is a chance to look at your '
    'mileage policy. The increase doesn’t oblige you to pay more, but with fuel and running costs where '
    'they are, it’s a fair conversation to have with your team. And if you’ve been topping up over 45p '
    'with taxable additions, you may now be able to roll those into a single, tax-free payment.</p>'

    '<h2>Keep good records</h2>'
    f'{P}Whatever your situation, keep a clear log of your business mileage with dates, journeys and '
    'reasons. HMRC can ask to see it, and a tidy record saves a lot of stress later.</p>'

    '<h2>If you’d like a hand</h2>'
    '<div class="wc-post-cta">'
    f'{P}If you’re not sure what you can claim, or you want help backdating to April, '
    '<a href="/contact-us">give us a call</a>. It’s a small change on paper that can make a real '
    'difference over a year of driving.</p>'
    f'{P}You may also want to read more about our <a href="/tax">tax services</a>, '
    '<a href="/payroll">payroll support</a> or <a href="/cloud-accounting">cloud accounting</a>.</p>'
    '</div>'
)

# ---------------------------------------------------------------------------
# 2. 25 years of Willis Cooper
#    Source: 03_Video/Robert 25 year Questions/Robert 25 Year Article.docx
#    Robert's section headings and pull quotes are kept. Four things are held
#    back for Norton to decide on, since this one goes out under the client's
#    name on a public page:
#      - the line about a former hire being "educated beyond his intelligence"
#      - the joke that "most other accountants are such rubbish"
#      - the tail of the indifference quote ("...because you ARE indifferent")
#      - the "maybe I'd be bitter and twisted" paragraph
#    Restoring any of them is a one-line edit here. Also fixed one transcription
#    typo: "you're still got to offer" -> "you've still got to offer".
# ---------------------------------------------------------------------------
Q = lambda t: f'<blockquote><p>{t}</p></blockquote>'

ROBERT_BODY = (
    '<figure><img src="assets/images/robert-cooper-25-years.jpg" '
    'srcset="assets/images/robert-cooper-25-years-w480.jpg 480w, '
    'assets/images/robert-cooper-25-years-w800.jpg 800w, '
    'assets/images/robert-cooper-25-years.jpg 1080w" sizes="(min-width: 920px) 954px, 100vw" '
    'alt="Robert and Julie Cooper outside the Willis Cooper office in Belper" width="1080" height="608" '
    'loading="lazy"><figcaption>Robert Cooper, founder, with Julie Cooper, office manager.</figcaption></figure>'

    f'<p class="body wc-post-standfirst" dir="auto">Robert Cooper started Willis Cooper in his living '
    'room with too many clients and no business plan. Twenty-five years on, with a loyal team and an '
    'ever-growing client base, he reflects on building a practice rooted not in strategy, but in care.</p>'

    '<h2>The beginning</h2>'
    f'{P}Even from a very young age I always wanted to be self-employed. I was a partner with another '
    'practice, and the guy in charge, the senior partner, he was like probably the same age I am now. But '
    'he seemed to be quite old and set in his ways. Nice bloke, I don’t want to be knocking him. Nice '
    'piece of bloke, knew what he was doing, good accountant.</p>'
    f'{P}But I think I was a bit frustrated. I wanted to bring some innovation to the practice. Like a '
    'bit of CRM. When we were looking at the CRM software, I thought that’s really good. And he was like, '
    '“Oh, what do you want that for?” and stuff like that. So I thought, I’ll take my bat and ball and '
    'I’m going to leave and do my own thing. So I was probably a part of that for about five years and I '
    'thought, now I’m going to do my own thing now, so off I toddles.</p>'
    f'{P}People didn’t talk about business vision 26 years ago. I knew I wanted to incorporate some of '
    'the stuff happening in the software world. But basically it was just a case of, I’ll set me a '
    'business and I’ll provide the service and look after the clients and everything will just fall into '
    'place.</p>'
    f'{P}When I first started, I didn’t really think in terms of there’ll be a team or anything. I '
    'thought there’d be kind of a, probably an admin person, reception admin type thing. But even then, '
    'you typed up your own accounts in those days. I was going to provide the service to my clients.</p>'
    f'{P}When I left the previous practice, basically you’re owed goodwill, because it values the '
    'business. And so I took, rather than getting paid for any goodwill, I took a whole load of clients '
    'with me. Most of them, when they knew I was going, said “Oh, can I come? Can I come?” And so I took '
    'all of them. They were clients who came from an established chartered practice, foolishly all '
    'jump-shipped and came with me. And just like we’ve got all sorts now, there was all sorts then. So '
    'there was me in my living room. I started off in my living room. Me in the living room with a whole '
    'load of clients I couldn’t possibly service. And they were everything, from little sole traders up '
    'to multi-million-pound corporates. Just me on my tod.</p>'

    '<h2>The journey</h2>'
    f'{P}I hate the word proud. Pride comes before the fall, doesn’t it? It’s been continuous, organic '
    'growth. Grown continuously, organically. We’ve got a good team. It’s all kind of grown nicely, very '
    'stable and organic, and managed to get good people to join and stay.</p>'
    f'{P}The biggest challenge has always been from day one. Like a fool I took all them clients, and I '
    'couldn’t possibly service them. So it’s just been relentless. Ever since day one it’s been relentless '
    'for 25, 26 years. It’s been relentless. The biggest challenge has just been the workload. Managing my '
    'workload. I’ve always had way too much work. And I’ve still not overcome it.</p>'
    f'{P}Have I ever felt we’ve made it? Nope. I still don’t think that. I still feel, although we have '
    'grown stably and organically and all the rest of it, I still feel that it could all go wrong around '
    'us. There’s not really a point where you can just say, yeah, that’s it now.</p>'
    f'{P}Our clients are constantly changing. Our work is constantly moving. And you move from being a '
    'very small practice where actually you want to bring clients in, so you’re very focused on client '
    'acquisition. And then what gradually happens over time is you come in as wolves, and then over time '
    'you become shepherds, because then you’re looking after what you’ve got. So your focus changes from '
    'going out there and getting, to actually holding on to what you’ve got.</p>'
    + Q('“You come in as wolves, and then over time you become shepherds. Your focus changes from going '
        'out there and getting, to actually holding on to what you’ve got.”') +
    f'{P}I never really had that going-out-and-getting phase because I just had all these people join me. '
    'I kind of find that a bit sad, really. I never had to go out and fight for work. Getting business has '
    'never been my focus because I’ve always had referrals. It’s never been a problem. And the issue '
    'throughout the 25, 26 years is actually bringing resource to bear, so we’ve got enough resource to '
    'manage the work we’ve got to do. That’s always been the issue rather than bringing new work in.</p>'
    f'{P}With hindsight, I think that was a mistake. I would have liked to have gone out there and fought '
    'for business. But hey-ho, a lot of people would say, what are you moaning about? You’ve already made '
    'it with clients.</p>'
    f'{P}Was there ever a time I seriously questioned whether it was all going to work? No, not really. '
    'It’s been just the sheer volume of work. But I just knew I had to attend to what was needed and '
    'everything would be fine. So I’ve never been there for worry.</p>'
    f'{P}It kind of dawned on me very quickly that I needed help. And obviously Julie, about a month after '
    'I left, said, “I think you probably need some help, don’t you, Robert?” Yeah, I probably did. So you '
    'see Julie very quickly. And then we moved to our first proper office. There were four of us there. '
    'There was me and Julie.</p>'

    '<h2>The secret</h2>'
    f'{P}It’s not rocket science. You just do your best, offer as good a service, look after them. And if '
    'you look after them they’ll generally be very forgiving of mistakes and stuff, because I think as '
    'long as the client knows that you’re loyal to them.</p>'
    f'{P}A long time ago, probably 25 years ago, one of the fellows who came with me from my previous '
    'practice, he said something along the lines of, “The reason we all stick by you, Robert, is because '
    'we know that you’d stick by us.”</p>'
    + Q('“One of the main reasons why clients leave is because of perceived indifference. Even if you’re '
        'not indifferent, that’s what the client perceives.”') +
    f'{P}I think I’ve always been reasonable at not giving that perceived indifference. Now don’t get me '
    'wrong, I’m pretty bad at returning calls and stuff because of the relentless workload, but when I do '
    'attend to a client, I think they do feel like they’re being properly looked after. They feel that all '
    'my focus is on them and I’ve got time for them. And over the years they have struggled sometimes to '
    'get hold of me and all the rest of it, but I think they’ve always been forgiving for that reason.</p>'
    f'{P}I think it’s probably the care element. It’s really nebulous and all the rest of it. But for '
    'instance, I like to see all my clients, I like to meet them, see them face to face, at least once a '
    'year. And you speak to other practices and they just prepare the accounts and send them out in the '
    'post and say, “Here are your accounts, if you’ve got any questions give us a call.” We don’t work '
    'like that. We call them in and discuss the accounts, catch up, if you’ve got any issues or problems. '
    'We do it all at once.</p>'
    f'{P}We care. We want to know. Even preparing the accounts. We all prepare accounts, all accountants '
    'prepare accounts, but I kind of feel that even when we do that, we don’t see it as a transactional '
    'exercise. We want to see the proper picture of those figures.</p>'
    f'{P}How would I describe the company culture? We are very client-focused, I would say. You can speak '
    'to any of the accountants and they all say the same thing. I think client care is the kind of culture '
    'that we’re supposed to be talking about.</p>'

    '<h2>Looking ahead</h2>'
    f'{P}When I first started, I think I said I liked the idea of using software and stuff. And there’s a '
    'lot more of it around now, and you’ve got to be very careful with software because you’ve still got '
    'to offer a rare client service.</p>'
    f'{P}We are still too reactive. We are still too deadline-driven. And the most important thing we can '
    'do is get on top of that. Which I feel like in the last two months we have. We’ve got better. We have '
    'started turning the corner.</p>'
    f'{P}There’s a lot of stuff we could do. We could properly segment the client base. So we know who our '
    'construction people are, we know who our employers are, we know who our retailers are, we know who '
    'our internet sellers are, who our manufacturers are. And then kind of focus on those different '
    'segments. So when there’s changes, even at its most basic, say it’s in the construction industry, '
    'we’d be able to do presentations or send out emails or phone up and say, “Oi, this is coming your '
    'way.” There’s been lots of changes in the construction industry the last few years. It would be good. '
    'We have kind of done a few seminars and stuff on CIS schemes and all the rest of it, but it needs to '
    'be more systematic.</p>'
    f'{P}So we need to become more proactive and less deadline-driven. And actually, I think we also need '
    'to find and build niches as well. So we try to become known as accountants in the care industry, or '
    'accountants in this industry, or accountants in that industry.</p>'
    + Q('“It’s called artificial intelligence. Who knows what that’s going to bring. None of us really '
        'have any idea how it is going to impact. But it’s going to be a big, big change.”') +
    f'{P}It’s going to obviously empower clients because they can speak to AI and get answers and stuff. '
    'And then they can really engage with us when they’re already in a position where they kind of know '
    'the answer and they’re just checking in. Even now we can start to see that happen. So the '
    'relationship is going to change because clients have become more empowered.</p>'
    f'{P}I can now put a legal document through ChatGPT and it’ll tell me everything about a legal '
    'document. Clients can do exactly the same with tax and stuff. So this is going to be a big, big '
    'change. It’s probably going to lean more towards we will be providing a proactive service. That’s '
    'where our value will come from. Rather than giving answers, it’ll be giving advice without them '
    'having to think about it. Being proactive.</p>'
    f'{P}It’s going to be tricky. We don’t really know. But that’s coming our way. We’re not sure what the '
    'impact’s going to be, whether it’s all a storm in a teacup or whether it’s going to have really a '
    'fundamental impact on the industry. I’d expect it to be the latter.</p>'

    '<h2>Reflections</h2>'
    f'{P}What’s my advice to someone starting their own business today? Prepare for a lot of hard work. It '
    'is very hard work. If it feels right to do it, do it. If it doesn’t, don’t do it.</p>'
    f'{P}A lot of people form their own businesses because they work for someone and they think, “Oh, I '
    'could do this better.” And then they go off and set up their business. And at the start, it’s just '
    'them working on their own. At the very start, they probably are out there looking for work and then '
    'the first few clients they can shower with love and provide an amazing service, whatever sector '
    'you’re in, because actually they’ve not got much work.</p>'
    f'{P}It kind of gets harder as you get bigger. So don’t be fooled at the start when it all seems quite '
    'easy. Because where it gets difficult is where you start employing people. And then you’re not doing '
    'two things, you’re doing three things. When you first start off, you’re doing the work and doing the '
    'sales. And then when you start employing people, you’re doing the work and doing the sales, and also '
    'you’re now trying to get other people to do the work in the same way as you. And you obviously have '
    'much less control. And that’s been all the heartache and the difficulties to start with.</p>'
    + Q('“The best thing about running your own business? Being able to bring my dogs to work.”') +
    f'{P}It just turned into doggie daycare and that’s it. Which is kind of indicative of the extra '
    'freedom you have. You’re accountable to your clients but you’re not accountable to anyone else '
    'really. So there is that sense of freedom and that sense of being able to chart your own journey. '
    'It’s hard work for the rest of it, but you do have that sense of being a little bit more focused.</p>'
    f'{P}The most important thing and the most important piece of advice that we would give to someone '
    'starting out is: don’t be too cheap. Give yourself the right value.</p>'
    f'{P}How have I personally changed as a result of running Willis Cooper? Well, it’s difficult because '
    '25 years on now and 25 years younger, so we all go through the journey of life where we change and '
    'adapt and the rest of it. And the question is how running your own business, or how running Willis '
    'Cooper, has impacted on how you’ve developed anyway. It’s very difficult because you don’t know what '
    'you would have done.</p>'
    f'{P}Who knows. It’s one of those questions where you don’t know what the alternative would be.</p>'

    '<div class="wc-post-cta">'
    f'{P}Willis Cooper celebrates 25 years in 2026. Based on an interview with Robert Cooper, March 2026.</p>'
    f'{P}You can <a href="/meet-the-team">meet the team</a>, read more '
    '<a href="/about-us">about the practice</a>, or <a href="/contact-us">get in touch</a> if you would '
    'like to talk to us about your own business.</p>'
    '</div>'
)

# ---------------------------------------------------------------------------
# 3. K2 Basecamp trek
#    Source: 02_Photos/Lucie Trip/K2 Basecamp Trek.docx (with the trip photos
#    from the same folder). Lucie's words are verbatim and in her original
#    order; the section headings, photo captions and closing note are ours.
# ---------------------------------------------------------------------------
FIG = lambda src, alt, cap, w, hgt: (
    f'<figure><img src="assets/images/{src}" alt="{alt}" width="{w}" height="{hgt}" loading="lazy">'
    f'<figcaption>{cap}</figcaption></figure>')

K2_BODY = (
    f'<p class="body wc-post-standfirst" dir="auto">Lucie MacArthur, one of our accountants, spent June '
    'trekking into the Karakoram towards K2 Basecamp. Deep snow stopped the group short of basecamp '
    'itself, but not before they reached Concordia and the mountain came into view. This is her account '
    'of the trip.</p>'

    f'{P}In June I had the opportunity to do a trek to K2 Basecamp. It is considered a strenuous trek and '
    'it certainly was although it is difficult to explain exactly why. The walking isn’t fast allowing for '
    'proper acclimatisation, It is not that hilly either although every incline is felt because of the '
    'high altitude. Walking on loose moraine and ice requires more energy than expected so the frequent '
    'breaks were welcomed. For the duration of the trek, camping is the only option so that perhaps adds '
    'to the challenge as does the lack of any washing facilities other than a plastic bowl provided by the '
    'porters. Not to mention the rather basic toilets (which on the glacier is just a dug up hole).</p>'

    '<h2>Looked after by the porters</h2>'
    f'{P}Throughout the trek we were very well looked after by our porters. But the hostile environment, '
    'water that is not safe for the visiting trekkers unless correctly purified and the change in diet '
    'means that it does not always agree with the human body. This I discovered myself on the penultimate '
    'day of the trek when I became increasingly unwell during the day until I could barely put one foot in '
    'front of the other. Eventually I reached the camp site with the help of others and collapsed in the '
    'tent. I think I will remember this day for a long time.</p>'

    '<h2>Getting to the start</h2>'
    + FIG('k2-trek-askole-camp.jpg', 'Tents pitched in a valley below the mountains at Askole',
          'The first camp, at Askole, a village high in the mountains.', 1400, 1050) +
    f'{P}Karakoram mountain range is very remote and to access the start of the trek we first had to '
    'complete a 6 to 8 hour jeep drive from Skardu to Askole, a village high in the mountains where the '
    'first camp was set up. The jeep drive itself is quite an adventure as most of it is along a rough '
    'gravel track. Further into the mountains it is often narrow and windy with a raging river on one side '
    'and a possibility of falling rocks on the other. Not for the faint hearted.</p>'

    '<h2>Onto the Baltoro Glacier</h2>'
    f'{P}The first two days of the trek was walking along the Braldu River valley. Two long days made '
    'tough thanks to a heat wave. After that we reached the Baltoro Glaciers and the temperatures became '
    'more pleasant and comfortable. The following days were spent crisscrossing the glacier but camping '
    'was on solid ground until we reached Goro 1 camp site. From here until reaching Concordia the camps '
    'were set up on ice. This was felt at night when temperatures dropped to below freezing and we were '
    'grateful for the four season sleeping bags.</p>'

    '<h2>Waist-high snow, and a first sight of K2</h2>'
    + FIG('k2-trek-deep-snow.jpg', 'Deep snow covering the glacier with a line of footprints leading away',
          'Above Goro 2 the moraine was replaced by waist high snow, and progress slowed right down.',
          1400, 1050) +
    f'{P}June is the start of the season in Karakoram and it is rare for the snow to interfere with the '
    'trekkers’ plans. Not this year. When we reached Goro 2 camp site, the moraine was replaced by waist '
    'high snow and our progress slowed down dramatically. We were not able to camp in Concordia as planned '
    'nor could we continue to K2 basecamp and cross the Gondogoro La pass. The only way back was to '
    'retrace our steps down the Baltoro Glacier to Askole village. But not before we visited Concordia to '
    'see the mighty K2. Which for me was the highlight of the trip. Since my teenage years I have been '
    'interested in climbing and to see K2, the world’s second tallest mountain (often nicknamed ‘The '
    'Killer Mountain’) was always on my wish list. Never in a million years have I imagined that I would '
    'actually achieve it.</p>'
    + FIG('k2-trek-concordia.jpg', 'K2 rising above the glacier, its summit in cloud',
          'K2 from Concordia, the highlight of the trip.', 1400, 933) +

    '<div class="wc-post-cta">'
    f'{P}Lucie MacArthur is an accountant at Willis Cooper. You can '
    '<a href="/meet-the-team">meet the rest of the team</a>, or take a look at our '
    '<a href="/careers">current vacancies</a> if you would like to join us.</p>'
    '</div>'
)

POSTS = [
    dict(
        slug='25-years-of-willis-cooper',
        title='25 years of Willis Cooper: “I took my bat and ball and off I toddled”',
        seo_title='25 Years of Willis Cooper | Robert Cooper’s story',
        description='Robert Cooper started Willis Cooper in his living room with too many clients and no '
                    'business plan. Twenty-five years on, he looks back on the practice he built.',
        date='8/13/2026', iso='2026-08-13T09:00:00.000Z',
        image='robert-cooper-25-years.jpg',
        image_alt='Robert and Julie Cooper outside the Willis Cooper office in Belper',
        body=ROBERT_BODY,
        rel_title='25 years of Willis Cooper',
        rel_blurb='Robert Cooper on starting the practice in his living room, and what he has learned in '
                  'the 25 years since.',
        rel_pages=['about-us.html', 'meet-the-team.html', 'business-advice.html'],
    ),
    dict(
        slug='mileage-rate-increase-2026',
        title='The mileage rate has finally gone up. Here’s what it means for you.',
        seo_title='Mileage rate rises to 55p per mile | Willis Cooper',
        description='The approved mileage rate has risen from 45p to 55p for the first 10,000 business '
                    'miles, the first increase since 2011. What counts and how to reclaim.',
        date='8/13/2026', iso='2026-08-13T09:30:00.000Z',
        image='mileage-rate-increase.jpg',
        image_alt='Fuel prices displayed on a petrol station forecourt sign',
        body=MILEAGE_BODY,
        rel_title='The mileage rate has gone up to 55p',
        rel_blurb='The approved mileage rate rose from 45p to 55p, backdated to April 2026. What to check '
                  'and how to reclaim.',
        rel_pages=['tax.html', 'payroll.html', 'accounting.html', 'business-advice.html'],
    ),
    dict(
        slug='k2-basecamp-trek',
        title='Camping on a glacier: Lucie’s trek towards K2 Basecamp',
        seo_title='A trek towards K2 Basecamp | Willis Cooper',
        description='Our accountant Lucie MacArthur spent June trekking into the Karakoram. Deep snow '
                    'stopped the group short of basecamp, but not before K2 itself came into view.',
        date='8/13/2026', iso='2026-08-13T10:00:00.000Z',
        image='k2-basecamp-trek.jpg',
        image_alt='Tents pitched on the moraine below snow-covered Karakoram peaks',
        body=K2_BODY,
        rel_title='Camping on a glacier: Lucie’s K2 trek',
        rel_blurb='Our accountant Lucie MacArthur on trekking into the Karakoram, and the day K2 came into '
                  'view.',
        rel_pages=['meet-the-team.html', 'careers.html'],
    ),
]
