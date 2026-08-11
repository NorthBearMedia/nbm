<!--

Template name: Showroom page

-->
<?php
  wp_enqueue_style('homeStyles');
?>
  
<?php get_header(); ?>

<?php include 'dynamic.php'; ?>

<!-- <section class="allResults">
    <div class="wrapper">
        <div class="filter">
            <h1 class="hugeTitle revealTitle">Filter</h1>

            <div class="filterOptions">
                <h2>Filter will go here.</h2>
            </div>
        </div>
        <div class="resultsWrapper">
            <p>Here is where the filter results will be.</p>
        </div>
    </div>
</section> -->
<?php
    // $background_image_url = get_field('man_background');
    // echo '<section class="man" style="background-image: url(' . esc_url($background_image_url) . ');">';
?>
    <!-- <div class="wrapper">
        <div class="logoWrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="607" height="113.611" viewBox="0 0 607 113.611"><g transform="translate(-22.126 -91.497)"><path d="M437.969,205.108V91.5H494.3l79.122,50.951V91.5h55.7V205.108H569.943L498.735,155.74v49.368Zm-217.411,0L296.2,91.5h62.663l74.05,113.611H368.352l-10.442-11.39H294.294l-9.18,11.39H220.558Zm93.358-41.458H338.28L325.628,139.6,313.916,163.65ZM22.126,205.108V91.5H80.67l37.66,43.038L158.522,91.5h55.7V205.108H156.311V163.967L119.6,199.1,80.356,163.967v41.141H22.126Z" transform="translate(0 0)" fill="#2f3b48" fill-rule="evenodd"/></g></svg>
        </div>
        <div class="buttons">
            <a href="https://www.man.eu/uk/en/homepage.html" target="_blank" class="button">
                MAN site
                <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="33.901" height="32.972" viewBox="0 0 33.901 32.972"><g transform="translate(1.5 16.486) rotate(-45)"><g transform="translate(4.765 4.765)"><path d="M16.646,0V16.646H0" fill="none" stroke="#1f2125" stroke-width="3"/></g><g transform="translate(0 0)"><path d="M21.193,21.193,0,0" fill="none" stroke="#1f2125" stroke-width="3"/></g></g></svg>
            </a>
            <a href="<?php // echo esc_url( home_url( '/' ) ); ?>contact" class="button">
                Contact us
                <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="33.901" height="32.972" viewBox="0 0 33.901 32.972"><g transform="translate(1.5 16.486) rotate(-45)"><g transform="translate(4.765 4.765)"><path d="M16.646,0V16.646H0" fill="none" stroke="#1f2125" stroke-width="3"/></g><g transform="translate(0 0)"><path d="M21.193,21.193,0,0" fill="none" stroke="#1f2125" stroke-width="3"/></g></g></svg>
            </a>
        </div>
    </div>
</section> -->
<section class="threePageLinks">
    <div class="wrapper">
        <?php if( have_rows('page_link_item') ): ?>
            <div class="linksWrap">
                <?php while( have_rows('page_link_item') ): the_row(); ?>                    
                    <div class="link onScreen fadeUp" style="background-image:url(<?php the_sub_field('background_image'); ?>;">
                        <div class="overlay"></div>
                        <h3><?php the_sub_field('page_title'); ?></h3>
                        <div class="desc">
                            <?php the_sub_field('page_description'); ?>
                        </div>
                        <div class="buttonWrap">
                            <a class="arrowButton" href="<?php the_sub_field('page_link'); ?>">
                                <span><?php the_sub_field('button_text'); ?></span>
                                <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="32.694" height="31.972" viewBox="0 0 32.694 31.972"><g transform="translate(1 15.986) rotate(-45)"><g transform="translate(4.765 4.765)"><path d="M16.646,0V16.646H0" transform="translate(0 0)" fill="none" stroke="#e8e8e8" stroke-width="2"/></g><g transform="translate(0 0)"><path d="M21.193,21.193,0,0" fill="none" stroke="#e8e8e8" stroke-width="2"/></g></g></svg>
                                <svg preserveAspectRatio="none" class="bg" xmlns="http://www.w3.org/2000/svg" width="176" height="61" viewBox="0 0 176 61"><g fill="none" stroke="#ed4133" stroke-width="2"><rect width="176" height="61" rx="10" stroke="none"/><rect x="1" y="1" width="174" height="59" rx="9" fill="none"/></g></svg>    
                            </a>
                        </div>
                    </div>
                <?php endwhile; ?>
            </div>
        <?php endif; ?>
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

        var tlHome = gsap.timeline({ease: "power3"})
        let h1 = document.querySelector('.introduction .innerIntro h1');
        let h2 = document.querySelector('.introduction .innerIntro h2');
        let select = document.querySelector('.introduction .innerIntro .select');
        let buttonsWrap = document.querySelector('.introduction .innerIntro .buttonsWrap');
        let downWrapper = document.querySelector('.introduction .innerIntro .downWrapper');
        let topBG = document.querySelector('.topBG');
        let nav = document.querySelector('header');


        tlHome.to(h1, {opacity:1, y:0, duration: .3, delay: 0.1})
        tlHome.to(h2, {opacity:1, y:0, duration: .3}, "-=.3")
        tlHome.to(select, {opacity:1, y:0, duration: .3}, "-=.2")
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