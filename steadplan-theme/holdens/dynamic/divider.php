<section class="dividerSection">
    <?php if( get_sub_field('full_width') ) { ?>
        <div class="divider" style="height: <?php the_sub_field('divider_height'); ?>;background-color: <?php the_sub_field('divider_colour'); ?>"></div>
    <?php } else { ?>
        <div class="wrapper">
            <div class="divider" style="height: <?php the_sub_field('divider_height'); ?>;background-color: <?php the_sub_field('divider_colour'); ?>"></div>
        </div>
    <?php } ?>
</section>