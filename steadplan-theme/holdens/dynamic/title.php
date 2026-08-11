<?php
if( get_sub_field('uppercase') ) {
    $uppercase = 'uppercase';
}
?>
<section class="sectionTitle <?php the_sub_field('class'); ?>">
    <div class="wrapper">
        <div class="titleWrapper <?php the_sub_field('center_text'); ?>">    
            <!-- The h_tag field gets either h2, h3 or h4 in the admin -->       
            <<?php the_sub_field('h_tag'); ?>><?php the_sub_field('title'); ?></<?php the_sub_field('h_tag'); ?>>
        </div>
    </div>
</section>