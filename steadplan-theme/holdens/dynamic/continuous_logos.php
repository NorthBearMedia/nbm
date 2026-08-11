<section class="continuousLogos tabletLogos">
    <div class="parallaxbg"></div>
    <div class="wrapper">
        <h2><?php the_sub_field('section_title'); ?></h2>
        <?php if( have_rows('logo') ): ?>
            <ul class="scrollLogosWrapper scrollLogosWrapper1">
                <?php 
                $counter = 0;
                while( have_rows('logo') ): the_row(); 
                $Logo = get_sub_field('logo_image'); 
                if ($counter % 2 == 0):
                ?>
                <div class="logos-slide">
                    <?php echo wp_get_attachment_image( $Logo, 'full' ); ?>
                </div>
                <?php 
                endif;
                $counter++;
                endwhile;
                ?>
            </ul>
            <ul class="scrollLogosWrapper scrollLogosWrapper2" dir="rtl" style="margin-top:4rem;">
                <?php 
                $counter = 0;
                while( have_rows('logo') ): the_row(); 
                $Logo = get_sub_field('logo_image'); 
                if ($counter % 2 != 0):
                ?>
                <div class="logos-slide">
                    <?php echo wp_get_attachment_image( $Logo, 'full' ); ?>
                </div>
                <?php 
                endif;
                $counter++;
                endwhile;
                ?>
            </ul>
        <?php endif; ?>
    </div>
</section>
<section class="continuousLogos mobileLogos">
    <div class="parallaxbg"></div>
    <div class="wrapper">
        <h2><?php the_sub_field('section_title'); ?></h2>
        <?php if( have_rows('logo') ): ?>
            <ul class="scrollLogosWrapper">
                <?php while( have_rows('logo') ): the_row(); 
                $Logo = get_sub_field('logo_image'); ?>
                    <div class="logos-slide onScreen fadeUp">
                        <?php echo wp_get_attachment_image( $Logo, 'full' ); ?>
                    </div>
                <?php endwhile; ?>
            </ul>
        <?php endif; ?>
    </div>
</section>