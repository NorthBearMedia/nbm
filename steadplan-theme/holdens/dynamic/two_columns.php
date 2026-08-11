<section class="twoColumns">
    <div class="wrapper <?php the_sub_field('vertically_align_columns_centrally'); ?> <?php the_sub_field('reverse_the_order_on_mobile'); ?>">
        <?php if( have_rows('column_type') ): ?>
            <?php while( have_rows('column_type') ): the_row(); ?>
                <?php if( get_sub_field('column_image') ) { 
                $columnImage = get_sub_field('column_image'); 
                $imageSize = 'full';
                ?>
                <div class="column">
                    <div class="imageWrapper onScreen fadeIn">
                        <img src="<?php echo $columnImage['sizes']['full']; ?>" width="<?php echo $columnImage['sizes']['full-width']; ?>" height="<?php echo $columnImage['sizes']['full-height']; ?>" alt="<?php echo $columnImage['alt']; ?>" />
                    </div>
                </div>
                <?php } elseif( get_sub_field('column_video') ) { ?>
                    <div class="column onScreen fadeIn">
                        <div class="embed-container">
                            <div class="playButton">
                                <svg height="135" width="135" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 135 135" style="enable-background:new 0 0 135 135" xml:space="preserve"><path d="M67.5 129.5c-34.2 0-62-27.8-62-62s27.8-62 62-62 62 27.8 62 62-27.8 62-62 62z" style="fill:#ed4233;stroke:#fff;stroke-width:3;stroke-miterlimit:10"/><path d="M58.7 38v59c0 1.8 2.2 2.7 3.4 1.4L91.5 69c.8-.8.8-2 0-2.8L62.1 36.6c-1.3-1.2-3.4-.3-3.4 1.4z" style="fill:#fff"/></svg>
                            </div>
                            <video controls>
                                <!-- Cloudflare Holdens Account - holdensdigital@gmail.com -->
                                <source src="https://media.holdens.space/steadplan/steadplan_promo_video_audio.webm" type="video/webm">
                                <source src="https://media.holdens.space/steadplan/steadplan_promo_video_audio.mp4" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>    
                        </div>
                    </div>
                <?php } elseif( get_sub_field('column_svg') ) { ?>
                    <div class="column onScreen fadeIn" style="text-align:center;">
                        <?php the_sub_field('column_svg'); ?>
                    </div>
                <?php } else { ?>
                    <div class="column textWrapper onScreen fadeUp">
                        <?php the_sub_field('column_text'); ?>
                    </div>
                <?php } ?>
            <?php endwhile; ?>
        <?php endif; ?>
    </div>
</section>