<!--

Template name: What We Do page

-->
<?php
  wp_enqueue_style('whatWeDoStyles');
?>
<?php get_header(); ?>

<?php include 'dynamic.php'; ?>

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


    // add class to each item - repeats on scroll back
                                                        
    const revealText = gsap.utils.toArray('.onScreen');
        revealText.forEach((sec, i) => {
            ScrollTrigger.create({
            trigger: sec,
            toggleClass: 'active',
            invalidateOnRefresh: true,
            start: 'top 99%',
            scrub:1,
            toggleActions:"start none none none",
            once: true,
            endTrigger: 'html',
            end: 'bottom top'
            })
        })

    }

});


</script>
  
<?php get_footer(); ?>