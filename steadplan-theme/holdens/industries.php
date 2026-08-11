<section class="industries">
    <div class="allWorkLink">
        <div class="wrapper">
            <div class="left"></div>
            <div class="right onScreen">
                <a href="<?php echo esc_url( home_url( '/' ) ); ?>work" class="newCTA blackOutline">
                    <span class="text">All Industries</span>
                    <span class="svgWrap">
                        <svg xmlns="http://www.w3.org/2000/svg" width="42.54" height="42.54" viewBox="0 0 42.54 42.54"><g transform="translate(0.707 0.707)"><g transform="translate(9.087 9.087)"><path d="M-6.463,0V31.746H-38.209" transform="translate(38.209)" fill="none" stroke="#101010" stroke-width="2"/></g><g transform="translate(0 0)"><path d="M-8.228-8.228-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#101010" stroke-width="2"/></g></g></svg>
                    </span>
                </a>
            </div>
        </div>
    </div>
    <div class="faces">
    </div>
    <div class="wrapper">

        <div class="topWrapper">
            <h2 class="regular secondTitle arrowTitle revealTitle">Industries<svg class="char" xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#fff" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#fff" stroke-width="2"/></g></g></svg></h2>
            <span class="miniText onScreen">Click below to view our work in this industry</span>
        </div>
        <div class="innerWrapper">

            <div class="serviceLinks">
                <?php if( have_rows('industry_links',2) ): ?>
                    <div class="serviceLinksInner industryLinksInner">
                    <?php while( have_rows('industry_links',2) ): the_row(); ?>
                        <a class="onScreen" href="<?php the_sub_field('industry_link',2); ?>">
                            <div class="bg" style="background-image: url(<?php the_sub_field('industry_small_button_bg_on_hover',2); ?>);"></div>
                            <span><?php the_sub_field('industry_link_title',2); ?></span>
                            <span><?php the_sub_field('industry_link_title',2); ?></span>
                        </a>
                    <?php endwhile; ?>
                    </div>
                <?php endif; ?>
            </div>
            <!-- <svg xmlns="http://www.w3.org/2000/svg" width="1693.829" height="1015.384" viewBox="0 0 1693.829 1015.384"><g transform="translate(0)"><g transform="matrix(0.788, 0.616, -0.616, 0.788, 3245.036, -4781.987)"><rect width="285" height="285" rx="138" transform="translate(1516 4884)" fill="#fa4638"/><text transform="translate(1613 5036)" fill="#f7f7f7" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">VR / AR</tspan></text></g><g transform="matrix(0.788, 0.616, -0.616, 0.788, 3589.407, -3687.226)"><rect width="326" height="275" rx="137.5" transform="translate(398 4795)" fill="#6f7175"/><text transform="translate(529 4942)" fill="#fff" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Films</tspan></text></g><g transform="translate(3665.713 -3748.286) rotate(45)"><rect width="285" height="285" rx="138" transform="translate(788 4993)" fill="#e8e8e8"/><text transform="translate(914 5145)" fill="#6f7175" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">TV</tspan></text></g><g transform="translate(-3311.645 -2800.247) rotate(-42)"><rect width="326" height="275" rx="137.5" transform="translate(767 4795)" fill="#101010"/><text transform="translate(857 4941)" fill="#8c8c8d" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Advertising </tspan></text></g><g transform="translate(-2762.16 -3604.244) rotate(-31)"><rect width="424" height="275" rx="137.5" transform="translate(265 5271)" fill="#e8e8e8"/><text transform="translate(339 5418)" fill="#6f7175" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Immersive </tspan><tspan y="0" font-family="Helvetica" font-weight="400">Technology</tspan></text></g><g transform="translate(-1879.313 -3849.173) rotate(-20)"><rect width="285" height="285" rx="138" transform="translate(1085 5271)" fill="#e8e8e8"/><text transform="translate(1156 5423)" fill="#6f7175" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Automotive</tspan></text></g><g transform="matrix(0.848, 0.53, -0.53, 0.848, 2905.606, -4228.94)"><rect width="285" height="285" rx="138" transform="translate(720 5271)" fill="#fa4638"/><text transform="translate(816 5419)" fill="#f7f7f7" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Fashion</tspan></text></g><g transform="translate(-86.17 -4584.477)"><rect width="393" height="275" rx="137.5" transform="translate(1387 5271)" fill="#6f7175"/><text transform="translate(1474 5418)" fill="#e8e8e8" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Drinks &amp; </tspan><tspan y="0" font-family="Helvetica" font-weight="400">Beverages</tspan></text></g><g transform="translate(5853.451 -1776.532) rotate(81)"><rect width="341" height="273" rx="136.5" transform="translate(1141 4795)" fill="#e8e8e8"/><text transform="translate(1257 4941)" fill="#6f7175" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Wellness</tspan></text></g><g transform="translate(-4978.523 55.059) rotate(-79)"><rect width="423" height="275" rx="137.5" transform="translate(266 5020)" fill="#6f7175"/><text transform="translate(379 5167)" fill="#e8e8e8" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Kids / Children’s</tspan></text></g><g transform="translate(132.83 -4631.477)"><rect width="285" height="285" rx="138" transform="translate(108 4783)" fill="#fa4638"/><text transform="translate(214 4935)" fill="#f7f7f7" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Music</tspan></text></g><g transform="matrix(0.839, -0.545, 0.545, 0.839, -2530.588, -3053.586)"><rect width="285" height="285" rx="138" transform="translate(1085 4992)" fill="#101010"/><text transform="translate(1180 5144)" fill="#8c8c8d" font-size="26" font-family="DMSans-Medium, DM Sans Medium" font-weight="500"><tspan x="0" y="0">Gaming</tspan></text></g></g></svg> -->

            <!-- <div class="industry darkGrey largePill">Kid's / Children's</div>
            <div class="industry red circle">Music</div>
            <div class="industry black pill">Advertising</div>
            <div class="industry grey circle">TV</div>
            <div class="industry grey largePill">Immersive Technology</div>
            <div class="industry red circle">Fashion</div>
            <div class="industry darkGrey largePill">Films</div>
            <div class="industry grey pill">Wellness</div>
            <div class="industry red circle">VR / AR</div>
            <div class="industry black circle">Gaming</div>
            <div class="industry red circle">Automotive</div>
            <div class="industry darkGrey largePill">Drinks &amp; Beverages</div> -->
        </div>
    </div>
</section>