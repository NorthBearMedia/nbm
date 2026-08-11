<?php
// Enqueue styles before get_header()
function enqueue_single_vehicle_styles()
{
    wp_enqueue_style('vehicleStyles');
}
add_action('wp_enqueue_scripts', 'enqueue_single_vehicle_styles', 20);

get_header();
?>
<style>
    .galleryArea .wrapper .carGallery .wrapper .singleSlider,
    .galleryArea .wrapper .carGallery .wrapper .slider-nav-thumbnails-single {
        min-width: 100px;
        flex: 1 0 100%;
    }

    .galleryArea .wrapper .rightPanel .sideFormWrapper form p input {
        color: #fff !important;
    }

    header .nav .topNav .headerMenu ul li.current_page_item>a::after,
    header .nav .topNav .headerMenu ul li.current_page_parent>a::after {
        border-color: transparent;
    }

    header .nav .topNav .headerMenu ul li.menu-item-717>a::after {
        width: calc(100% + 22px) !important;
        border-color: #ED4233 !important;
        opacity: 1;
        border-radius: 10px;
    }
</style>

<?php if (have_posts()) : ?>
    <?php while (have_posts()) : the_post(); ?>

        <section class="galleryArea">
            <div class="wrapper">
                <a class="backTo" href="<?php echo home_url('/showroom'); ?>"><svg xmlns="http://www.w3.org/2000/svg" width="35.26" height="35.261" viewBox="0 0 35.26 35.261">
                        <g transform="translate(1.5 1.061)">
                            <g transform="translate(0 7.277)">
                                <path d="M-38.209,0V25.423h25.422" transform="translate(38.209)" fill="none" stroke="#6f49f6" stroke-width="3" />
                            </g>
                            <g transform="translate(0.332 0)">
                                <path d="M-48.646-16.278l32.367-32.368" transform="translate(48.646 48.646)" fill="none" stroke="#6f49f6" stroke-width="3" />
                            </g>
                        </g>
                    </svg> Back to Showroom</a>

                <div class="titleWrapper">
                    <h1><?php the_field('make'); ?> <?php the_field('model'); ?> <?php the_title(); ?></h1>
                </div>
                <div class="carGallery">
                    <div class="wrapper">
                        <!-- MAIN SLIDES -->

                        <div class="singleSlider lightboxWrapper">
                            <?php
                            if (have_rows('gallery_images')) {
                                while (have_rows('gallery_images')) {
                                    the_row();
                                    $galleryImage = get_sub_field('image_link');
                            ?>
                                    <figure>
                                        <img src="<?php echo $galleryImage; ?>" alt="Steadplan">
                                    </figure>
                                <?php
                                }
                            } else {
                                $defaultImage = get_template_directory_uri() . '/images/thumb.jpg';
                                ?>
                                <figure>
                                    <img style="border: 1px solid #6F49F6;" src="<?php echo $defaultImage; ?>" alt="Default Image">
                                </figure>
                            <?php
                            }
                            ?>
                        </div>

                        <!-- THUMBNAILS -->
                        <div class="slider-nav-thumbnails-single">
                            <?php
                            if (have_rows('gallery_images')) {
                                while (have_rows('gallery_images')) {
                                    the_row();
                                    $galleryImage = get_sub_field('image_link');
                            ?>
                                    <div>
                                        <img src="<?php echo $galleryImage; ?>" alt="Steadplan">
                                    </div>
                            <?php
                                }
                            }
                            ?>
                        </div>
                    </div>
                </div>
                <div class="rightPanel">
                    <div class="price">
                        <span>&pound;
                            <?php
                            $total_price = get_field('supplied_price');

                            // Format the price with commas as thousand separators
                            $formatted_price = number_format($total_price, 0, '', ',');
                            $vehicle_type = get_field('vehicle_type');
                            $vat_excluded = get_field('vat_excluded');

                            echo $formatted_price;
                            // Check if the vehicle type is 'Van' and append '+ VAT'

                            if ($vehicle_type == 'Van' && $vat_excluded != 'Yes') {
                                echo ' + VAT';
                            }

                            ?>

                        </span>
                    </div>
                    <!-- <div class="tradeIn">
                        <span>Trade in form</span>
                    </div> -->
                    <div class="rightDetails">
                        <ul>

                            <li><span>Vehicle type:</span> <?php the_field('vehicle_type'); ?></li>
                            <li><span>Model:</span> <?php the_field('make'); ?> <?php the_field('model'); ?></li>

                            <?php if (get_field('registered')) { ?>
                                <li><span>Reg:</span> <?php the_field('registered'); ?></li>
                            <?php } ?>

                            <li><span>Mileage:</span> <?php $mileage = get_field('mileage');
                                                        // Format the price with commas as thousand separators
                                                        $mileage = number_format($mileage, 0, '', ',');
                                                        echo $mileage; ?> miles</li>

                            <?php
                            // Get the body type term(s) associated with the post
                            $body_type_terms = wp_get_post_terms(get_the_ID(), 'body_type');

                            // Check if there are any terms
                            if (!empty($body_type_terms)) {
                                // Loop through the terms if there are multiple
                                foreach ($body_type_terms as $term) {
                                    // Display the term name
                                    echo '<li><span>Body:</span> ' . $term->name . '</li>';

                                    // If you want to display a comma-separated list for multiple terms, you can do this:
                                    // echo $term->name . ', ';
                                }
                            } else {
                                // No body type terms found
                            }
                            ?>
                            <?php
                            // Get the cab type term(s) associated with the post
                            $cab_type_terms = wp_get_post_terms(get_the_ID(), 'cab_type');

                            // Check if there are any terms
                            if (!empty($cab_type_terms)) {
                                // Loop through the terms if there are multiple
                                foreach ($cab_type_terms as $term) {
                                    // Display the term name
                                    echo '<li><span>Cab type:</span> ' . $term->name . '</li>';

                                    // If you want to display a comma-separated list for multiple terms, you can do this:
                                    // echo $term->name . ', ';
                                }
                            } else {
                                // No cab type terms found
                            }
                            ?>
                            <?php
                            $wheelbase_type_terms = wp_get_post_terms(get_the_ID(), 'wheelbase_type');

                            // Check if there are any terms
                            if (!empty($wheelbase_type_terms)) {
                                // Loop through the terms if there are multiple
                                foreach ($wheelbase_type_terms as $term) {
                                    // Display the term name
                                    echo '<li><span>Wheelbase:</span> ' . $term->name . '</li>';
                                }
                            } else {
                            }
                            ?>
                            <?php if (get_field('engine_size')) { ?>
                                <li>
                                    <span>Engine:</span> <?php the_field('engine_size'); ?>
                                </li>
                            <?php } ?>
                            <?php if (get_field('transmission')) { ?>
                                <li>
                                    <span>Transmission:</span> <?php the_field('transmission'); ?>
                                </li>
                            <?php } ?>


                            <?php
                            $fuel_type_terms = wp_get_post_terms(get_the_ID(), 'fuel_type');

                            // Check if there are any terms
                            if (!empty($fuel_type_terms)) {
                                // Loop through the terms if there are multiple
                                foreach ($fuel_type_terms as $term) {
                                    // Display the term name
                                    echo '<li><span>Fuel type:</span> ' . $term->name . '</li>';
                                }
                            } else {
                            }
                            ?>

                            <?php if (get_field('condition')) { ?>
                                <li>
                                    <span>Condition:</span> <?php the_field('condition'); ?>
                                </li>
                            <?php } ?>
                        </ul>
                    </div>


                    <div class="sideFormWrapper">
                        <h3>Enquire about this vehicle</h3>
                        <?php echo do_shortcode('[contact-form-7 id="5" title="Contact form"]'); ?>
                    </div>

                    <!--
                    <a href="#formWrapper" class="offer">
                        <span>Enquire now</span>
                        <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="32.694" height="31.972" viewBox="0 0 32.694 31.972"><g transform="translate(1 15.986) rotate(-45)"><g transform="translate(4.765 4.765)"><path d="M16.646,0V16.646H0" transform="translate(0 0)" fill="none" stroke="#e8e8e8" stroke-width="2"></path></g><g transform="translate(0 0)"><path d="M21.193,21.193,0,0" fill="none" stroke="#e8e8e8" stroke-width="2"></path></g></g></svg>
                    </a>
                            -->




                </div>
            </div>
        </section>
        <section class="tabsArea">
            <div class="wrapper">
                <div class="tabset">
                    <!-- Tab 1 -->
                    <input type="radio" name="tabset" id="tab1" aria-controls="overview">
                    <label for="tab1">Overview</label>
                    <!-- Tab 2 -->
                    <input type="radio" name="tabset" id="tab2" aria-controls="features" checked>
                    <label for="tab2">Features</label>
                    <!-- Tab 3 -->
                    <!-- <input type="radio" name="tabset" id="tab3" aria-controls="location">
                    <label for="tab3">Location</label> -->

                    <div class="tab-panels">
                        <div id="overview" class="tab-panel">
                            <h2>Overview</h2>
                            <?php the_field('vehicle_description'); ?>
                        </div>
                        <div id="specs" class="tab-panel">
                            <h2>Features</h2>
                            <?php if (have_rows('vehicle_features')): ?>
                                <div class="featuresWrapper">
                                    <?php while (have_rows('vehicle_features')): the_row(); ?>
                                        <div class="feature">
                                            <p><?php the_sub_field('feature_name'); ?></p>
                                            <!-- <p><?php // the_sub_field('feature_description'); 
                                                    ?></p>                                             -->
                                        </div>
                                    <?php endwhile; ?>
                                </div>
                            <?php endif; ?>
                        </div>
                        <!-- <div id="running" class="tab-panel">
                                <h2>Location</h2>
                                

                            </div> -->
                    </div>
                </div>
            </div>
        </section>
    <?php endwhile;
    wp_reset_query(); ?>
<?php endif; ?>

<section class="contactForm" id="formWrapper">
    <div class="bg onScreen"></div>
    <div class="wrapper">
        <div class="textWrapper">
            <div class="titleWrapper">
                <h2>Enquire online now</h2>
            </div>
            <div class="formWrapper">
                <?php echo do_shortcode('[contact-form-7 id="5" title="Contact form"]'); ?>
            </div>
            <div class="rightSide">

            </div>
        </div>
    </div>
</section>


<script>
    document.addEventListener('DOMContentLoaded', function() {
        // Get the Contact Form 7 form element
        var contactForm = document.querySelector('.wpcf7-form');

        // Check if the form exists on the page
        if (contactForm) {
            // Customize the "your-message" field value
            var messageField = contactForm.querySelector('textarea[name="your-message"]');
            var hiddenPageUrlField = contactForm.querySelector('input[name="page-url"]');

            if (messageField) {
                // Set the message to the page title and custom fields
                messageField.value = 'I am looking for more information on <?php echo esc_js(get_post_meta(get_the_ID(), 'make', true)); ?> <?php echo esc_js(get_post_meta(get_the_ID(), 'model', true)); ?> <?php echo esc_js(get_the_title()); ?>';
            }

            if (hiddenPageUrlField) {
                hiddenPageUrlField.value = window.location.href; // Set the current page URL
            }
        }



        // scroll down after sumbit
        (function() {
            // Delegate so it works even if CF7 re-renders parts of the form
            document.addEventListener('click', function(e) {
                const btn = e.target.closest('.wpcf7 input[type="submit"], .wpcf7 button[type="submit"]');
                if (!btn) return;

                // Small delay to let CF7 start its submit handling / keyboard settle
                setTimeout(function() {
                    window.scrollBy({
                        top: 400,
                        left: 0,
                        behavior: 'smooth'
                    });
                }, 50);
            }, true);
        })();
    });

    // gallery shinanigans
    const lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    document.body.appendChild(lightbox);

    const images = document.querySelectorAll('.lightboxWrapper figure img'); // Get all images within the grid
    let currentIndex = 0; // Track the index of the currently displayed image

    images.forEach((image, index) => {
        image.addEventListener('click', () => {
            currentIndex = index; // Update the current index
            showImage(currentIndex);
            lightbox.classList.add('active');
        });
    });

    function showImage(index) {
        index = (index + images.length) % images.length; // Handle wrap-around
        const img = new Image(); // Create a new image element
        img.src = images[index].src;
        while (lightbox.firstChild) {
            lightbox.removeChild(lightbox.firstChild);
        }
        lightbox.appendChild(img);
        currentIndex = index; // Update the current index
        createNavigationButtons();
    }

    function createNavigationButtons() {
        const prevButton = document.createElement('button');
        prevButton.innerText = 'Previous';
        prevButton.className = 'lightbox-nav-button';
        prevButton.addEventListener('click', () => showImage(currentIndex - 1));

        const nextButton = document.createElement('button');
        nextButton.innerText = 'Next';
        nextButton.className = 'lightbox-nav-button';
        nextButton.addEventListener('click', () => showImage(currentIndex + 1));

        lightbox.appendChild(prevButton);
        lightbox.appendChild(nextButton);
    }

    lightbox.addEventListener('click', (e) => {
        if (!e.target.classList.contains('lightbox-nav-button')) {
            lightbox.classList.remove('active');
        }
    });


    // slider on vehicle page

    $('.singleSlider').slick({
        slidesToShow: 1,
        slidesToScroll: 1,
        fade: false,
        arrows: false,
        asNavFor: '.slider-nav-thumbnails-single',
        responsive: [{
            breakpoint: 480,
            settings: {
                slidesToShow: 1,
            }
        }]
    });

    $('.slider-nav-thumbnails-single').slick({
        slidesToShow: 4,
        arrows: true,
        slidesToScroll: 1,
        asNavFor: '.singleSlider',
        dots: false,
        focusOnSelect: true,
        responsive: [{
            breakpoint: 768,
            settings: {
                slidesToShow: 3
            }
        }]
    });

    // Remove active class from all thumbnail slides
    $('.slider-nav-thumbnails-single .slick-slide').removeClass('slick-active');

    // Set active class to first thumbnail slide
    $('.slider-nav-thumbnails-single .slick-slide').eq(0).addClass('slick-active');

    // On before slide change match active thumbnail to current slide
    $('.singleSlider').on('beforeChange', function(event, slick, currentSlide, nextSlide) {
        var mySlideNumber = nextSlide;
        $('.slider-nav-thumbnails-single .slick-slide').removeClass('slick-active');
        $('.slider-nav-thumbnails-single .slick-slide').eq(mySlideNumber).addClass('slick-active');
    });

    // Initialize with the first image
    showImage(currentIndex);

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

            var tlHome = gsap.timeline({
                ease: "power3"
            })
            let h1 = document.querySelector('.introduction .innerIntro h1');
            let h2 = document.querySelector('.introduction .innerIntro h2');
            let select = document.querySelector('.introduction .innerIntro .select');
            let buttonsWrap = document.querySelector('.introduction .innerIntro .buttonsWrap');
            let downWrapper = document.querySelector('.introduction .innerIntro .downWrapper');
            let topBG = document.querySelector('.topBG');
            let nav = document.querySelector('header');


            tlHome.to(h1, {
                opacity: 1,
                y: 0,
                duration: .3,
                delay: 0.1
            })
            tlHome.to(h2, {
                opacity: 1,
                y: 0,
                duration: .3
            }, "-=.3")
            tlHome.to(select, {
                opacity: 1,
                y: 0,
                duration: .3
            }, "-=.2")
            tlHome.to(buttonsWrap, {
                opacity: 1,
                y: 0,
                duration: .3
            }, "-=.2")
            tlHome.to(downWrapper, {
                opacity: 1,
                y: 0,
                duration: .3
            }, "-=.2")
            tlHome.to(nav, {
                y: 0,
                duration: .3
            }, "-=.3")
            tlHome.to(topBG, {
                opacity: 1,
                duration: 1
            })


            // add class to each item - repeats on scroll back

            const revealText = gsap.utils.toArray('.onScreen');
            revealText.forEach((sec, i) => {
                ScrollTrigger.create({
                    trigger: sec,
                    toggleClass: 'active',
                    invalidateOnRefresh: true,
                    start: 'top 99%',
                    scrub: 1,
                    toggleActions: "start none none none",
                    once: true,
                    endTrigger: 'html',
                    end: 'bottom top'
                })
            })
        }

    });
</script>

<?php get_footer(); ?>