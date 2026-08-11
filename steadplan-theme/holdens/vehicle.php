<!--

Template name: Vehicle page

-->
<?php
wp_enqueue_style('homeStyles');
?>

<?php get_header(); ?>

<section class="galleryArea">
    <div class="wrapper">
        <div class="gallery">
            <h2>Gallery going here</h2>
        </div>
        <div class="rightPanel">
            <div class="price">
                <span>£46,363 + VAT</span>
            </div>
            <div class="tradeIn">
                <span>Trade in form</span>
            </div>
            <div class="offer">
                <span>Make an offer</span>
            </div>
        </div>
    </div>
</section>


<section class="tabsArea">
    <div class="wrapper">
        <div class="tabset">
            <!-- Tab 1 -->
            <input type="radio" name="tabset" id="tab1" aria-controls="overview" checked>
            <label for="tab1">Overview</label>
            <!-- Tab 2 -->
            <input type="radio" name="tabset" id="tab2" aria-controls="specs">
            <label for="tab2">Specs</label>
            <!-- Tab 3 -->
            <input type="radio" name="tabset" id="tab3" aria-controls="running">
            <label for="tab3">Running Costs</label>
            <!-- Tab 4 -->
            <input type="radio" name="tabset" id="tab4" aria-controls="location">
            <label for="tab4">Location</label>


            <div class="tab-panels">
                <div id="overview" class="tab-panel">
                    <h2>Overview</h2>
                    <h3>Spec Example</h3>
                    <p><strong>Overall Impression:</strong> An elegant, malty German amber lager with a clean, rich, toasty and bready malt flavor, restrained bitterness, and a dry finish that encourages another drink. The overall malt impression is soft, elegant, and complex, with a rich aftertaste that is never cloying or heavy.</p>
                    <p><strong>History:</strong> As the name suggests, brewed as a stronger “March beer” in March and lagered in cold caves over the summer. Modern versions trace back to the lager developed by Spaten in 1841, contemporaneous to the development of Vienna lager. However, the Märzen name is much older than 1841; the early ones were dark brown, and in Austria the name implied a strength band (14 °P) rather than a style. The German amber lager version (in the Viennese style of the time) was first served at Oktoberfest in 1872, a tradition that lasted until 1990 when the golden Festbier was adopted as the standard festival beer.</p>
                </div>
                <div id="specs" class="tab-panel">
                    <h2>Specs</h2>
                    <h3>Spec Example</h3>
                    <p><strong>Overall Impression:</strong> An elegant, malty German amber lager with a balanced, complementary beechwood smoke character. Toasty-rich malt in aroma and flavor, restrained bitterness, low to high smoke flavor, clean fermentation profile, and an attenuated finish are characteristic.</p>
                    <p><strong>History:</strong> A historical specialty of the city of Bamberg, in the Franconian region of Bavaria in Germany. Beechwood-smoked malt is used to make a Märzen-style amber lager. The smoke character of the malt varies by maltster; some breweries produce their own smoked malt (rauchmalz).</p>
                </div>
                <div id="running" class="tab-panel">
                    <h2>Running costs</h2>
                    <p><strong>Overall Impression:</strong> A dark, strong, malty German lager beer that emphasizes the malty-rich and somewhat toasty qualities of continental malts without being sweet in the finish.</p>
                    <p><strong>History:</strong> Originated in the Northern German city of Einbeck, which was a brewing center and popular exporter in the days of the Hanseatic League (14th to 17th century). Recreated in Munich starting in the 17th century. The name “bock” is based on a corruption of the name “Einbeck” in the Bavarian dialect, and was thus only used after the beer came to Munich. “Bock” also means “Ram” in German, and is often used in logos and advertisements.</p>
                </div>
            </div>
        </div>
    </div>
</section>

<section class="contactForm">
    <div class="bg onScreen"></div>
    <div class="wrapper">
        <div class="textWrapper">
            <div class="titleWrapper">
                <h2>Enquire online now</h2>
            </div>
            <div class="formWrapper">
                <?php echo do_shortcode('[contact-form-7 id="5" title="Contact form"]'); ?>
            </div>
            <div class="rightSide">

            </div>
        </div>
    </div>
</section>

<script>
    gsap.registerPlugin(ScrollTrigger);

    // get different breakpoints based on datasets in body tag

    var body = document.querySelector('body');

    var mobileBP = body.dataset.breakpointMobile,
        largemobileBP = body.dataset.breakpointLargemobile,
        tabletBP = body.dataset.breakpointTablet,
        desktopBP = body.dataset.breakpointDesktop;
    largedesktopBP = body.dataset.breakpointLargedesktop;

    ScrollTrigger.matchMedia({

        // desktop
        [largedesktopBP]: function() {

        },

        // desktop
        [desktopBP]: function() {

        },

        // tablet
        [tabletBP]: function() {

        },

        // above mobile
        [largemobileBP]: function() {

        },
        // mobile
        [mobileBP]: function() {

        },

        // all 
        "all": function() {

            var tlHome = gsap.timeline({
                ease: "power3"
            })
            let h1 = document.querySelector('.introduction .innerIntro h1');
            let h2 = document.querySelector('.introduction .innerIntro h2');
            let select = document.querySelector('.introduction .innerIntro .select');
            let buttonsWrap = document.querySelector('.introduction .innerIntro .buttonsWrap');
            let downWrapper = document.querySelector('.introduction .innerIntro .downWrapper');
            let topBG = document.querySelector('.topBG');
            let nav = document.querySelector('header');


            tlHome.to(h1, {
                opacity: 1,
                y: 0,
                duration: .3,
                delay: 0.1
            })
            tlHome.to(h2, {
                opacity: 1,
                y: 0,
                duration: .3
            }, "-=.3")
            tlHome.to(select, {
                opacity: 1,
                y: 0,
                duration: .3
            }, "-=.2")
            tlHome.to(buttonsWrap, {
                opacity: 1,
                y: 0,
                duration: .3
            }, "-=.2")
            tlHome.to(downWrapper, {
                opacity: 1,
                y: 0,
                duration: .3
            }, "-=.2")
            tlHome.to(nav, {
                y: 0,
                duration: .3
            }, "-=.3")
            tlHome.to(topBG, {
                opacity: 1,
                duration: 1
            })


            // add class to each item - repeats on scroll back

            const revealText = gsap.utils.toArray('.onScreen');
            revealText.forEach((sec, i) => {
                ScrollTrigger.create({
                    trigger: sec,
                    toggleClass: 'active',
                    invalidateOnRefresh: true,
                    start: 'top 99%',
                    scrub: 1,
                    toggleActions: "start none none none",
                    once: true,
                    endTrigger: 'html',
                    end: 'bottom top'
                })
            })

            // move waves right
            function moveRight() {
                gsap.utils.toArray(".moveRight").forEach(function(elem) {
                    gsap.to(elem, {
                        x: "100px",
                        autoAlpha: 1,
                        scrollTrigger: {
                            start: "top 95%",
                            end: "bottom top",
                            invalidateOnRefresh: true,
                            toggleActions: "play none none reverse",
                            trigger: elem,
                            scrub: 1
                        }
                    });
                });
            }
            moveRight();

            // move waves right
            function moveLeft() {
                gsap.utils.toArray(".moveLeft").forEach(function(elem) {
                    gsap.to(elem, {
                        x: "-100px",
                        autoAlpha: 1,
                        scrollTrigger: {
                            start: "top 95%",
                            end: "bottom top",
                            invalidateOnRefresh: true,
                            toggleActions: "play none none reverse",
                            trigger: elem,
                            scrub: 1
                        }
                    });
                });
            }
            moveLeft();

        }

    });
</script>

<?php get_footer(); ?>