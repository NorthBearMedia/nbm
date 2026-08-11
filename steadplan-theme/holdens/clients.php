<section class="homeClients">
    <div class="titleWrapper">
        <h2 class="regular secondTitle arrowTitle revealTitle">Clients<svg class="char" xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#fff" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#fff" stroke-width="2"/></g></g></svg></h2>
    </div>
    <div class="wrapper"> 

        <?php if( have_rows('client_logos', 2) ): ?>
            <ul class="clientLogos onScreen">
            <?php while( have_rows('client_logos', 2) ): the_row(); 
                $clientLogo = get_sub_field('client_logo', 2); ?>
                <li>
                    <?php echo wp_get_attachment_image( $clientLogo, 'full' ); ?>
                </li>
            <?php endwhile; ?>
            </ul>
        <?php endif; ?>
    </div> 
    <div class="allWorkLink">
        <div class="wrapper">
            <div class="left"></div>
            <div class="right onScreen">
                <a href="<?php echo esc_url( home_url( '/' ) ); ?>work" class="newCTA blackOutline">
                    <span class="text">All Work</span>
                    <span class="svgWrap">
                        <svg xmlns="http://www.w3.org/2000/svg" width="42.54" height="42.54" viewBox="0 0 42.54 42.54"><g transform="translate(0.707 0.707)"><g transform="translate(9.087 9.087)"><path d="M-6.463,0V31.746H-38.209" transform="translate(38.209)" fill="none" stroke="#101010" stroke-width="2"/></g><g transform="translate(0 0)"><path d="M-8.228-8.228-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#101010" stroke-width="2"/></g></g></svg>
                    </span>
                </a>
            </div>
        </div>
    </div>
</section>