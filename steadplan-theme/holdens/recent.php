<section class="relatedArticles onScreen fadeUp">
    <div class="wrapper">
        <?php 
        // The Query
        $next_args = array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 2,
            'post__not_in' => array( get_the_ID() ) // Exclude the current post
        );

        $next_the_query = new WP_Query( $next_args );

        // The Loop
        if ( $next_the_query->have_posts() ) {
            while ( $next_the_query->have_posts() ) {
                $next_the_query->the_post();
                $ID = get_the_ID();
        ?>

        <article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
            <a href="<?php the_permalink(); ?>" class="overlay"></a>
               
            <?php if (has_post_thumbnail()) { ?>
                <div class="featured-image">
                    <?php the_post_thumbnail('blogFeatured'); ?>
                </div>
            <?php } ?>

            <div class="lower">
                <div class="upper">
                    <h2 class="entry-title"><?php the_title(); ?></h2>
                </div>
            </div>
        </article>

        <?php }
        } else {
            // no posts found
        }
        // Restore original Post Data
        wp_reset_postdata();
        ?>
    </div>
</section>