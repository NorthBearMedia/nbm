<?php get_header(); ?>
<?php
  wp_enqueue_style('aboutStyles');
?>
<section class="intro">
    <div class="wrapper">
        <div class="titleWrapper">
            <h1 class="massiveTitle revealTitle">404 - page not found.</h1>
        </div>
        <div class="mainText" style="opacity:0;transform:translateY(50px);">
            <div class="content">
                <p>Looks like you're lost!</p>
                <p>The page you are looking for has either been moved, deleted or does not exist. Please use the navigation menu to get back on track.</p>
            </div>
        </div>
    </div>
</section>

    <script>
    gsap.registerPlugin(ScrollTrigger);

        const splitTitle = new SplitType(".revealTitle");

        gsap.set('.char:not(.introduction .char)', { opacity: 0, y: 120 }); // Initial state of items, hidden and positioned off-screen

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
            let openingTitleLetters = document.querySelectorAll('.massiveTitle .revealTitle .line .char');
            let content = document.querySelector('.mainText');
            let navWrapper = document.querySelector('.nav .wrapper');
    
            tlHome.to(openingTitleLetters, {y:0, duration: .5, stagger: .03}) 
            tlHome.to(content, {opacity:1, y:0, duration: .5})
            tlHome.to(navWrapper, {y:0, duration: .5}, "-=1")

        },

        // desktop
        [desktopBP]: function() {
          
        },

        // tablet
        [tabletBP]: function() {
            var tlHome = gsap.timeline({ease: "power3"})
        
        },

        // above mobile
        [largemobileBP]: function() {
         

        },
        // mobile
        [mobileBP]: function() {
          
        }

   
        });
    </script>

<?php get_footer(); ?>