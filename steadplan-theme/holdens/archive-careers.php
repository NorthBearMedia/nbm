<!--

Template for Careers archive page

-->
<?php
    // Enqueue styles before get_header()
    function enqueue_careers_styles() {
        wp_enqueue_style('homeStyles');
    }
    add_action('wp_enqueue_scripts', 'enqueue_careers_styles', 20);
    
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

<section class="twoColumns">
    <div class="wrapper aligncenter">
        <?php $intro_image = get_field('intro_image', 1355); ?>
        <div class="column textWrapper onScreen fadeUp">
            <h1 class="revealTitle">Driving your career further.</h1>
            <div class="contentWrap">
                <?php the_field('main_intro', 1355); ?>
            </div>
        </div>
        <div class="column">
            <div class="imageWrapper onScreen fadeIn introImage">
                <img src="<?php echo $intro_image['sizes']['full']; ?>" width="<?php echo $intro_image['sizes']['full-width']; ?>" height="<?php echo $intro_image['sizes']['full-height']; ?>" alt="<?php echo $intro_image['alt']; ?>" />
            </div>
        </div>
    </div>
</section>
<section class="twoColumns">
    <div class="wrapper aligncenter Reverse">
        <?php $second_image = get_field('second_image', 1355); ?>
        <div class="column">
            <div class="imageWrapper onScreen fadeIn">
                <img src="<?php echo $second_image['sizes']['full']; ?>" width="<?php echo $second_image['sizes']['full-width']; ?>" height="<?php echo $second_image['sizes']['full-height']; ?>" alt="<?php echo $second_image['alt']; ?>" />
            </div>
        </div>
        <div class="column textWrapper onScreen fadeUp">
            <?php the_field('second_text', 1355); ?>
        </div>
    </div>
</section>

<section class="currentVacancies">
    <div class="wrapper">
        <h3>Our current vacancies.</h3>
        <div class="filterWrapper onScreen fadeUp">
            <span>Filter</span>
            <select id="location-filter">
                <option value="all">All Locations</option>
                <?php
                // Get all unique location values from ACF select field
                $locations = array();
                $args = array(
                    'post_type' => 'careers',
                    'posts_per_page' => -1,
                );
                $query = new WP_Query($args);
                while ($query->have_posts()) : $query->the_post();
                    $location = get_field('location');  // Replace 'location' with your ACF field name
                    if (!in_array($location, $locations)) {
                        $locations[] = $location;
                    }
                endwhile;
                wp_reset_postdata();

                // Create dropdown options
                foreach ($locations as $location) {
                    echo '<option value="' . sanitize_title($location) . '">' . $location . '</option>';
                }
                ?>
            </select>
        </div>

        <div class="vacanciesResults">
            <table>
                <thead>
                    <tr style="border-bottom:1px solid #ffffff;" class="onScreen fadeUp">
                        <th style="text-align:left;color: #E3F74D;font-weight:700;">Job title</th>
                        <th style="text-align:center;color: #E3F74D;font-weight:700;">Location</th>
                        <th style="text-align:center;color: #E3F74D;font-weight:700;">Salary</th>
                        <!-- <th style="text-align:center;color: #E3F74D;font-weight:700;">Closing Date</th> -->
                        <th style="text-align:center;color: #E3F74D;font-weight:700;"></th>
                    </tr>
                </thead>
                <tbody class="onScreen fadeUp">
                    <?php
                    // Define custom post type and arguments for the query
                    $args = array(
                        'post_type' => 'careers',
                        'posts_per_page' => -1, // Retrieve all posts
                    );

                    // Get the selected location from the URL parameter
                    $selectedLocation = isset($_GET['location-filter']) ? $_GET['location-filter'] : 'all';

                    // Modify query based on the selected location
                    if ($selectedLocation !== 'all') {
                        $args['meta_query'] = array(
                            array(
                                'key' => 'location',  // Replace with your ACF field name
                                'value' => $selectedLocation,
                                'compare' => '=',
                            ),
                        );
                    }

                    // Create a new query using the arguments
                    $query = new WP_Query($args);

                    // Loop through the custom posts
                    while ($query->have_posts()) : $query->the_post();
                        $location = get_field('location');
                        $salary = get_field('salary');
                        $closing_date = get_field('closing_date');
                    ?>
                        <tr class="career <?php echo sanitize_title($location); ?>" style="border-bottom:1px solid #ffffff;">
                            <td><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></td>
                            <td style="text-align:center;"><?php echo $location; ?></td>
                            <td style="text-align:center;"><?php echo $salary; ?></td>
                            <!-- <td style="text-align:center;"><?php // echo $closing_date; ?></td> -->
                            <td style="text-align:center;"><a style="display:inline-flex;align-items:center;" href="<?php the_permalink(); ?>"><svg style="position:relative;right:5px;" xmlns="http://www.w3.org/2000/svg" width="34.5" height="34.5" viewBox="0 0 34.5 34.5"><g transform="translate(-9.471 17.25) rotate(-45)"><g transform="translate(6.697 6.697)"><path d="M23.4,0V23.4H0" fill="none" stroke="#e3f74d" stroke-width="2"/></g></g></svg></a></td>
                        </tr>
                    <?php endwhile; ?>

                    <?php wp_reset_postdata(); // Reset the query ?>
                </tbody>
            </table>
        </div>
    </div>
</section>

<script>

gsap.registerPlugin(ScrollTrigger);

        jQuery(document).ready(function ($) {
            $('#location-filter').change(function () {
                var selectedLocation = $(this).val();

                $('.career').hide();
                if (selectedLocation === 'all') {
                    $('.career').show();
                } else {
                    $('.' + selectedLocation).show();
                }
            });
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
            let h1 = document.querySelector('h1');
            let h2 = document.querySelector('.contentWrap');
            let introImage = document.querySelector('.introImage');
            let nav = document.querySelector('header');


            tlHome.to(h1, {opacity:1, y:0, duration: .3, delay: 0.1})
            tlHome.to(h2, {opacity:1, y:0, duration: .3}, "-=.3")
            tlHome.to(nav, {y:0, duration: .3}, "-=.3")
            tlHome.to(introImage, {opacity:1, duration: .3}, "-=.3")


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