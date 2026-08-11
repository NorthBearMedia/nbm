<section class="testimonialsSection <?php the_sub_field('center_testimonials_text'); ?> onScreen">
    <?php if( have_rows('testimonial') ): ?>
        <div class="wrapper">
            <h2 class="uppercase">What our customers are saying</h2>
            <div class="testimonialsWrapper">
                <?php while( have_rows('testimonial') ): the_row(); ?>
                    <div class="testimonial">
                        <div class="text">
                            <?php the_sub_field('testimonial_text'); ?>
                        </div>
                        <div class="author">
                            <div class="left">
                                <span><?php the_sub_field('testimonial_author'); ?></span>
                                <span><?php the_sub_field('company'); ?></span>
                            </div>
                            <div class="stars">
                                <svg xmlns="http://www.w3.org/2000/svg" width="270" height="41.9" viewBox="0 0 270 41.9"><g transform="translate(-1195 -1665.408)"><path d="M5147,57.007,5131,64.9l6.181-16.181L5126,38h15.271L5147,23l5.575,15H5168l-11.361,10.934,5.934,15.966Z" transform="translate(-3760 1642.409)" fill="#6f49f6"/><path d="M5147,57.007,5131,64.9l6.181-16.181L5126,38h15.271L5147,23l5.575,15H5168l-11.361,10.934,5.934,15.966Z" transform="translate(-3817 1642.409)" fill="#6f49f6"/><path d="M5147,57.007,5131,64.9l6.181-16.181L5126,38h15.271L5147,23l5.575,15H5168l-11.361,10.934,5.934,15.966Z" transform="translate(-3874 1642.409)" fill="#6f49f6"/><path d="M5147,57.007,5131,64.9l6.181-16.181L5126,38h15.271L5147,23l5.575,15H5168l-11.361,10.934,5.934,15.966Z" transform="translate(-3931 1642.409)" fill="#6f49f6"/><path d="M5147,57.007,5131,64.9l6.181-16.181L5126,38h15.271L5147,23l5.575,15H5168l-11.361,10.934,5.934,15.966Z" transform="translate(-3703 1642.409)" fill="#6f49f6"/></g></svg>
                            </div>
                        </div>
                    </div>
                <?php endwhile; ?>
            </div>
        </div>
    <?php endif; ?>
</section>