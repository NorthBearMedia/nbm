<!--

Template name: All Vans page

-->
<?php
  wp_enqueue_style('homeStyles');
  get_header();
?>

<section class="allResults">
    <div class="wrapper">
        <div class="filter">
            <h1 class="hugeTitle revealTitle">Filter</h1>

            <div class="filterOptions">
                <!-- HTML form elements -->
                <select id="make">
                    <option value="">All Makes</option>
                    <option value="MAN">MAN</option>
                    <!-- add more options -->
                </select>
                <!-- Other filters like model, fuelType, etc. -->
            </div>
        </div>
        <div class="resultsWrapper" id="vehicleList"> <!-- Add id for AJAX update -->
            <!-- Data will be inserted here by AJAX -->
        </div>
    </div>
</section>

<script>
  
  // Existing code for GSAP, ScrollTrigger, etc.
    // ...

    // Function to load vehicles based on selected make
    function loadVehicles(selectedMake = "") {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '<?php echo get_template_directory_uri(); ?>/filter_vehicles.php', true);
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        
        xhr.onload = function() {
            if (this.status == 200) {
                // Update your vehicle list here
                document.getElementById("vehicleList").innerHTML = this.responseText;
            }
        };
        
        xhr.send(`make=${selectedMake}`);
    }

    // Load all vehicles on initial page load
    loadVehicles();

    // JavaScript to detect changes and send AJAX request for the "make" dropdown
    document.getElementById("make").addEventListener("change", function() {
        loadVehicles(this.value);
    });

    // Existing code for GSAP, ScrollTrigger, etc.
    // ...


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