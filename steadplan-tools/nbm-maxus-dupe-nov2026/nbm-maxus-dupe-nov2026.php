<?php
/**
 * Plugin Name: NBM Maxus Duplicate Fix (Nov 2026, one-off)
 * Description: Moves the stale Holdens-era MAXUS eDeliver 7 listing (/vehicle/88-5kwh-auto-l1-h1-5dr/, £24,000, last synced 26 Jun) to the Trash and points its old URL at the live AutoTrader listing of the same van (/vehicle/88-5kwh-auto-l1-h1-5dr-2/, £23,000). Runs once on the next request, records the result in the nbm_maxus_dupe_v2_result option, then deactivates itself. Changes nothing if either listing is not as expected.
 * Version: 1.1.0
 * Author: North Bear Media
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

function nbm_maxus_dupe_nov2026_deactivate() {
    if ( ! function_exists( 'deactivate_plugins' ) ) { require_once ABSPATH . 'wp-admin/includes/plugin.php'; }
    deactivate_plugins( plugin_basename( __FILE__ ) );
}

function nbm_maxus_dupe_nov2026_finish( $result ) {
    update_option( 'nbm_maxus_dupe_v2_result', $result, false );
    update_option( 'nbm_maxus_dupe_v2_done', 1, false );
    delete_option( 'nbm_maxus_dupe_v2_lock' );
    nbm_maxus_dupe_nov2026_deactivate();
}

// Also called by run.php, which the hosting tools can reach when they cannot activate plugins.
function nbm_maxus_dupe_nov2026_run() {
    if ( get_option( 'nbm_maxus_dupe_v2_done' ) ) { nbm_maxus_dupe_nov2026_deactivate(); return; }
    // Only one request gets to run it.
    if ( ! add_option( 'nbm_maxus_dupe_v2_lock', time(), '', 'no' ) ) { return; }

    try {
        // The stored title is the derivative; the theme adds the make and model on screen.
        $derivative = '88.5kWh Auto L1 H1 5dr';
        $old_slug   = '88-5kwh-auto-l1-h1-5dr';
        $new_slug   = '88-5kwh-auto-l1-h1-5dr-2';

        $old = get_page_by_path( $old_slug, OBJECT, 'vehicle' );
        $new = get_page_by_path( $new_slug, OBJECT, 'vehicle' );
        $seen = function ( $p ) {
            return $p ? array( 'id' => $p->ID, 'status' => $p->post_status, 'title' => $p->post_title, 'modified_gmt' => $p->post_modified_gmt ) : null;
        };

        // Safety checks: both listings must be as seen on 25 Nov, or nothing changes.
        $problems = array();
        if ( ! $old ) { $problems[] = 'old listing not found'; }
        if ( ! $new ) { $problems[] = 'live listing not found'; }
        if ( $old && ( 'publish' !== $old->post_status || false === strpos( $old->post_title, $derivative ) || 0 !== strpos( $old->post_modified_gmt, '2026-06-26' ) ) ) {
            $problems[] = 'old listing changed since 25 Nov';
        }
        if ( $new && ( 'publish' !== $new->post_status || false === strpos( $new->post_title, $derivative ) || $new->post_modified_gmt < '2026-11-01' ) ) {
            $problems[] = 'live listing not current';
        }
        if ( $old && $new && $old->post_title !== $new->post_title ) {
            $problems[] = 'titles differ';
        }
        if ( $problems ) {
            nbm_maxus_dupe_nov2026_finish( array( 'ok' => false, 'error' => implode( '; ', $problems ), 'old' => $seen( $old ), 'new' => $seen( $new ) ) );
            return;
        }

        // Trash, not delete: it can be restored from Vehicles > Trash.
        $trashed = wp_trash_post( $old->ID );
        // Send the old URL to the live listing via WordPress's own old-slug redirect.
        add_post_meta( $new->ID, '_wp_old_slug', $old_slug );

        $check = get_post( $old->ID );
        nbm_maxus_dupe_nov2026_finish( array(
            'ok'          => ( $trashed && $check && 'trash' === $check->post_status ),
            'trashed_id'  => $old->ID,
            'redirect_to' => $new->ID,
        ) );
    } catch ( \Throwable $e ) {
        nbm_maxus_dupe_nov2026_finish( array( 'ok' => false, 'error' => 'exception: ' . $e->getMessage() ) );
    }
}
add_action( 'init', 'nbm_maxus_dupe_nov2026_run', 20 );
