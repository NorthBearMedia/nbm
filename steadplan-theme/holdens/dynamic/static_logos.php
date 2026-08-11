<section class="staticLogos">
    <div class="wrapper">
        <h2><?php the_sub_field('section_title'); ?></h2>
        <?php if( have_rows('logo') ): ?>
            <ul class="logosWrapper">
                <?php while( have_rows('logo') ): the_row(); 
                $Logo = get_sub_field('logo_image'); ?>
                    <div class="logos-slide">
                        <?php echo wp_get_attachment_image( $Logo, 'full' ); ?>
                    </div>
                <?php endwhile; ?>
            </ul>
        <?php endif; ?>
    </div>
</section>