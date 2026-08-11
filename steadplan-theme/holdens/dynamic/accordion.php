<?php if( have_rows('accordion_items') ): ?>
    <section class="allAccordions">
        <div class="wrapper">
            <?php while( have_rows('accordion_items') ): the_row(); ?>
                <div class="accordionWrapper">
                    <h3 class="accordion">
                        <div class="svg"></div>    
                        <span><?php the_sub_field('accordion_item_title'); ?></span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><g transform="translate(-1725 -609)"><g transform="translate(1725 609)" fill="none" stroke="#f94638" stroke-width="2"><circle cx="28" cy="28" r="28" stroke="none"/><circle cx="28" cy="28" r="27" fill="none"/></g><g transform="translate(28.2 -0.301)"><g transform="translate(1716.801 629.301) rotate(45)"><line x2="23.889" transform="translate(0 0)" fill="none" stroke="#f94638" stroke-width="2"/></g><g transform="translate(1733.692 629.301) rotate(135)"><line x2="23.889" transform="translate(0 0)" fill="none" stroke="#f94638" stroke-width="2"/></g></g></g></svg>
                    </h3>
                    <div class="panel">
                        <div class="content">
                            <?php the_sub_field('accordion_item_description'); ?>
                        </div>
                    </div>
                </div>
            <?php endwhile; ?>
        </div>
    </section>
<?php endif; ?>