<!--

Template for Work archive page

-->
<?php
get_header();
//wp_enqueue_style('workStyles');
?>

<section class="filters">
    <div class="wrapper">
        <div class="filterWrapper">
            <div class="filterContainer" style="transform:translateX(50px);opacity:0;">
                <h1 class="secondTitle revealTitle">Service<svg class="char" xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#101010" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#101010" stroke-width="2"/></g></g></svg></h1>
                <h4 style="transform:translateX(50px);opacity:0;">
                    Filter by service<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" style="margin-left: 10px;transform: rotate(45deg);max-height: 30px;width: auto;"><g transform="translate(-1725 -609)"><g transform="translate(1725 609)" fill="none" stroke="#f94638" stroke-width="2"><circle cx="28" cy="28" r="28" stroke="none"></circle><circle cx="28" cy="28" r="27" fill="none"></circle></g><g transform="translate(28.2 -0.301)"><g transform="translate(1716.801 629.301) rotate(45)"><line x2="23.889" transform="translate(0 0)" fill="none" stroke="#f94638" stroke-width="2"></line></g><g transform="translate(1733.692 629.301) rotate(135)"><line x2="23.889" transform="translate(0 0)" fill="none" stroke="#f94638" stroke-width="2"></line></g></g></g></svg>
                </h4>
                <div class="inner">
                    <!-- SERVICES -->
                    <?php
                    $curTerm = $wp_query->queried_object;
                    $terms = get_terms( array(
                        'taxonomy' => 'services',
                        'hide_empty' => false,
                    ) );
                    ?>
                    <ul class="cat-services cat-list" style="transform:translateY(50px);opacity:0;">
                        <?php foreach($terms as $term) : ?>
                            <?php
                            // Split the term name into words
                            $words = explode(' ', $term->name);
                            // Get the last word
                            $lastWord = array_pop($words);
                            // Reconstruct the term name with the last word wrapped in a span
                            $termName = implode(' ', $words) . ' <span>' . $lastWord . '</span>';

                            $classes = array();
                            if ($term->name == $curTerm->name) {
                                $classes[] = 'active';
                            }
                            ?>
                            <li>
                                <a class="cat-list_item button catSpan <?php echo implode('', $classes); ?>" href="/work-service/<?= $term->slug; ?>" data-slug="<?= $term->slug; ?>">
                                    <?= $termName; ?>
                                </a>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                </div>

            </div>
            <div class="filterContainer" style="transform:translateX(50px);opacity:0;">
                <h2 class="secondTitle revealTitle">Industries<svg class="char" xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#101010" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#101010" stroke-width="2"/></g></g></svg></h2>
                <h4 style="transform:translateX(50px);opacity:0;">
                    Filter by industry<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" style="margin-left: 10px;transform: rotate(45deg);max-height: 30px;width: auto;"><g transform="translate(-1725 -609)"><g transform="translate(1725 609)" fill="none" stroke="#f94638" stroke-width="2"><circle cx="28" cy="28" r="28" stroke="none"></circle><circle cx="28" cy="28" r="27" fill="none"></circle></g><g transform="translate(28.2 -0.301)"><g transform="translate(1716.801 629.301) rotate(45)"><line x2="23.889" transform="translate(0 0)" fill="none" stroke="#f94638" stroke-width="2"></line></g><g transform="translate(1733.692 629.301) rotate(135)"><line x2="23.889" transform="translate(0 0)" fill="none" stroke="#f94638" stroke-width="2"></line></g></g></g></svg>
                </h4>
                <div class="inner">
                    <!-- INDUSTRY -->
                    <?php
                        $curTerm = $wp_query->queried_object;
                        $terms = get_terms( array(
                            'taxonomy' => 'industry',
                            'hide_empty' => false,
                        ) );
                        ?>
                        <ul class="cat-industry cat-list" style="transform:translateY(50px);opacity:0;">
                            <?php foreach($terms as $term) : ?>
                                <?php
                                    $classes = array();
                                    if ( strcasecmp( $term->name, $curTerm->name ) === 0 ) {
                                        $classes[] = 'active';
                                    }
                                ?>
                                <li>
                                    <a class="cat-list_item button <?php echo implode( ' ', $classes ); ?>" href="/work-industry/<?= $term->slug; ?>" data-slug="<?= $term->slug; ?>">
                                        <?= $term->name; ?>
                                    </a>
                                </li>
                            <?php endforeach; ?>
                        </ul>
                </div>
            </div>
            <div class="infoContainer" style="transform:translateY(50px);opacity:0;">
                <div class="lower">
                    <span class="first"></span><span class="second">Filter by service or industry.</span>
                </div>
            </div>
            <div class="clearContainer" style="transform:translateY(50px);opacity:0;">
                <a href="/work/" class="lower">
                    <span class="first"></span><span class="second">Clear all filters.</span>
                </a>
            </div>
        </div>
    </div>
</section>

<section class="caseStudiesArchive" style="transform:translateY(50px);opacity:0;">
    <div class="wrapper">
        <div class="container">
            <?php
            $term_slug = $curTerm->slug; // Get the selected term slug
            $args = array(
                'post_type' => 'work',
                'posts_per_page' => -1,
                'tax_query' => array(
                    array(
                        'taxonomy' => 'industry',
                        'field' => 'slug',
                        'terms' => $term_slug,
                    ),
                ),
            );

            $work_query = new WP_Query($args);

            if ($work_query->have_posts()) {
                while ($work_query->have_posts()) {
                    $work_query->the_post();
                    ?>
                    <div class="caseStudy onScreen">

                        <a href="<?php the_permalink(); ?>" class="overlay"></a>

                        <h2><?php the_title(); ?></h2>
                        <div class="imageWrapper">
                            <?php
                            // Get the alternative image ID
                            $alternative_image_id = get_field('alternative_work_page_image');

                            if ($alternative_image_id) {
                                // Use the alternative image
                                $image = wp_get_attachment_image_src($alternative_image_id, 'workThumb');
                                if ($image) {
                                    echo '<img src="' . $image[0] . '" alt="' . get_post_meta($alternative_image_id, '_wp_attachment_image_alt', true) . '">';
                                }
                            } else {
                                // Alternative image doesn't exist, check the featured image
                                $featured_image_id = get_field('featured_image');
                                if ($featured_image_id) {
                                    $image = wp_get_attachment_image_src($featured_image_id, 'workThumb');
                                    if ($image) {
                                        echo '<img src="' . $image[0] . '" alt="' . get_post_meta($featured_image_id, '_wp_attachment_image_alt', true) . '">';
                                    }
                                } else {
                                    // Use the final placeholder image
                                    echo '<img src="/wp-content/uploads/2023/06/placeholder-770x600.png" alt="Soda Sound">';
                                }
                            }
                            ?>
                        </div>
                        <div class="lower">

                            <?php
                                // Display the selected 'industry' taxonomy categories
                                $industry_terms = get_the_terms(get_the_ID(), 'industry');
                                if ($industry_terms && !is_wp_error($industry_terms)) {
                                    echo '<div class="industry-categories cats">';
                                    echo '<h3><span>Client</span> Industry</h3>';
                                    echo '<ul>';
                                    foreach ($industry_terms as $industry_term) {
                                        echo '<li>' . $industry_term->name . '</li>';
                                    }
                                    echo '</ul>';
                                    echo '</div>';
                                }

                                // Display the selected 'services' taxonomy categories
                                $services_terms = get_the_terms(get_the_ID(), 'services');
                                if ($services_terms && !is_wp_error($services_terms)) {
                                    echo '<div class="services-categories cats">';
                                    echo '<h3>Services<span> Provided</span></h3>';
                                    echo '<ul>';
                                    foreach ($services_terms as $services_term) {
                                        echo '<li class="catSpan">' . $services_term->name . '</li>';
                                    }
                                    echo '</ul>';
                                    echo '</div>';
                                }
                            ?>

                        </div>
                    </div>
                <?php
                }

                // Restore original post data
                wp_reset_postdata();
            } else {
                // No posts found
                echo 'No work posts found.';
            }
            ?>
        </div>
    </div>
</section>

<section class="yourProject">
    <div class="wrapper">
        <h3>Your Project <span>Next</span></h3>
    </div>
</section>




<?php get_footer(); ?>


<script>

    // clicking the filters to unhide them all on mobile

    // Get all .filterContainer divs
    const filterContainers = document.querySelectorAll('.filterContainer');

    // Iterate over each .filterContainer
    filterContainers.forEach(container => {
        // Get the .secondTitle element within the current container
        const secondTitle = container.querySelector('h4');
        const inner = container.querySelector('.inner');

        // Add click event listener to the .secondTitle element
        secondTitle.addEventListener('click', () => {
            // Toggle the class 'open' on .secondTitle
            secondTitle.classList.toggle('open');
            inner.classList.toggle('open');
        });
    });


    // ajax filter
    $('.cat-list_item').on('click', function() {
        $('.cat-list_item').removeClass('active');
        $(this).addClass('active');
        /*
        $.ajax({
            type: 'POST',
            url: '/wp-admin/admin-ajax.php',
            dataType: 'html',
            data: {
                action: 'filter_projects',
                category: $(this).data('slug'),
            },
            success: function(res) {
                $('.fiveProjects').html(res);
            }
        });
        */
    });

    // Select the element by its class
    const elements = document.getElementsByClassName('cat-list_item');

    // Loop through the selected elements
    Array.from(elements).forEach((element) => {
    // Retrieve the text content
    const text = element.textContent.trim();

    // Split the text into an array of words
    const words = text.split(' ');

    // Get the last word
    const lastWord = words.pop();

    // Wrap the last word in a span
    const wrappedLastWord = `<span>${lastWord}</span>`;

    // Update the element with the wrapped last word
    element.innerHTML = words.join(' ') + ' ' + wrappedLastWord;
    });

    // Match Height
    window.addEventListener('load', function() {
        const flexItems = document.querySelectorAll('.caseStudy h2');
        
        // Find the maximum height among the flex items
        let maxHeight = 0;
        flexItems.forEach(function(item) {
            const height = item.offsetHeight;
            maxHeight = Math.max(maxHeight, height);
        });
        
        // Set the same height for all flex items
        flexItems.forEach(function(item) {
            item.style.height = maxHeight + 'px';
        });
    });

    gsap.registerPlugin(ScrollTrigger);

    const splitTitle = new SplitType(".revealTitle");

    gsap.set('.char:not(.filters .char)', { opacity: 0, y: 100 }); // Initial state of items, hidden and positioned off-screen
    gsap.set('.char:not(.caseStudiesArchive .char)', { opacity: 0, y: 100 }); // Initial state of items, hidden and positioned off-screen

    ScrollTrigger.batch('.char:not(.filters .char)', {
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
        let filterContainers = document.querySelectorAll('.filterContainer');
        let openingTitleLetters = document.querySelectorAll('.filterContainer .revealTitle .line .char');
        let filterBy = document.querySelectorAll('.filterContainer h4');
        let catList = document.querySelectorAll('.cat-list');
        let clearContainer = document.querySelector('.clearContainer');
        let infoContainer = document.querySelector('.infoContainer');
        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.caseStudiesArchive');
    
        tlHome.to(filterContainers, {opacity:1, x:0, duration: .5}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(filterBy, {opacity:1, x:0, duration: .5}) 
        tlHome.to(clearContainer, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(infoContainer, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(catList, {opacity:1, y:0, duration: .5}, "-=.5") 
    },

    // desktop
    [desktopBP]: function() {
        var tlHome = gsap.timeline({ease: "power3"})
        let filterContainers = document.querySelectorAll('.filterContainer');
        let openingTitleLetters = document.querySelectorAll('.filterContainer .revealTitle .line .char');
        let filterBy = document.querySelectorAll('.filterContainer h4');
        let catList = document.querySelectorAll('.cat-list');
        let clearContainer = document.querySelector('.clearContainer');
        let infoContainer = document.querySelector('.infoContainer');
        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.caseStudiesArchive');
    
        tlHome.to(filterContainers, {opacity:1, x:0, duration: .5}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(filterBy, {opacity:1, x:0, duration: .5}) 
        tlHome.to(clearContainer, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(infoContainer, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}, "-=.5")
        tlHome.to(catList, {opacity:1, y:0, duration: .5}, "-=.5") 
 
    },

    // tablet
    [tabletBP]: function() {
        var tlHome = gsap.timeline({ease: "power3"})
        let filterContainers = document.querySelectorAll('.filterContainer');
        let openingTitleLetters = document.querySelectorAll('.filterContainer .revealTitle .line .char');
        let filterBy = document.querySelectorAll('.filterContainer h4');
        let catList = document.querySelectorAll('.cat-list');
        let clearContainer = document.querySelector('.clearContainer');
        let infoContainer = document.querySelector('.infoContainer');
        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.caseStudiesArchive');
    
        tlHome.to(filterContainers, {opacity:1, x:0, duration: .5}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(filterBy, {opacity:1, x:0, duration: .5}) 
        tlHome.to(clearContainer, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(infoContainer, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(catList, {opacity:1, y:0, duration: .5}, "-=.5") 

    },

    // above mobile
    [largemobileBP]: function() {
        var tlHome = gsap.timeline({ease: "power3"})
        let filterContainers = document.querySelectorAll('.filterContainer');
        let openingTitleLetters = document.querySelectorAll('.filterContainer .revealTitle .line .char');
        let filterBy = document.querySelectorAll('.filterContainer h4');
        let catList = document.querySelectorAll('.cat-list');
        let clearContainer = document.querySelector('.clearContainer');
        let infoContainer = document.querySelector('.infoContainer');
        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.caseStudiesArchive');
    
        tlHome.to(filterContainers, {opacity:1, x:0, duration: .5}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(filterBy, {opacity:1, x:0, duration: .5}) 
        tlHome.to(clearContainer, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(infoContainer, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(catList, {opacity:1, y:0, duration: .5}, "-=.5") 

    },
    // mobile
    [mobileBP]: function() {
        var tlHome = gsap.timeline({ease: "power3"})
        let filterContainers = document.querySelectorAll('.filterContainer');
        let openingTitleLetters = document.querySelectorAll('.filterContainer .revealTitle .line .char');
        let filterBy = document.querySelectorAll('.filterContainer h4');
        let catList = document.querySelectorAll('.cat-list');
        let clearContainer = document.querySelector('.clearContainer');
        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.caseStudiesArchive');

        tlHome.to(filterContainers, {opacity:1, x:0, duration: .5}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(filterBy, {opacity:1, x:0, duration: .5}) 
        tlHome.to(clearContainer, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(catList, {opacity:1, y:0, duration: .5}, "-=.5") 

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

    }

    });

</script>