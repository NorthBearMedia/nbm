<!--

Template for Vehicle archive page

-->
<?php
function enqueue_vehicle_archive_styles() {
    wp_enqueue_style('homeStyles');
    wp_enqueue_style('vehicleStyles');
}
add_action('wp_enqueue_scripts', 'enqueue_vehicle_archive_styles', 20);

get_header();
?>

<style>
    header .nav .topNav .headerMenu ul li.current_page_item > a::after, header .nav .topNav .headerMenu ul li.current_page_parent > a::after {
        border-color: transparent;
    }
    header .nav .topNav .headerMenu ul li.menu-item-717 > a::after {
        width: calc(100% + 22px)!important;
        border-color: #ED4233!important;
        opacity: 1;
        border-radius: 10px;
    }
</style>

<?php

function modify_main_query_for_sorting($query) {
    if (!is_admin() && $query->is_main_query()) {
        if (isset($_GET['orderby'])) {
            switch ($_GET['orderby']) {
                case 'price_low_high':
                    $query->set('meta_key', 'supplied_price');
                    $query->set('orderby', 'meta_value_num');
                    $query->set('order', 'ASC');
                    break;
                case 'price_high_low':
                    $query->set('meta_key', 'supplied_price');
                    $query->set('orderby', 'meta_value_num');
                    $query->set('order', 'DESC');
                    break;
                default:
                    $query->set('orderby', 'date');
                    $query->set('order', 'DESC');
            }
        }
    }
}
add_action('pre_get_posts', 'modify_main_query_for_sorting');
?>

<section class="allResults">
    <div class="wrapper">
        <div style="opacity:0;" class="filter">
            <h1 class="revealTitle">Showroom</h1>
        </div>
        <div class="sort" style="opacity:0;transform:translateY(50px);">
            <h3>Sort by<svg height="18" width="30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 51.6 29.8" style="enable-background:new 0 0 51.6 29.8" xml:space="preserve"><path d="m4.9 4.5 20.8 20.8L46.6 4.5" style="fill:none;stroke:#fff;stroke-width:3"></path></svg></h3>
         
            <form method="get" action="<?php echo esc_url($_SERVER['REQUEST_URI']); ?>">
                <select name="orderby" onchange="this.form.submit()">
                    <option value="date" <?php selected($_GET['orderby'], 'date'); ?>>Newest</option>
                    <option value="price_low_high" <?php selected($_GET['orderby'], 'price_low_high'); ?>>Price (Low to High)</option>
                    <option value="price_high_low" <?php selected($_GET['orderby'], 'price_high_low'); ?>>Price (High to Low)</option>
                </select>
            </form>

        </div>

        <?php if (have_posts()): ?>

            <div class="bottomSection" style="opacity:0;transform:translateY(50px);">                
                <div class="filterOptions" style="overflow:hidden;">
                    <h3>Filter<svg height="18" width="30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 51.6 29.8" style="enable-background:new 0 0 51.6 29.8" xml:space="preserve"><path d="m4.9 4.5 20.8 20.8L46.6 4.5" style="fill:none;stroke:#fff;stroke-width:3"></path></svg></h3>
                    <?php echo do_shortcode('[fe_widget]'); ?>
                    <?php // echo do_shortcode('[searchandfilter fields="vehicle,body_type,cab_type,wheelbase_type,fuel_type"]'); ?>
                </div>
                <div class="resultsWrapper">
                    <?php while (have_posts()): the_post(); ?>
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
                                                // Loop through the terms if there are multiple
                                                foreach ($body_type_terms as $term) {
                                                    // Display the term name
                                                    echo '<li>'.$term->name.'</li>';
                                                }
                                            } else {

                                            }
                                        ?>
                                        <?php
                                            $cab_type_terms = wp_get_post_terms(get_the_ID(), 'cab_type');

                                            // Check if there are any terms
                                            if (!empty($cab_type_terms)) {
                                                // Loop through the terms if there are multiple
                                                foreach ($cab_type_terms as $term) {
                                                    // Display the term name
                                                    echo '<li>'.$term->name.'</li>';
                                                }
                                            } else {

                                            }
                                        ?>
                                        <?php
                                            $wheelbase_type_terms = wp_get_post_terms(get_the_ID(), 'wheelbase_type');

                                            // Check if there are any terms
                                            if (!empty($wheelbase_type_terms)) {
                                                // Loop through the terms if there are multiple
                                                foreach ($wheelbase_type_terms as $term) {
                                                    // Display the term name
                                                    echo '<li>'.$term->name.'</li>';
                                                }
                                            } else {

                                            }
                                        ?>
                                    
                                        <?php if( get_field('engine_size') ) { ?>
                                            <li>
                                                <?php the_field('engine_size'); ?>
                                            </li>
                                        <?php } ?>
                                        <?php if( get_field('transmission') ) { ?>
                                            <li>
                                                <?php the_field('transmission'); ?>
                                            </li>
                                        <?php } ?>

                                        <?php
                                            $fuel_type_terms = wp_get_post_terms(get_the_ID(), 'fuel_type');

                                            // Check if there are any terms
                                            if (!empty($fuel_type_terms)) {
                                                // Loop through the terms if there are multiple
                                                foreach ($fuel_type_terms as $term) {
                                                    // Display the term name
                                                    echo '<li>'.$term->name.'</li>';
                                                }
                                            } else {

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
                                        $vehicle_type = get_field('vehicle_type');
                                        $vat_excluded = get_field('vat_excluded');

                                        // Format the price with commas as thousand separators
                                        $formatted_price = number_format($total_price, 0, '', ',');

                                        echo $formatted_price;

                                        // Check if the vehicle type is 'Van' and append '+ VAT'
                                        
                                        if( $vehicle_type == 'Van' && $vat_excluded != 'Yes' ) {
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
        <?php endif; ?>

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