<!--

Template name: Framework page

-->


<?php
  wp_enqueue_style('homeStyles');
  wp_enqueue_style('slickSlider');
?>
<?php get_header(); ?>

<?php include 'dynamic.php'; ?>

<script>

    gsap.registerPlugin(ScrollTrigger);

    // this gets all revealTitles and brings them all in a letter at a time with a delay on each .char
    // I have used this on all titles and also the titles with an arrow, also giving the arrow .char class to include that like a letter
    const splitTitle = new SplitType(".revealTitle");

    gsap.set('.char:not(.introduction .char)', { opacity: 0, y: 100 }); // Initial state of items, hidden and positioned off-screen

    ScrollTrigger.batch('.char:not(.introduction .char)', {
        onEnter: batch => {
            gsap.to(batch, {
                opacity: 1,
                y: 0,
                stagger: 0.05,
                duration: 0.1
            });
        },
        start: 'top 99%', // Adjust the threshold as per your needs
        end: '+=100', // Adjust the distance after which the animation should stop
        once: true // Animation will only trigger once when entering the screen
    });

    // End of the revealTitles
    
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
        
        var tlHome = gsap.timeline({ease: "power3"})
        let overlayTop = document.querySelector('.whiteOverlay .top');
        let overlayBottom = document.querySelector('.whiteOverlay .bottom');
        let openingTitleLetters = document.querySelectorAll('.massiveTitle .line .char');
        let leftTitle = document.querySelector('.massiveTitle .leftTitle');
        let rightTitle = document.querySelector('.massiveTitle .rightTitle');
        let fullServ = document.querySelector('.fullServ');
        let overlay = document.querySelector('.innerIntro .overlay');
        let nav = document.querySelector('.nav');
        let navWrapper = document.querySelector('.nav .wrapper');
        let secondSection = document.querySelector('.homeWork');


        // tlHome.to(overlayTop, {backgroundColor: "#101010", duration: .5, delay: 2.6})
      
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