<?php 
    // Enqueue styles before get_header()
    function enqueue_blog_styles() {
        wp_enqueue_style('homeStyles');
        wp_enqueue_style('blogStyles');
    }
    add_action('wp_enqueue_scripts', 'enqueue_blog_styles', 20);
    
    get_header();
?>

<style>
    .arrowButton svg path {
        stroke: #fff;
    }
    .arrowButton span{
        color: #fff;
    }
    .pagination .page-numbers {
        color: #fff!important;
    }
</style>

<?php         
$paged = $wp_query->get( 'paged' );
?>

<?php if ( ! $paged || $paged < 2 ) { ?>

    <section class="latestArticle">
        <div class="wrapper">
            
            <div class="lower">
                <?php
                    $paged = (get_query_var('paged')) ? get_query_var('paged') : 1;

                    $args = array(
                        'post_type' => 'post',
                        'posts_per_page' => 1,
                        'paged' => $paged,
                    );

                    $posts_query = new WP_Query($args);

                    if ($posts_query->have_posts()) {
                        while ($posts_query->have_posts()) {
                            $posts_query->the_post();
                            $ID = get_the_ID();
                            ?>
                            <article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>

                                <a style="display;block;opacity:0;" href="<?php the_permalink(); ?>" class="blogImage imageTarget">

                                    <?php if (has_post_thumbnail()) { ?>
                                        <span class="featured-image">
                                            <?php the_post_thumbnail('blogFeatured'); ?>
                                        </span>
                                    <?php } ?>
 
                                </a>

                                <div class="blogTitle second" style="opacity:0;transform:translateY(50px);">
                                    <h1 class="arrowTitle">Featured Article</h1>
                                    <h2 class="entry-title"><?php the_title(); ?></h2>
                                    <div class="bottom">
                                        <a class="arrowButton" href="<?php the_permalink(); ?>">
                                            <span>Read more</span>
                                            <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="32.694" height="31.972" viewBox="0 0 32.694 31.972"><g transform="translate(1 15.986) rotate(-45)"><g transform="translate(4.765 4.765)"><path d="M16.646,0V16.646H0" transform="translate(0 0)" fill="none" stroke="#2B2E34" stroke-width="2"/></g><g transform="translate(0 0)"><path d="M21.193,21.193,0,0" fill="none" stroke="#2B2E34" stroke-width="2"/></g></g></svg>
                                            <svg preserveAspectRatio="none" class="bg" xmlns="http://www.w3.org/2000/svg" width="176" height="61" viewBox="0 0 176 61"><g fill="none" stroke="#ed4133" stroke-width="2"><rect width="176" height="61" rx="10" stroke="none"/><rect x="1" y="1" width="174" height="59" rx="9" fill="none"/></g></svg>    
                                        </a>
                                    </div>
                                </div>

                            </article>
                            <?php
                        }
                    } else {
                        echo 'No posts found.';
                    }

                    // Restore original post data
                    wp_reset_postdata();
                ?>
            </div>
        </div>
    </section>

<?php } else { ?>

    <!-- paginated - page 2 or above here -->

<?php } ?>

<section class="otherArticles" style="opacity:0;transform:translateY(50px);">
    <div class="wrapper">
        <?php
            $paged = (get_query_var('paged')) ? get_query_var('paged') : 1;

            // Get the ID of the latest post
            $latest_post_id = get_posts(array(
                'post_type' => 'post',
                'posts_per_page' => 1,
                'fields' => 'ids',
            ))[0];

            // Query all posts except the latest one
            $args = array(
                'post_type' => 'post',
                'post__not_in' => array($latest_post_id),
                'posts_per_page' => -1,
                'paged' => $paged,
            );

            $posts_query = new WP_Query($args);

            if ($posts_query->have_posts()) {
                while ($posts_query->have_posts()) {
                    $posts_query->the_post();
                    $ID = get_the_ID();
                    ?>
                    <article class="onScreen" id="post-<?php the_ID(); ?>" <?php post_class(); ?>>

                        <a href="<?php the_permalink(); ?>" style="display;block;">    
                            <?php if (has_post_thumbnail()) { ?>
                                <div class="featured-image imageTarget" style="opacity:0;">
                                    <?php the_post_thumbnail('blogThumb'); ?>
                                </div>
                            <?php } ?>
                        </a>

                        <div class="lower">
                            <div class="upper">
                                <h2 class="entry-title"><?php the_title(); ?></h2>
                            </div>
                            <a class="arrowButton" href="<?php the_permalink(); ?>">
                                <span>Read more</span>
                                <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="32.694" height="31.972" viewBox="0 0 32.694 31.972"><g transform="translate(1 15.986) rotate(-45)"><g transform="translate(4.765 4.765)"><path d="M16.646,0V16.646H0" transform="translate(0 0)" fill="none" stroke="#2B2E34" stroke-width="2"/></g><g transform="translate(0 0)"><path d="M21.193,21.193,0,0" fill="none" stroke="#2B2E34" stroke-width="2"/></g></g></svg>
                                <svg preserveAspectRatio="none" class="bg" xmlns="http://www.w3.org/2000/svg" width="176" height="61" viewBox="0 0 176 61"><g fill="none" stroke="#ed4133" stroke-width="2"><rect width="176" height="61" rx="10" stroke="none"/><rect x="1" y="1" width="174" height="59" rx="9" fill="none"/></g></svg>    
                            </a>
                        </div>
                        
                    </article>


                    <?php
                    
                }
            } else {
                // echo 'No posts found.';
            }

            // Restore original post data
            wp_reset_postdata();

            echo '<div class="pagination">';

            $big = 999999999; 

            echo paginate_links( array(
            'base' => str_replace( $big, '%#%', get_pagenum_link( $big ) ),
            // 'base' => str_replace( $big, '%#%', esc_url( get_pagenum_link( $big ) ) ),
            'format' => '?paged=%#%',
            'current' => max( 1, get_query_var('paged') ),
            'total' => $posts_query->max_num_pages
            ) );

            echo '</div>';

            
        ?>
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
            let titles = document.querySelectorAll('.blogTitle');
            let blogImage = document.querySelectorAll('.imageTarget');
            let otherArticles = document.querySelector('.otherArticles');
            let topBG = document.querySelector('.topBG');
            let nav = document.querySelector('header');


            tlHome.to(titles, {opacity:1, y:0, duration: .3, delay: 0.1})
            tlHome.to(blogImage, {opacity:1, duration: .3}, "-=.3")
            tlHome.to(nav, {y:0, duration: .3}, "-=.3")
            tlHome.to(topBG, {opacity:1, duration: 1})
            tlHome.to(otherArticles, {opacity:1, duration: .5, y:0}, "-=1")

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