<?php
// One-time runner: moves public leftovers (WordPress readme/licence that reveal the
// version, a Holdens-era readme backup and macOS .DS_Store folder listings) out of the
// web root into a private folder beside it. POST with the token whose SHA-256 is below;
// prints what moved, then deletes itself. Anything else gets a 404.
$nbm_token_hash = 'fc49752abae959af93fb19f0023f4f6c641c7be71b25d3438e14ea0b924f6973';
if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || ! isset( $_POST['t'] ) || ! hash_equals( $nbm_token_hash, hash( 'sha256', (string) $_POST['t'] ) ) ) {
    http_response_code( 404 );
    exit;
}

$root = dirname( __DIR__, 3 );                                  // public_html
$dest = dirname( $root ) . '/nbm-private-files/2026-11-25';     // outside the web root
$files = array( 'readme.html', 'readme.html.nbmbak', 'license.txt', 'wp-content/.DS_Store', 'wp-content/themes/holdens/.DS_Store' );

$out = array( 'dest' => $dest, 'moved' => array(), 'missing' => array(), 'failed' => array() );
if ( ! is_file( $root . '/wp-load.php' ) ) {
    $out['failed'][] = 'web root not found';
} elseif ( ! is_dir( $dest ) && ! @mkdir( $dest, 0700, true ) ) {
    $out['failed'][] = 'could not create private folder';
} else {
    foreach ( $files as $f ) {
        $src = $root . '/' . $f;
        if ( ! is_file( $src ) ) {
            $out['missing'][] = $f;
            continue;
        }
        $to = $dest . '/' . str_replace( '/', '__', $f );
        if ( @rename( $src, $to ) ) {
            $out['moved'][] = $f;
        } else {
            $out['failed'][] = $f;
        }
    }
}

header( 'Content-Type: application/json' );
header( 'Cache-Control: no-store' );
header( 'X-LiteSpeed-Cache-Control: no-cache' );
echo json_encode( $out );
@unlink( __FILE__ );
