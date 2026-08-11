<!--

Template name: Contact page

-->

<?php
wp_enqueue_style('homeStyles');
get_header();
?>

<section class="introduction">
    <div class="innerIntro">
        <div class="overlay"></div>
        <!-- This gets a background image if it is set. If not, it will get the video -->
        <?php
        // Get the background image sub field value (assumes it's the image URL)
        $background_image_url = get_field('background_image');

        // Display the <div> with the background image
        echo '<div class="imageContainer" style="opacity:0;background-image: url(' . esc_url($background_image_url) . ');"></div>';
        ?>
        <div class="wrapper">
            <div class="leftText">
                <div class="topText" style="opacity:0;transform:translateY(50px);">
                    <h1 class="revealTitle">Got a question<br> for us?</h1>
                    <?php the_content(); ?>
                </div>
                <div class="bottomText" style="opacity:0;transform:translateY(50px);">
                    <?php echo do_shortcode('[contact-form-7 id="6b6597d" title="Contact form"]'); ?>
                </div>
            </div>

        </div>
    </div>
</section>

<?php include 'dealerships.php'; ?>

<script>
    document.addEventListener('DOMContentLoaded', function() {
        // scroll down after sumbit
        (function() {
            // Delegate so it works even if CF7 re-renders parts of the form
            document.addEventListener('click', function(e) {
                const btn = e.target.closest('.wpcf7 input[type="submit"], .wpcf7 button[type="submit"]');
                if (!btn) return;

                // Small delay to let CF7 start its submit handling / keyboard settle
                setTimeout(function() {
                    window.scrollBy({
                        top: 400,
                        left: 0,
                        behavior: 'smooth'
                    });
                }, 50);
            }, true);
        })();
    });

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
            let topText = document.querySelector('.topText');
            let bottomText = document.querySelector('.bottomText');
            let imageContainer = document.querySelector('.imageContainer');
            let nav = document.querySelector('header');


            tlHome.to(topText, {
                opacity: 1,
                y: 0,
                duration: .3,
                delay: 0.1
            })
            tlHome.to(bottomText, {
                opacity: 1,
                y: 0,
                duration: .3
            })
            tlHome.to(nav, {
                y: 0,
                duration: .3
            }, "-=.3")
            tlHome.to(imageContainer, {
                opacity: 1,
                duration: 1
            }, "-=.3")

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
                    // endTrigger and end set to stop it removing the class once you go past the elements. 
                    //In other words, it doesn't reverse the transitions on the way back up.
                    endTrigger: 'html',
                    end: 'bottom top'
                })
            })

        }
    });
</script>

<?php get_footer(); ?>