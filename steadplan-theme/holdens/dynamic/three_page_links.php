<section class="threePageLinks">
    <div class="wrapper">
        <?php if( have_rows('page_link_item') ): ?>
            <div class="linksWrap">
                <?php while( have_rows('page_link_item') ): the_row(); ?>                    
                    <div class="link onScreen fadeUp" style="background-image:url(<?php the_sub_field('background_image'); ?>;">
                        <div class="overlay"></div>
                        <h3><?php the_sub_field('page_title'); ?></h3>
                        <div class="desc">
                            <?php the_sub_field('page_description'); ?>
                        </div>
                        <div class="buttonWrap">
                            <a class="arrowButton" href="<?php the_sub_field('page_link'); ?>">
                                <span><?php the_sub_field('button_text'); ?></span>
                                <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="32.694" height="31.972" viewBox="0 0 32.694 31.972"><g transform="translate(1 15.986) rotate(-45)"><g transform="translate(4.765 4.765)"><path d="M16.646,0V16.646H0" transform="translate(0 0)" fill="none" stroke="#e8e8e8" stroke-width="2"/></g><g transform="translate(0 0)"><path d="M21.193,21.193,0,0" fill="none" stroke="#e8e8e8" stroke-width="2"/></g></g></svg>
                                <svg preserveAspectRatio="none" class="bg" xmlns="http://www.w3.org/2000/svg" width="176" height="61" viewBox="0 0 176 61"><g fill="none" stroke="#ed4133" stroke-width="2"><rect width="176" height="61" rx="10" stroke="none"/><rect x="1" y="1" width="174" height="59" rx="9" fill="none"/></g></svg>    
                            </a>
                        </div>
                    </div>
                <?php endwhile; ?>
            </div>
        <?php endif; ?>
    </div>
</section>