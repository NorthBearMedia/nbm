<?php
// One-time runner for nbm-maxus-dupe-nov2026 (the hosting API can upload plugins but not activate them).
// POST with the token whose SHA-256 is below. Runs the plugin's checks and change once, prints the
// recorded result, then deletes itself. Anything else gets a 404.
$nbm_token_hash = '5396d47d5568bdc82d9537e564839680f39f6fba8e8cdcaf7cf07d1927326856';
if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || ! isset( $_POST['t'] ) || ! hash_equals( $nbm_token_hash, hash( 'sha256', (string) $_POST['t'] ) ) ) {
    http_response_code( 404 );
    exit;
}

define( 'WP_USE_THEMES', false );
require dirname( __DIR__, 3 ) . '/wp-load.php';
require_once __DIR__ . '/nbm-maxus-dupe-nov2026.php';

if ( ! function_exists( 'nbm_maxus_dupe_nov2026_run' ) ) {
    http_response_code( 500 );
    echo 'plugin function missing';
    exit;
}

nbm_maxus_dupe_nov2026_run();
nocache_headers();
header( 'Content-Type: application/json' );
echo wp_json_encode( array(
    'done'   => (bool) get_option( 'nbm_maxus_dupe_v2_done' ),
    'result' => get_option( 'nbm_maxus_dupe_v2_result' ),
) );
@unlink( __FILE__ );
