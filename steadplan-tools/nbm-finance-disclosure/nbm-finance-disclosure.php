<?php
/**
 * Plugin Name: NBM Finance Commission Disclosure
 * Description: Adds the FCA finance commission disclosure to the small print at the bottom of every page. Kept as a plugin so the wording can ship without a theme deploy; move into footer.php at the next theme release.
 * Version: 1.0.0
 * Author: North Bear Media
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

function nbm_finance_disclosure_text() {
    // Wording supplied by Steadplan (Mark Kilner, 21 Sep 2026). Edit here only.
    return get_option( 'nbm_finance_disclosure_text', '' );
}

add_action( 'wp_footer', function () {
    $text = trim( nbm_finance_disclosure_text() );
    if ( '' === $text ) { return; }
    echo '<section class="nbm-legal" style="background:#151b25;color:#adadad;font-size:12px;line-height:1.6;padding:18px 20px 22px;">'
        . '<div class="wrapper" style="max-width:1400px;margin:0 auto;">'
        . wp_kses_post( wpautop( $text ) )
        . '</div></section>';
}, 5 );

// Admin-only REST route so the wording can be set and updated without wp-admin.
add_action( 'rest_api_init', function () {
    register_rest_route( 'nbm/v1', '/finance-disclosure', array(
        array(
            'methods'             => 'GET',
            'permission_callback' => function () { return current_user_can( 'manage_options' ); },
            'callback'            => function () { return array( 'text' => nbm_finance_disclosure_text() ); },
        ),
        array(
            'methods'             => 'POST',
            'permission_callback' => function () { return current_user_can( 'manage_options' ); },
            'callback'            => function ( WP_REST_Request $r ) {
                $text = (string) $r->get_param( 'text' );
                update_option( 'nbm_finance_disclosure_text', wp_kses_post( $text ) );
                return array( 'ok' => true, 'text' => nbm_finance_disclosure_text() );
            },
        ),
    ) );
} );
