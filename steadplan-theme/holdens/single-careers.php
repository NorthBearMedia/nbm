<?php 
    // Enqueue styles before get_header()
    function enqueue_single_career_styles() {
        wp_enqueue_style('homeStyles');
        wp_enqueue_style('blogStyles');
    }
    add_action('wp_enqueue_scripts', 'enqueue_single_career_styles', 20);
    
    get_header();
?>

<style>
    header .nav .topNav .headerMenu ul li.current_page_item > a::after, header .nav .topNav .headerMenu ul li.current_page_parent > a::after {
        border-color: transparent;
    }
    header .nav .topNav .headerMenu ul li.menu-item-1368 > a::after {
        width: calc(100% + 22px)!important;
        border-color: #ED4233!important;
        opacity: 1;
        border-radius: 10px;
    }
</style>
      
<?php if ( have_posts() ) : ?>
    <?php while ( have_posts() ) : the_post(); ?>
    
    <div class="singlePage careerPage">
        <!-- <img class="pageBG moveRight" src="<?php // echo get_template_directory_uri(); ?>/images/greyBG.png" alt="Steadplan"> -->
        <section class="oneColText pureText onScreen">
            <div class="wrapper">
                <div class="titleWrapper">
                    <a class="backTo" href="/careers" style="transform:translateX(50px);opacity:0;"><svg xmlns="http://www.w3.org/2000/svg" width="35.26" height="35.261" viewBox="0 0 35.26 35.261"><g transform="translate(1.5 1.061)"><g transform="translate(0 7.277)"><path d="M-38.209,0V25.423h25.422" transform="translate(38.209)" fill="none" stroke="#6f49f6" stroke-width="3"/></g><g transform="translate(0.332 0)"><path d="M-48.646-16.278l32.367-32.368" transform="translate(48.646 48.646)" fill="none" stroke="#6f49f6" stroke-width="3"/></g></g></svg> Back to Careers</a>
                    <h1 class="entry-title revealTitle"><?php the_title(); ?></h1>          
                </div>                
                <div class="leftSide" style="transform:translateY(50px);opacity:0;">
                    <?php the_content(); ?>
                    <div class="benefits">
                        <h2>Benefits</h2>
                        <?php the_field('benefits'); ?>
                    </div>
                    <div class="apply">
                        <!-- <a class="arrowButton" href="<?php // the_field('application_link'); ?>" target="_blank"> -->
                        
                        <a class="arrowButton" href="mailto:slowe@steadplan.co.uk?subject=Job Application: <?php echo rawurlencode(get_the_title()); ?>">
                            <span>Apply</span>
                            <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="32.694" height="31.972" viewBox="0 0 32.694 31.972"><g transform="translate(1 15.986) rotate(-45)"><g transform="translate(4.765 4.765)"><path d="M16.646,0V16.646H0" transform="translate(0 0)" fill="none" stroke="#2B2E34" stroke-width="2"/></g><g transform="translate(0 0)"><path d="M21.193,21.193,0,0" fill="none" stroke="#2B2E34" stroke-width="2"/></g></g></svg>
                            <svg preserveAspectRatio="none" class="bg" xmlns="http://www.w3.org/2000/svg" width="176" height="61" viewBox="0 0 176 61"><g fill="none" stroke="#6F49F6" stroke-width="2"><rect width="176" height="61" rx="10" stroke="none"/><rect x="1" y="1" width="174" height="59" rx="9" fill="none"/></g></svg>    
                        </a>
                    </div>
                </div>
                <div class="rightSide" style="transform:translateX(-50px);opacity:0;">
                    <ul class="details">
                        <?php if( get_field('location') ): ?>
                            <li>Location</li>
                            <li><?php the_field('location'); ?></li>
                        <?php endif; ?>
                        <?php if( get_field('working_hours') ): ?>
                            <li>Work Hours</li>
                            <li><?php the_field('working_hours'); ?></li>
                        <?php endif; ?>
                        <?php if( get_field('full_or_part_time') ): ?>
                            <li>Job Type</li>
                            <li><?php the_field('full_or_part_time'); ?></li>
                        <?php endif; ?>
                        <?php if( get_field('salary') ): ?>
                            <li>Salary</li>
                            <li><?php the_field('salary'); ?></li>
                        <?php endif; ?>
                    </ul>
                </div>
            </div>
        </section>

    </div>

    <?php endwhile; wp_reset_query(); ?>
<?php endif; ?>


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
            let backTo = document.querySelector('.backTo');
            let h1 = document.querySelector('h1');
            let leftSide = document.querySelector('.leftSide');
            let rightSide = document.querySelector('.rightSide');
            let nav = document.querySelector('header');


            tlHome.to(h1, {opacity:1, y:0, duration: .3, delay: 0.1})
            tlHome.to(backTo, {opacity:1, x:0, duration: .3}, "-=.3")
            tlHome.to(leftSide, {opacity:1, y:0, duration: .3}, "-=.3")
            tlHome.to(nav, {y:0, duration: .3}, "-=.3")
            tlHome.to(rightSide, {x: 0, opacity:1, duration: .3}, "-=.3")


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
                    x: "-300px",
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

        }

    });

</script>

<?php get_footer(); ?>
