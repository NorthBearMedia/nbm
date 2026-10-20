<?php
/**
 * Plugin Name: NBM Sponsors Update (Oct 2026, one-off)
 * Description: Adds Terratorque to the About page sponsors and fills in the Instagram links Sam Tucker sent on 19 Oct 2026. Runs once on the next request, records the result in the nbm_sponsors_oct2026_result option, then deactivates itself. Changes nothing if the sponsor list is not as expected.
 * Version: 1.0.0
 * Author: North Bear Media
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

function nbm_sponsors_oct2026_deactivate() {
    if ( ! function_exists( 'deactivate_plugins' ) ) { require_once ABSPATH . 'wp-admin/includes/plugin.php'; }
    deactivate_plugins( plugin_basename( __FILE__ ) );
}

function nbm_sponsors_oct2026_finish( $result ) {
    update_option( 'nbm_sponsors_oct2026_result', $result, false );
    update_option( 'nbm_sponsors_oct2026_done', 1, false );
    delete_option( 'nbm_sponsors_oct2026_lock' );
    nbm_sponsors_oct2026_deactivate();
}

add_action( 'init', function () {
    if ( get_option( 'nbm_sponsors_oct2026_done' ) ) { nbm_sponsors_oct2026_deactivate(); return; }
    // Only one request gets to run it.
    if ( ! add_option( 'nbm_sponsors_oct2026_lock', time(), '', 'no' ) ) { return; }

    try {
        $page_id = 704; // About
        if ( ! function_exists( 'get_field_object' ) || ! function_exists( 'update_field' ) ) {
            nbm_sponsors_oct2026_finish( array( 'ok' => false, 'error' => 'ACF not loaded' ) );
            return;
        }
        $fo = get_field_object( 'sponsors', $page_id, false, true );
        if ( ! $fo || empty( $fo['key'] ) || empty( $fo['sub_fields'] ) || ! is_array( $fo['value'] ) ) {
            nbm_sponsors_oct2026_finish( array( 'ok' => false, 'error' => 'sponsors field not found' ) );
            return;
        }
        $k = array();
        foreach ( $fo['sub_fields'] as $sf ) { $k[ $sf['name'] ] = $sf['key']; }
        foreach ( array( 'accordion_item_title', 'accordion_item_desciption', 'accordion_item_image', 'facebook', 'instagram' ) as $n ) {
            if ( empty( $k[ $n ] ) ) { nbm_sponsors_oct2026_finish( array( 'ok' => false, 'error' => 'missing sub field ' . $n ) ); return; }
        }

        // Safety check: the list must be exactly as it was on 20 Oct, or nothing changes.
        $expected = array( 'Scars Racing', 'John McGuinness', 'Conrod Coffee Co', 'Ian Hutchinson', 'Lee Johnston', 'Dunny Bees', 'Accrington Stanley Women FC', 'Pendle Triathlon Club' );
        $rows  = array_values( $fo['value'] );
        $title = function ( $row ) use ( $k ) { return isset( $row[ $k['accordion_item_title'] ] ) ? trim( (string) $row[ $k['accordion_item_title'] ] ) : ''; };
        if ( array_map( $title, $rows ) !== $expected ) {
            nbm_sponsors_oct2026_finish( array( 'ok' => false, 'error' => 'sponsor list changed since 20 Oct, nothing updated', 'found' => array_map( $title, $rows ) ) );
            return;
        }

        $instagram = array(
            'Scars Racing'                => 'https://www.instagram.com/scars_racing/',
            'John McGuinness'             => 'https://www.instagram.com/jm130tt/',
            'Conrod Coffee Co'            => 'https://www.instagram.com/conrodcoffeeco/',
            'Accrington Stanley Women FC' => 'https://www.instagram.com/accrington_stanley_womenfc/',
            'Pendle Triathlon Club'       => 'https://www.instagram.com/pendletriclub/',
        );

        // Logo into the media library.
        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        $tmp = wp_tempnam( 'terratorque-logo.jpg' );
        if ( ! $tmp || ! copy( __DIR__ . '/terratorque-logo.jpg', $tmp ) ) {
            nbm_sponsors_oct2026_finish( array( 'ok' => false, 'error' => 'could not stage logo' ) );
            return;
        }
        $media_id = media_handle_sideload( array( 'name' => 'terratorque-logo.jpg', 'tmp_name' => $tmp ), $page_id, 'Terratorque logo' );
        if ( is_wp_error( $media_id ) ) {
            @unlink( $tmp );
            nbm_sponsors_oct2026_finish( array( 'ok' => false, 'error' => 'logo upload failed: ' . $media_id->get_error_message() ) );
            return;
        }
        update_post_meta( $media_id, '_wp_attachment_image_alt', 'Terratorque logo, sponsored by Steadplan' );

        $new = array();
        foreach ( $rows as $row ) {
            $t = $title( $row );
            if ( isset( $instagram[ $t ] ) && '' === trim( (string) ( $row[ $k['instagram'] ] ?? '' ) ) ) {
                $row[ $k['instagram'] ] = $instagram[ $t ];
            }
            $new[] = $row;
            if ( 'Lee Johnston' === $t ) {
                $new[] = array(
                    $k['accordion_item_title']      => 'Terratorque',
                    $k['accordion_item_desciption'] => 'We are proud to sponsor Terratorque.',
                    $k['accordion_item_image']      => $media_id,
                    $k['facebook']                  => '',
                    $k['instagram']                 => '',
                );
            }
        }
        update_field( $fo['key'], $new, $page_id );

        // Read back to confirm.
        $check  = get_field_object( 'sponsors', $page_id, false, true );
        $titles = array_map( $title, array_values( (array) $check['value'] ) );
        $ok     = ( 9 === count( $titles ) && 'Terratorque' === $titles[5] );
        nbm_sponsors_oct2026_finish( array( 'ok' => $ok, 'media_id' => $media_id, 'titles' => $titles ) );
    } catch ( \Throwable $e ) {
        nbm_sponsors_oct2026_finish( array( 'ok' => false, 'error' => 'exception: ' . $e->getMessage() ) );
    }
}, 20 );
