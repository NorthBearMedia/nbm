<!--

Template name: PPC Showroom

-->
<?php
    get_header();
    wp_enqueue_style('homeStyles');
    wp_enqueue_style('showroomPPCStyles');

    // Set default order by 'date' if not set
$orderby = isset($_GET['orderby']) ? $_GET['orderby'] : 'date';
?>

<section class="introduction" style="background-color: #2B2E34;">
    <div class="innerIntro">
        
        <div class="overlay"></div>
        <!-- This gets a background image if it is set. If not, it will get the video -->
        <iframe style="opacity: 1;" class="vimeoVid topBG desktopVid" src="https://player.vimeo.com/video/869253435?&amp;autoplay=1&amp;loop=1&amp;autopause=0&amp;muted=1&amp;background=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="" title="Steadplan" data-ready="true" frameborder="0"></iframe>
        <iframe style="opacity: 1;" class="vimeoVid topBG mobileVid" src="https://player.vimeo.com/video/869061484?&amp;autoplay=1&amp;loop=1&amp;autopause=0&amp;muted=1&amp;background=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="" title="Banner UK" data-ready="true" frameborder="0"></iframe>        <div class="wrapper">
        
        <div class="titleWrapper">
            <h1 style="opacity: 1; transform: translate(0px, 0px);" class="Yes revealTitle">Commercial vehicles in-stock now</h1>
            <h2 style="opacity: 1; transform: translate(0px, 0px);" class="Yes">The number one choice for van sales <br>with dealerships across the north of England.</h2>
            <h3 style="opacity: 1; transform: translate(0px, 0px);" class="Yes">Offering the largest selection of in-stock vans, available to drive away today.</h3>
        </div>

        <div class="buttonsWrap" style="opacity: 1; transform: translate(0px, 0px);">
            <a class="button glassButton uppercase" href="#allVehicles">Browse our showroom</a>
            <!--<a class="button glassButton uppercase" href="/maintenance">Maintenance</a>-->
            <!--<a class="button glassButton uppercase" href="/conversions">Conversions</a>-->
        </div>

    </div>
</section>

<section class="allResults" id="allVehicles">
    <div class="wrapper">
        <div style="opacity:0;" class="filter">
            <h2 class="header1">Vehicle <span>Showroom</span></h2>
            <p class="subTitle1">All vehicles are in-stock and available to drive away today.</p>
        </div>
        <div class="sort" style="opacity:0;transform:translateY(50px);">
            <h3>Sort by<svg height="18" width="30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 51.6 29.8" style="enable-background:new 0 0 51.6 29.8" xml:space="preserve"><path d="m4.9 4.5 20.8 20.8L46.6 4.5" style="fill:none;stroke:#fff;stroke-width:3"></path></svg></h3>
         
            <form method="get" action="<?php echo esc_url($_SERVER['REQUEST_URI']); ?>">
                <select name="orderby" onchange="this.form.submit()">
                    <option value="date" <?php selected($orderby, 'date'); ?>>Newest</option>
                    <option value="price_low_high" <?php selected($orderby, 'price_low_high'); ?>>Price (Low to High)</option>
                    <option value="price_high_low" <?php selected($orderby, 'price_high_low'); ?>>Price (High to Low)</option>
                </select>
            </form>
        </div>

        <?php
            // Set the default query arguments
            $args = array(
                'post_type' => 'vehicle',
                'posts_per_page' => 10,
                'paged' => get_query_var('paged') ? get_query_var('paged') : 1,
                'orderby' => 'date',  // Default order by date
                'order' => 'DESC'     // Default order is descending
            );

            // Modify query based on sorting option
            if ($orderby) {
                switch ($orderby) {
                    case 'price_low_high':
                        $args['meta_key'] = 'supplied_price';
                        $args['orderby'] = 'meta_value_num';
                        $args['order'] = 'ASC';
                        break;
                    case 'price_high_low':
                        $args['meta_key'] = 'supplied_price';
                        $args['orderby'] = 'meta_value_num';
                        $args['order'] = 'DESC';
                        break;
                    case 'date':
                    default:
                        $args['orderby'] = 'date';
                        $args['order'] = 'DESC';
                        break;
                }
            }

            // Custom query for vehicles
            $query = new WP_Query($args);

            if ($query->have_posts()): ?>
            <div class="bottomSection" style="opacity:0;transform:translateY(50px);">                
                <div class="filterOptions" style="overflow:hidden;">
                    <h3>Filter<svg height="18" width="30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 51.6 29.8" style="enable-background:new 0 0 51.6 29.8" xml:space="preserve"><path d="m4.9 4.5 20.8 20.8L46.6 4.5" style="fill:none;stroke:#fff;stroke-width:3"></path></svg></h3>
                    <?php echo do_shortcode('[fe_widget]'); ?>
                    <?php // echo do_shortcode('[searchandfilter fields="vehicle,body_type,cab_type,wheelbase_type,fuel_type"]'); ?>
                </div>
                <div class="resultsWrapper">
                    <?php while ($query->have_posts()): $query->the_post(); ?>
                        <a href="<?php the_permalink(); ?>" class="result">
                            <div class="images">
                                <?php
                                    $is_first_image = true;
                                    if (have_rows('gallery_images')) {
                                        while (have_rows('gallery_images')) {
                                            the_row();
                                            $galleryImage = get_sub_field('image_link');
                                            
                                            if ($is_first_image) {
                                ?>
                                                <figure>
                                                    <img src="<?php echo $galleryImage; ?>" alt="Steadplan">
                                                </figure>
                                <?php
                                                $is_first_image = false; // Set to false so that the next images won't be displayed
                                            }
                                        }
                                    } else {
                                        $defaultImage = get_template_directory_uri() . '/images/thumb.jpg';
                                ?>
                                        <figure>
                                            <img src="<?php echo $defaultImage; ?>" alt="Default Image">
                                        </figure>
                                <?php
                                    }
                                ?>
                            </div>
                            <div class="text">
                                <h2><?php the_field('make'); ?> <?php the_field('model'); ?> <?php the_title(); ?></h2>
                                <h3><?php $mileage = get_field('mileage');
                                        // Format the price with commas as thousand separators
                                        $mileage = number_format($mileage, 0, '', ',');
                                        echo $mileage; ?> miles</h3>
                                <div class="details">
                                    <ul>
                                        <?php
                                            // Get the body type term(s) associated with the post
                                            $body_type_terms = wp_get_post_terms(get_the_ID(), 'body_type');
                                            if (!empty($body_type_terms)) {
                                                foreach ($body_type_terms as $term) {
                                                    echo '<li>'.$term->name.'</li>';
                                                }
                                            }
                                        ?>
                                        <?php
                                            $cab_type_terms = wp_get_post_terms(get_the_ID(), 'cab_type');
                                            if (!empty($cab_type_terms)) {
                                                foreach ($cab_type_terms as $term) {
                                                    echo '<li>'.$term->name.'</li>';
                                                }
                                            }
                                        ?>
                                        <?php
                                            $wheelbase_type_terms = wp_get_post_terms(get_the_ID(), 'wheelbase_type');
                                            if (!empty($wheelbase_type_terms)) {
                                                foreach ($wheelbase_type_terms as $term) {
                                                    echo '<li>'.$term->name.'</li>';
                                                }
                                            }
                                        ?>
                                        <?php if( get_field('engine_size') ) { ?>
                                            <li><?php the_field('engine_size'); ?></li>
                                        <?php } ?>
                                        <?php if( get_field('transmission') ) { ?>
                                            <li><?php the_field('transmission'); ?></li>
                                        <?php } ?>
                                        <?php
                                            $fuel_type_terms = wp_get_post_terms(get_the_ID(), 'fuel_type');
                                            if (!empty($fuel_type_terms)) {
                                                foreach ($fuel_type_terms as $term) {
                                                    echo '<li>'.$term->name.'</li>';
                                                }
                                            }
                                        ?>
                                    </ul>
                                </div>
                                <div class="condition">
                                    <?php if( get_field('condition') ) { ?>
                                        <span><?php the_field('condition'); ?> <?php if( get_field('vehicle_type') == 'Van' ) { ?>Van<?php } else { ?>Car<?php } ?></span>
                                    <?php } ?>
                                </div>
                                <div class="price">
                                    <span>&pound;
                                        <?php 
                                        $total_price = get_field('supplied_price');
                                        // Format the price with commas as thousand separators
                                        $formatted_price = number_format($total_price, 0, '', ',');
                                        echo $formatted_price;
                                        if( get_field('vehicle_type') == 'Van' ) {
                                            echo ' + VAT';
                                        }
                                        ?>
                                    </span>
                                </div>
                            </div>
                        </a>
                    <?php endwhile; ?>
                </div>
            </div>
        <?php else: ?>
            <p>No vehicles found</p>
        <?php endif; ?>
        <?php wp_reset_postdata(); ?>
    </div>
</section>

<script>

                        
    document.addEventListener('DOMContentLoaded', function () {
        // Get the elements
        var filterOptions = document.querySelector('.filterOptions');
        var h3Element = filterOptions.querySelector('h3');
        var widgetElement = filterOptions.querySelector('.widget');

        // Add a click event listener to the h3 element
        h3Element.addEventListener('click', function () {
            // Toggle the "open" class on the h3 and widget elements
            h3Element.classList.toggle('open');
            widgetElement.classList.toggle('open');
        });
      
        // Get the elements
        var sort = document.querySelector('.sort');
        var h3Elementsort = sort.querySelector('h3');
        var form = sort.querySelector('.sort form');

        // Add a click event listener to the h3 element
        h3Elementsort.addEventListener('click', function () {
            // Toggle the "open" class on the h3 and widget elements
            h3Elementsort.classList.toggle('open');
            form.classList.toggle('open');
        });




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
        let h1 = document.querySelector('.allResults .filter');
        let sort = document.querySelector('.allResults .sort');
        let bottomSection = document.querySelector('.allResults .bottomSection');
        let topBG = document.querySelector('.topBG');
        let nav = document.querySelector('header');


        tlHome.to(h1, {opacity:1, duration: .1, delay: 0.1})
        tlHome.to(sort, {opacity:1, y:0, duration: .3}, "+=.3")
        tlHome.to(bottomSection, {opacity:1, y:0, duration: .3}, "-=.3")
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

         

      }

    });

</script>

<?php get_footer(); ?>