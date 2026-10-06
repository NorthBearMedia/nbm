<?php
/**
 * Plugin Name: NBM Site Hygiene
 * Description: Moves stray backup and config copies out of the public web root into a private folder above it. Nothing is deleted. Admin-only REST routes: GET nbm/v1/root-files (report), POST nbm/v1/secure-root-files (move).
 * Version: 1.0.0
 * Author: North Bear Media
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

// Exact file names only. The live wp-config.php is never touched.
function nbm_hygiene_targets() {
    return array(
        'steadplanco_nov25.sql',
        'steadplan_slim_20260811.zip',
        'wp-config-new.php',
        'wp-config-2.php',
        'wp-config copy.php',
        'wp-config-ddev.php',
        'readme.html.nbmbak',
        '.DS_Store',
        'new.php',
    );
}

function nbm_hygiene_private_dir() {
    $dir = dirname( ABSPATH ) . '/nbm-private-backups';
    if ( ! is_dir( $dir ) ) { wp_mkdir_p( $dir ); }
    return ( is_dir( $dir ) && is_writable( $dir ) ) ? $dir : '';
}

function nbm_hygiene_report() {
    $out = array();
    foreach ( nbm_hygiene_targets() as $name ) {
        $p = ABSPATH . $name;
        $out[ $name ] = file_exists( $p ) ? filesize( $p ) : null;
    }
    return $out;
}

function nbm_hygiene_move() {
    $dir = nbm_hygiene_private_dir();
    if ( '' === $dir ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'private folder above web root not writable' ), 500 );
    }
    $moved = array(); $skipped = array();
    foreach ( nbm_hygiene_targets() as $name ) {
        if ( 'wp-config.php' === $name ) { continue; }
        $src = ABSPATH . $name;
        if ( ! file_exists( $src ) ) { continue; }
        $dest = $dir . '/' . $name;
        if ( file_exists( $dest ) ) { $dest .= '.' . gmdate( 'Ymd-His' ); }
        if ( @rename( $src, $dest ) ) {
            $moved[ $name ] = filesize( $dest );
        } else {
            $skipped[] = $name;
        }
    }
    return array( 'ok' => empty( $skipped ), 'moved' => $moved, 'skipped' => $skipped, 'remaining' => array_filter( nbm_hygiene_report() ) );
}

add_action( 'rest_api_init', function () {
    $admin = function () { return current_user_can( 'manage_options' ); };
    register_rest_route( 'nbm/v1', '/root-files', array( 'methods' => 'GET', 'permission_callback' => $admin, 'callback' => 'nbm_hygiene_report' ) );
    register_rest_route( 'nbm/v1', '/secure-root-files', array( 'methods' => 'POST', 'permission_callback' => $admin, 'callback' => 'nbm_hygiene_move' ) );
} );
