<!--

Template name: Home page

-->
<?php
  wp_enqueue_style('homeStyles');
  wp_enqueue_style('slickSlider');
?>
<?php get_header(); ?>

<?php include 'dynamic.php'; ?>

<script>

    jQuery(document).ready(function($) {
        var logosWrapper = $('.logosWrapper.infinite-loop');
        var logosSlide = logosWrapper.find('.logos-slide');
        var logosTotal = logosSlide.length;
        var scrollSpeed = 2000; // Adjust the scroll speed (in milliseconds)

        function startInfiniteLoop() {
            setInterval(function() {
                var firstLogo = logosWrapper.find('.logos-slide:first');
                var logoWidth = firstLogo.outerWidth();

                logosWrapper.animate({ 'margin-left': -logoWidth + 'px' }, scrollSpeed, function() {
                    logosWrapper.css('margin-left', 0);
                    firstLogo.appendTo(logosWrapper);
                });
            }, scrollSpeed);
        }

        if (logosTotal > 1) {
            // Clone the logos to create the infinite loop effect
            logosSlide.clone().appendTo(logosWrapper);

            // Start the infinite loop
            startInfiniteLoop();
        }
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

        var tlHome = gsap.timeline({ease: "power3"})
        let h1 = document.querySelector('.introduction .innerIntro h1');
        let h2 = document.querySelector('.introduction .innerIntro h2');
        let select = document.querySelector('.introduction .innerIntro .select');
        let buttonsWrap = document.querySelector('.introduction .innerIntro .buttonsWrap');
        let downWrapper = document.querySelector('.introduction .innerIntro .downWrapper');
        let topBG = document.querySelectorAll('.topBG');
        let nav = document.querySelector('header');


        tlHome.to(h1, {opacity:1, y:0, duration: .3, delay: 0.1})
        tlHome.to(h2, {opacity:1, y:0, duration: .3}, "-=.3")
        // tlHome.to(select, {opacity:1, y:0, duration: .3}, "-=.2")
        tlHome.to(buttonsWrap, {opacity:1, y:0, duration: .3}, "-=.2")
        tlHome.to(downWrapper, {opacity:1, y:0, duration: .3}, "-=.2")
        tlHome.to(nav, {y:0, duration: .3}, "-=.3")
        tlHome.to(topBG, {opacity:1, duration: 1})


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

          // move waves right
          function moveRight() {
            gsap.utils.toArray(".moveRight").forEach(function (elem) {
              gsap.to(elem, {
                x: "100px",
                autoAlpha: 1,
                scrollTrigger: {
                  start: "top 95%",
                  end: "bottom top",
                  invalidateOnRefresh: true,
                  toggleActions:"play none none reverse",
                  trigger: elem,
                  scrub: 1
                }
              });
            });
          }
          moveRight();

          // move waves right
          function moveLeft() {
            gsap.utils.toArray(".moveLeft").forEach(function (elem) {
              gsap.to(elem, {
                x: "-100px",
                autoAlpha: 1,
                scrollTrigger: {
                  start: "top 95%",
                  end: "bottom top",
                  invalidateOnRefresh: true,
                  toggleActions:"play none none reverse",
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