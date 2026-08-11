<!DOCTYPE html>
<html class="no-js" <?php language_attributes(); ?>>
    
    <?php get_header(); ?>

    <body <?php body_class(); ?>>
        
        <main>

            <section class="newsIntro">
                <img class="topLeftBG reveal" src="<?php echo get_template_directory_uri(); ?>/images/openTopBG.jpg" alt="Open Minds - Open Green Energy">
                <div class="wrapper">
                    <div class="textWrapper">
                        <h1 class="reveal"><?php _e( 'Search ', 'foundationpress' ); ?><span class="second"><?php _e( 'results for:', 'foundationpress' ); ?></span><br><span class="resultsWording" style="font-weight:400;">'<?php echo get_search_query(); ?>'</span></h1>
 
                        <div class="searchBox reveal" id="searchBox">
                            <?php get_search_form(); ?>
                        </div>
                       
                        <div class="downWrapper simpleActive">
                            <a class="smooth goingDown reveal" href="#down">
                                <svg class="downArrow" xmlns="http://www.w3.org/2000/svg" width="14.212" height="13.985" viewBox="0 0 14.212 13.985"><g transform="translate(-784.215 -694.253)"><path d="M0,0,6.753,6.753,0,13.505" transform="translate(798.074 700.778) rotate(90)" fill="none" stroke="#0f05e3" stroke-width="1"/><path d="M0,0,6.753,6.753,0,13.505" transform="translate(798.074 694.607) rotate(90)" fill="none" stroke="#0f05e3" stroke-width="1"/></g></svg>
                            </a>
                        </div>
                    </div>
                </div>
                <img class="botRightBG reveal" src="<?php echo get_template_directory_uri(); ?>/images/openTopBG.jpg" alt="Open Minds - Open Green Energy">
            </section>

            <section class="topNews searchNews" id="down">
                <div class="wrapper">


                <?php if ( have_posts() ) : ?>
                    <div class="newspageWrapper">
                    <?php while ( have_posts() ) : the_post(); ?>

                                <a href="<?php the_permalink() ?>" class="newsItem reveal">
                            
                                    <div class="imageWrapper">
                                        <?php the_post_thumbnail('newsSquare'); ?>
                                    </div>
                                    <div class="textWrapper">
                                        <div class="topWrap">
                                            <h3><span class="underline"><?php the_title(); ?></span></h3>

                                            <!-- by default, the 'n' in date only get a single number
                                            for 0-9 months of the year, eg. January is 1, not 01.
                                            This statement below checks if the number is between 1 and 9,
                                            and adds a 0 in front if it is. Otherwise, it just gets the number
                                            for October onwards as this will be 10 or above. -->

                                            <?php $date = get_the_date('n'); 
                                                if($date <= 9) {
                                                    $fullMonth = '0'.$date;
                                                } else {
                                                    $fullMonth = $date;
                                                }
                                                $fullDate = get_the_date('d.'.$fullMonth.'.Y');
                                            ?>

                                            <span class="date"><?php echo $fullDate; ?></span>
                                        </div>

                                        <div class="excerpt"><?php the_excerpt(); ?></div>
                                        
                                        <div class="readWrapper">
                                            <span class="button blueOutline arrow">Read</span>  
                                            <div class="author">
                                                By <?php echo get_the_author_meta( 'first_name' ); ?> <?php echo get_the_author_meta( 'last_name' ); ?>
                                                <!-- Get author image - custom field -->
                                                <?php
                                                $author_id = get_the_author_meta('ID');
                                                $author_badge = get_field('profile_image', 'user_'. $author_id );
                                                ?>
                                                <img height="42" width="42" src="<?php echo $author_badge['url']; ?>" alt="<?php echo $author_badge['alt']; ?>" />
                                            </div>
                                        </div>
                                    </div>
                                        
                                </a>

                                <?php endwhile; ?>
                        </div>

                        <?php else : ?>
                            
                            <?php get_template_part( 'template-parts/content', 'none' ); ?>

                        <?php endif; ?>

                    </div>
                </div>
            </section>
            
        </main>
        <?php get_footer(); ?>
    </body>
</html>