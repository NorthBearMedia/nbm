<!--

Template name: About Us page

-->
<?php
  wp_enqueue_style('homeStyles');
?>
  
<?php get_header(); ?>

<?php include 'dynamic.php'; ?>
    <section class="twoColumns topColumn" style="background-color: #2B2E34;">
        <div class="wrapper aligncenter">
            <div class="column textWrapper onScreen fadeUp">
                <?php the_field('man_dealership'); ?>
            </div>
            <?php if( get_field('man_image') ) { 
            $man_image = get_field('man_image'); 
            $man_image_Size = 'full';
            } ?>
            <div class="column">
                <div class="imageWrapper onScreen fadeIn">
                    <img src="<?php echo $man_image['sizes']['full']; ?>" width="<?php echo $man_image['sizes']['full-width']; ?>" height="<?php echo $man_image['sizes']['full-height']; ?>" alt="<?php echo $man_image['alt']; ?>" />
                </div>
            </div>
        </div>
    </section>
    <section class="twoColumns lastColumn" style="background-color: #2B2E34;">
        <div class="wrapper aligncenter Reverse">
            <?php if( get_field('history_image') ) { 
            $history_image = get_field('history_image'); 
            $history_image_Size = 'full';
            } ?>
            <div class="column">
                <div class="imageWrapper onScreen fadeIn">
                    <img src="<?php echo $history_image['sizes']['full']; ?>" width="<?php echo $history_image['sizes']['full-width']; ?>" height="<?php echo $history_image['sizes']['full-height']; ?>" alt="<?php echo $history_image['alt']; ?>" />
                </div>
            </div>
            <div class="column textWrapper onScreen fadeUp">
                <?php the_field('history'); ?>
            </div>
        </div>
    </section>
<div class="sponsorWrap">
    <section class="sponsorships">
        <div class="wrapper">
            <div class="sponsorIntro">
                <div class="titleWrapper">
                    <h2 class=""><?php the_field('sponsorships_title'); ?></h2>
                </div>
                <div class="text largeText onScreen fadeUp">
                    <?php the_field('sponsorships_intro'); ?>
                </div>
            </div>
        </div>
    </section>
    
    <?php if( have_rows('sponsors') ): ?>
        <section class="allAccordions">
            <div class="wrapper">
                <?php while( have_rows('sponsors') ): the_row(); ?>
                    <div class="accordionWrapper">
                        <div class="accordionInner">
                            <h3 class="accordion">
                                <div class="svg"></div>    
                                <span class="revealTitle"><?php the_sub_field('accordion_item_title'); ?></span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" style="enable-background:new 0 0 56 56" xml:space="preserve"><path style="fill:none;stroke:#fff;stroke-width:6" d="m-6.9 18.2 36.5-36.4" transform="rotate(45 -14.142 34.143)"/></svg>
                            </h3>
                            <div class="panel">
                                <div class="bg">
                                    <svg class="logoBG" xmlns="http://www.w3.org/2000/svg" width="957.242" height="1329.179" viewBox="0 0 957.242 1329.179"><g transform="translate(-45.879 -2410.069)"><path d="M1296.1,838.651,1181.681,1198.8a21.3,21.3,0,0,1-20.3,14.849H895.628a21.29,21.29,0,0,1-20.293-27.74l80.848-254.38c19.074-60.033-25.725-121.277-88.707-121.277H723.946c-172.436,0-100.126-143.873-65.728-252.05L772.652,198.195A21.321,21.321,0,0,1,792.96,183.35h265.748A21.308,21.308,0,0,1,1079,211.11L998.15,465.47c-19.086,60.017,25.725,121.273,88.7,121.273h143.542c172.566,0,100.111,143.738,65.716,251.908" transform="translate(-337.755 2226.719)" fill="#5f40e2"/><path d="M580.19,992.909H835.162a26.474,26.474,0,0,0,25.2-18.389L1033.627,432.9a51.26,51.26,0,0,0-48.821-66.892H818.88a103.331,103.331,0,0,0-98.473,72.032l-165.434,520.4a26.46,26.46,0,0,0,25.218,34.468" transform="translate(-507.834 2746.339)" fill="#5f40e2"/></g></svg>
                                </div>
                                <div class="content">
                                    <?php the_sub_field('accordion_item_desciption'); ?>

                                    <div class="socials">
                                        <?php if( get_sub_field('facebook') ) { ?>
                                            <a href="<?php the_sub_field('facebook'); ?>" target="_blank">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><g transform="translate(-1646 -4100)"><g transform="translate(1646 4100)"><rect width="40" height="40" rx="10" fill="#fbfbfb"></rect></g><g transform="translate(1583.873 4109.263)"><path d="M77.049,11.438H79.4v9.691a.346.346,0,0,0,.346.346h3.991a.346.346,0,0,0,.346-.346V11.484h2.706a.346.346,0,0,0,.344-.307l.411-3.568a.346.346,0,0,0-.344-.386H84.088V4.986c0-.674.363-1.016,1.079-1.016H87.2a.346.346,0,0,0,.346-.346V.349A.346.346,0,0,0,87.2,0H84.4c-.02,0-.064,0-.129,0a5.382,5.382,0,0,0-3.52,1.327,3.691,3.691,0,0,0-1.227,3.281V7.223H77.049a.346.346,0,0,0-.346.346v3.522A.346.346,0,0,0,77.049,11.438Z" fill="#6f49f6"></path></g></g></svg>
                                            </a>
                                        <?php } ?>
                                        <?php if( get_sub_field('instagram') ) { ?>
                                            <a href="<?php the_sub_field('instagram'); ?>" target="_blank">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><g transform="translate(-1766 -4100)"><rect width="40" height="40" rx="10" transform="translate(1766 4100)" fill="#fbfbfb"></rect><g transform="translate(1774.036 4108.036)"><path d="M11.7,2.109c3.125,0,3.495.012,4.729.068a6.477,6.477,0,0,1,2.173.4,3.626,3.626,0,0,1,1.346.875A3.625,3.625,0,0,1,20.825,4.8a6.476,6.476,0,0,1,.4,2.173c.056,1.234.068,1.6.068,4.729s-.012,3.495-.068,4.729a6.476,6.476,0,0,1-.4,2.173A3.875,3.875,0,0,1,18.6,20.825a6.476,6.476,0,0,1-2.173.4c-1.234.056-1.6.068-4.729.068s-3.495-.012-4.729-.068a6.475,6.475,0,0,1-2.173-.4,3.625,3.625,0,0,1-1.346-.875A3.625,3.625,0,0,1,2.58,18.6a6.476,6.476,0,0,1-.4-2.173c-.056-1.234-.068-1.6-.068-4.729s.012-3.495.068-4.729A6.476,6.476,0,0,1,2.58,4.8a3.625,3.625,0,0,1,.875-1.346A3.626,3.626,0,0,1,4.8,2.58a6.476,6.476,0,0,1,2.173-.4c1.234-.056,1.6-.068,4.729-.068M11.7,0C8.524,0,8.126.013,6.877.07A8.59,8.59,0,0,0,4.037.614a5.736,5.736,0,0,0-2.073,1.35A5.736,5.736,0,0,0,.614,4.037,8.59,8.59,0,0,0,.07,6.877C.013,8.126,0,8.524,0,11.7s.013,3.577.07,4.825a8.59,8.59,0,0,0,.544,2.841,5.736,5.736,0,0,0,1.35,2.073,5.736,5.736,0,0,0,2.073,1.35,8.59,8.59,0,0,0,2.841.544c1.248.057,1.647.07,4.825.07s3.577-.013,4.825-.07a8.59,8.59,0,0,0,2.841-.544,5.984,5.984,0,0,0,3.422-3.422,8.59,8.59,0,0,0,.544-2.841c.057-1.248.07-1.647.07-4.825s-.013-3.577-.07-4.825a8.59,8.59,0,0,0-.544-2.841,5.736,5.736,0,0,0-1.35-2.073A5.736,5.736,0,0,0,19.368.614,8.59,8.59,0,0,0,16.527.07C15.279.013,14.88,0,11.7,0Zm0,5.693A6.009,6.009,0,1,0,17.711,11.7,6.009,6.009,0,0,0,11.7,5.693Zm0,9.91a3.9,3.9,0,1,1,3.9-3.9A3.9,3.9,0,0,1,11.7,15.6ZM19.353,5.456a1.4,1.4,0,1,1-1.4-1.4A1.4,1.4,0,0,1,19.353,5.456Z" fill="#6f49f6"></path></g></g></svg>
                                            </a>
                                        <?php } ?>

                                    </div>
                                </div>
                                <?php $accordion_image = get_sub_field('accordion_item_image'); ?>
                                <div class="imageWrapper">
                                    <img src="<?php echo $accordion_image['sizes']['full']; ?>" width="<?php echo $accordion_image['sizes']['full-width']; ?>" height="<?php echo $accordion_image['sizes']['full-height']; ?>" alt="<?php echo $accordion_image['alt']; ?>" />
                                </div>
                            </div>
                        </div>
                    </div>
                <?php endwhile; ?>
            </div>
        </section>
    <?php endif; ?> 
</div>

<script>
    // Get the elements
    const playButton = document.querySelector('.playButton');
    const video = document.querySelector('.embed-container video');
    let isPlaying = false; // Variable to track the play state

    // Set initial volume and fade duration
    var initialVolume = 1;
    var fadeDuration = 1000; // 1 second in milliseconds   
    var fadeStep = 0.05; // Volume increment per step
    var fadeInterval = 50; // 0.05 seconds in milliseconds

    // Set initial video volume
    video.volume = 0;

    // Add a click event listener to the play button
    playButton.addEventListener('click', function() {
        playButton.classList.toggle('invisible');
        
        if (!isPlaying) {
            fadeInVolume();
            video.play();
            isPlaying = true;
        } else {
            fadeOutVolume();
            video.pause();
            isPlaying = false;
        }
    });

    // Function to fade in volume from 0 to 1
    function fadeInVolume() {
        var currentVolume = 0.00;
        console.log("Playing - Fading in");
        
        function updateVolume() {
            if (currentVolume < initialVolume) {
                currentVolume += fadeStep;
                if (currentVolume > initialVolume) {
                    currentVolume = initialVolume;
                }
                video.volume = currentVolume;
                setTimeout(updateVolume, fadeInterval);
            }
        }
        
        updateVolume();
    }

    // Function to fade out volume from 1 to 0
    function fadeOutVolume() {
        var currentVolume = video.volume;
        console.log("Pausing - Fading out");
        
        function updateVolume() {
            if (currentVolume > 0.00) {
                currentVolume -= fadeStep;
                if (currentVolume < 0.00) {
                    currentVolume = 0.00;
                }
                video.volume = currentVolume;
                setTimeout(updateVolume, fadeInterval);
            }
        }
        
        updateVolume();
    }
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