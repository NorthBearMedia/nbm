<section class="introduction" style="background-color: #2B2E34;">
    <div class="innerIntro">
        <div class="overlay"></div>
            <!-- This gets a background image if it is set. If not, it will get the video -->
            <?php
                // Get the background image sub field value (assumes it's the image URL)
                $background_image_url = get_sub_field('background_image');
                

                // Check if the background_image sub field has a value
                if ($background_image_url) {
                    // Display the <div> with the background image
                    echo '<div class="imageContainer topBG" style="opacity:0;background-image: url(' . esc_url($background_image_url) . ');">';
                    // Your content goes here (if any)
                    echo '</div>';
                } else {
                    // Display the Vimeo video <iframe> if the background_image sub field is empty
                    $video_id = get_sub_field('header_background_video');

                    if ( is_front_page() ) {                        
                        // echo '<iframe style="opacity:0;" class="vimeoVid topBG desktopVid" src="https://player.vimeo.com/video/869253435?&amp;autoplay=1&amp;loop=1&amp;autopause=0&amp;muted=1&amp;background=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="" title="Banner UK" data-ready="true" frameborder="0"></iframe>';
                        echo '<video style="opacity:0;" class="vimeoVid topBG desktopVid" style="opacity:0;" autoplay muted loop playsinline preload="auto">
                            <!-- Cloudflare Holdens Account - holdensdigital@gmail.com -->
                            <source src="https://media.holdens.space/steadplan/steadplan_promo_video.webm" type="video/webm">
                            <source src="https://media.holdens.space/steadplan/steadplan_promo_video.mp4" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>';
                        // echo '<iframe style="opacity:0;" class="vimeoVid topBG mobileVid" src="https://player.vimeo.com/video/869061484?&amp;autoplay=1&amp;loop=1&amp;autopause=0&amp;muted=1&amp;background=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="" title="Banner UK" data-ready="true" frameborder="0"></iframe>';
                        echo '<video style="opacity:0;" class="vimeoVid topBG mobileVid" style="opacity:0;" autoplay muted loop playsinline preload="auto">
                        <!-- Cloudflare Holdens Account - holdensdigital@gmail.com -->
                        <source src="https://media.holdens.space/steadplan/steadplan_promo_mobile.webm" type="video/webm">
                        <source src="https://media.holdens.space/steadplan/steadplan_promo_mobile.mp4" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>';
                    } else {
                        echo '<iframe style="opacity:0;" class="vimeoVid topBG" src="https://player.vimeo.com/video/' . $video_id . '&amp;autoplay=1&amp;loop=1&amp;autopause=0&amp;muted=1&amp;background=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="" title="Banner UK" data-ready="true" frameborder="0"></iframe>';
                    }
                }
            ?>
        <div class="wrapper">
            <div class="titleWrapper">
                <h1 style="opacity:0;transform:translateY(-50px);" class="<?php the_sub_field('center_the_title'); ?> revealTitle"><?php the_sub_field('main_title'); ?></h1>
                <h2 style="opacity:0;transform:translateY(-50px);" class="<?php the_sub_field('center_the_title'); ?>"><?php the_sub_field('sub_title'); ?></h2>
            </div>
            <?php if( have_rows('buttons') ): ?>
                <div class="buttonsWrap" style="opacity:0;transform:translateY(50px);">
                    <?php while( have_rows('buttons') ): the_row(); ?>
                        <?php if( get_sub_field('external_website_link') ) { ?>
                            <a target="_blank" class="button glassButton uppercase" href="<?php the_sub_field('button_link'); ?>"><?php the_sub_field('button_text'); ?></a>
                        <?php } else { ?>
                            <a class="button glassButton uppercase" href="<?php the_sub_field('button_link'); ?>"><?php the_sub_field('button_text'); ?></a>
                        <?php } ?>
                    <?php endwhile; ?>
                </div>
            <?php endif; ?>
            <div class="downWrapper" style="opacity:0;transform:translateY(50px);">
                <a href="#more" class="down">
                    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="65.531" viewBox="0 0 38 65.531"><g transform="translate(-940.893 -992.469)"><g transform="translate(960 1030.617) rotate(45)"><g transform="translate(-2.88 -2.88)"><path class="arrowLine" d="M9.7,0V9.7H0" transform="translate(0 0)" fill="none" stroke="#e3f74d" stroke-width="2"/></g><g transform="translate(-13.779 -13.779)"><path class="arrowLine" d="M20.474,20.474,0,0" fill="none" stroke="#e3f74d" stroke-width="2"/></g></g><g transform="translate(978.893 992.469) rotate(90)" fill="none" stroke="#e3f74d" stroke-width="2"><rect width="65.531" height="38" rx="19" stroke="none"/><rect x="1" y="1" width="63.531" height="36" rx="18" fill="none"/></g></g></svg>
                </a>
            </div>
        </div>
    </div>
</section>
<section class="" id="more"></section>