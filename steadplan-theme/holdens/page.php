<?php
wp_enqueue_style('homeStyles');
get_header();
?>

<?php include 'dynamic.php'; ?>


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
                delay: .3
            })
            tlHome.to(h2, {
                opacity: 1,
                y: 0,
                duration: .3
            }, "-=.3")
            // tlHome.to(select, {opacity:1, y:0, duration: .3}, "-=.2")
            // tlHome.to(buttonsWrap, {opacity:1, y:0, duration: .3}, "-=.2")
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


        }
    });
</script>

<?php get_footer(); ?>