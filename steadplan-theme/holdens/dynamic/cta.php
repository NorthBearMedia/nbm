<section class="cta onScreen <?php the_sub_field('section_id'); ?>">
    <div class="sectionTop" id="<?php the_sub_field('section_id'); ?>"></div>
    <div class="wrapper">
        <div class="topLeftSVG organisation">
            <?php the_sub_field('left_svg'); ?>
        </div>
        
        <div class="mainMessage onScreen">
            <?php the_sub_field('main_message'); ?>
        </div>
        <div class="buttonWrapper onScreen">
            <a href="mailto:<?php the_sub_field('email_address'); ?>">
                <svg class="buttonBG" xmlns="http://www.w3.org/2000/svg" width="565.094" height="262.799" viewBox="0 0 565.094 262.799"><path d="M563.594,130.649c0,102.781-59.514,130.649-281.8,130.649C58.918,261.3,0,233.43,0,130.649,0,28.144,58.918,0,281.8,0c222.283,0,281.8,28.144,281.8,130.649" transform="translate(0.75 0.75)" fill="none" stroke="#fff" stroke-width="1.5"/></svg>
                <span><?php the_sub_field('email_address'); ?></span>
            </a>
        </div>
        <div class="bottomRightSVG organisation">
            <?php the_sub_field('right_svg'); ?>
        </div>
    </div>
</section>