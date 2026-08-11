<section class="gallery <?php the_sub_field('section_id'); ?>">
    <div class="sectionTop" id="<?php the_sub_field('section_id'); ?>"></div>
    <div class="wrapper">
        <?php if( have_rows('gallery_images') ): ?>
            <div class="galleryWrap reveal">
                <?php while( have_rows('gallery_images') ): the_row(); ?>
                    <?php $gallImage=get_sub_field('gallery_image'); ?>
                    <div class="imageWrapper">
                        <img src="<?php echo $gallImage['sizes']['home-gallery-2']; ?>" width="<?php echo $gallImage['sizes']['home-gallery-2-width']; ?>" height="<?php echo $gallImage['sizes']['home-gallery-2-height']; ?>" alt="<?php echo $gallImage['alt']; ?>" />
                    </div>
                <?php endwhile; ?>
            </div>
        <?php endif; ?>
    </div>
</section>