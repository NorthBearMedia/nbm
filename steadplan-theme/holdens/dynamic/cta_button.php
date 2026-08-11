<?php
if( get_sub_field('uppercase') ) {
    $uppercase = 'uppercase';
}
?>
<section class="buttonSection">
    <div class="wrapper">
        <a target="<?php the_sub_field('external_link'); ?>" href="<?php the_sub_field('button_text'); ?>" class="<?php echo $uppercase; ?> <?php the_sub_field('button_class'); ?>"><?php the_sub_field('button_text'); ?></a>
    </div>
</section>