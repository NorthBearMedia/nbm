<?php
/**
 * Dynamic Content
 */

if( have_rows('flexible_content') ){
    while ( have_rows('flexible_content') ) {
        the_row();
        $templateName = get_row_layout();
        get_template_part( 'dynamic/'.$templateName );
    }
}

?>