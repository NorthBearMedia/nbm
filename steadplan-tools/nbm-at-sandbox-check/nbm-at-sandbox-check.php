<?php
/**
 * Plugin Name: NBM AutoTrader Sandbox Check (one-off)
 * Description: Read-only checks of AutoTrader Connect sandbox: credentials, stock payload shape, a dry run of the theme's import rules, and a sandbox webhook receiver that verifies the sandbox signing secret and logs events without touching vehicles. Never creates, updates or deletes vehicles. Remove after go-live.
 * Version: 1.2.0
 * Author: North Bear Media
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

if ( ! defined( 'NBM_AT_SB_HOST' ) )    { define( 'NBM_AT_SB_HOST',    'https://api-sandbox.autotrader.co.uk' ); }
if ( ! defined( 'NBM_AT_ADVERTISER' ) ) { define( 'NBM_AT_ADVERTISER', '10012129' ); }

// Credentials live in the wp_options row 'nbm_at_sb_config' (set through the admin-only
// REST route below), never in this file. Keys: key, secret, webhook_secret.
function nbm_at_sb_cfg( $name ) {
    $cfg = get_option( 'nbm_at_sb_config', array() );
    return ( is_array( $cfg ) && isset( $cfg[ $name ] ) ) ? (string) $cfg[ $name ] : '';
}

function nbm_at_sb_check( WP_REST_Request $request ) {
    $out = array( 'host' => NBM_AT_SB_HOST, 'advertiserId' => NBM_AT_ADVERTISER );

    $key = nbm_at_sb_cfg( 'key' );
    $sec = nbm_at_sb_cfg( 'secret' );
    if ( '' === $key || '' === $sec ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'Sandbox credentials not set (POST nbm/v1/at-sb-config)' ), 500 );
    }

    $auth = wp_remote_post( NBM_AT_SB_HOST . '/authenticate', array(
        'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
        'body'    => array( 'key' => $key, 'secret' => $sec ),
        'timeout' => 30,
    ) );
    if ( is_wp_error( $auth ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'stage' => 'authenticate', 'error' => $auth->get_error_message() ), 500 );
    }
    $out['auth_http'] = (int) wp_remote_retrieve_response_code( $auth );
    $auth_body        = json_decode( wp_remote_retrieve_body( $auth ), true );
    if ( 200 !== $out['auth_http'] || empty( $auth_body['access_token'] ) ) {
        $out['ok']        = false;
        $out['stage']     = 'authenticate';
        $out['auth_body'] = substr( wp_remote_retrieve_body( $auth ), 0, 400 );
        return new WP_REST_Response( $out, 500 );
    }
    // Report token metadata (not the token) so we know the lifetime for caching.
    $out['token_fields'] = array_values( array_diff( array_keys( $auth_body ), array( 'access_token' ) ) );
    foreach ( array( 'expires_in', 'expires', 'expiresIn', 'expires_at', 'token_type' ) as $k ) {
        if ( isset( $auth_body[ $k ] ) ) { $out[ 'token_' . $k ] = $auth_body[ $k ]; }
    }

    $page_size = (int) ( $request->get_param( 'pageSize' ) ?: 200 );
    $stock = wp_remote_get(
        NBM_AT_SB_HOST . '/stock?advertiserId=' . rawurlencode( NBM_AT_ADVERTISER ) . '&pageSize=' . $page_size,
        array( 'headers' => array( 'Authorization' => 'Bearer ' . $auth_body['access_token'] ), 'timeout' => 60 )
    );
    if ( is_wp_error( $stock ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'stage' => 'stock', 'error' => $stock->get_error_message() ), 500 );
    }
    $out['stock_http'] = (int) wp_remote_retrieve_response_code( $stock );
    $raw               = wp_remote_retrieve_body( $stock );
    $data              = json_decode( $raw, true );
    if ( 200 !== $out['stock_http'] || ! is_array( $data ) ) {
        $out['ok']         = false;
        $out['stage']      = 'stock';
        $out['stock_body'] = substr( $raw, 0, 400 );
        return new WP_REST_Response( $out, 500 );
    }

    $results = isset( $data['results'] ) && is_array( $data['results'] ) ? $data['results'] : array();
    $out['ok']           = true;
    $out['top_keys']     = array_keys( $data );
    $out['totalResults'] = isset( $data['totalResults'] ) ? $data['totalResults'] : null;
    $out['count']        = count( $results );

    // Payload-shape check against the exact paths the theme's handle_vehicle_data() reads.
    $needed = array(
        'metadata.stockId'                                  => false,
        'metadata.lifecycleState'                           => false,
        'adverts.retailAdverts.advertiserAdvert.status'     => false,
        'adverts.retailAdverts.totalPrice.amountGBP'        => false,
        'adverts.retailAdverts.suppliedPrice.amountGBP'     => false,
        'adverts.retailAdverts.description'                 => false,
        'vehicle.make'                                      => false,
        'vehicle.model'                                     => false,
        'vehicle.derivative'                                => false,
        'vehicle.vehicleType'                               => false,
        'vehicle.odometerReadingMiles'                      => false,
        'vehicle.plate'                                     => false,
        'media.images'                                      => false,
        'features'                                          => false,
    );
    $sample = array();
    foreach ( array_slice( $results, 0, 5 ) as $r ) {
        foreach ( $needed as $path => $seen ) {
            $v = $r;
            foreach ( explode( '.', $path ) as $seg ) { $v = ( is_array( $v ) && isset( $v[ $seg ] ) ) ? $v[ $seg ] : null; }
            if ( null !== $v ) { $needed[ $path ] = true; }
        }
        $v = isset( $r['vehicle'] ) ? $r['vehicle'] : array();
        $sample[] = trim( ( $v['make'] ?? '' ) . ' ' . ( $v['model'] ?? '' ) . ' ' . ( $v['derivative'] ?? '' ) );
    }
    $out['fields_present'] = $needed;
    $out['sample']         = $sample;
    if ( ! empty( $results[0]['media']['images'][0]['href'] ) ) {
        $out['first_image_href'] = $results[0]['media']['images'][0]['href'];
    }
    $out['first_result_keys']         = ! empty( $results ) ? array_keys( $results[0] ) : array();
    $out['first_adverts_keys']        = isset( $results[0]['adverts'] ) && is_array( $results[0]['adverts'] ) ? array_keys( $results[0]['adverts'] ) : array();
    $out['first_retail_adverts_keys'] = isset( $results[0]['adverts']['retailAdverts'] ) && is_array( $results[0]['adverts']['retailAdverts'] ) ? array_keys( $results[0]['adverts']['retailAdverts'] ) : array();
    $out['first_metadata']            = isset( $results[0]['metadata'] ) ? $results[0]['metadata'] : null;

    // Dry run of the theme's import rules. Nothing is written.
    $stats = array( 'missing_structure' => 0, 'not_published' => 0, 'sold_or_deleted' => 0, 'would_import' => 0 );
    $status_dist = array(); $lifecycle_dist = array(); $api_ids = array(); $would = array();
    foreach ( $results as $r ) {
        if ( ! isset( $r['vehicle'], $r['metadata'], $r['adverts'] ) ) { $stats['missing_structure']++; continue; }
        $ra  = isset( $r['adverts']['retailAdverts'] ) && is_array( $r['adverts']['retailAdverts'] ) ? $r['adverts']['retailAdverts'] : array();
        $st  = isset( $ra['advertiserAdvert']['status'] ) ? (string) $ra['advertiserAdvert']['status'] : 'MISSING';
        $lc  = isset( $r['metadata']['lifecycleState'] ) ? (string) $r['metadata']['lifecycleState'] : 'MISSING';
        $sid = isset( $r['metadata']['stockId'] ) ? (string) $r['metadata']['stockId'] : '';
        $status_dist[ $st ]    = ( $status_dist[ $st ] ?? 0 ) + 1;
        $lifecycle_dist[ $lc ] = ( $lifecycle_dist[ $lc ] ?? 0 ) + 1;
        if ( '' !== $sid ) { $api_ids[] = $sid; }
        if ( 'PUBLISHED' !== $st ) { $stats['not_published']++; continue; }
        if ( in_array( $lc, array( 'SOLD', 'DELETED' ), true ) ) { $stats['sold_or_deleted']++; continue; }
        $stats['would_import']++;
        if ( count( $would ) < 40 ) {
            $v = isset( $r['vehicle'] ) ? $r['vehicle'] : array();
            $would[] = trim( ( $v['make'] ?? '' ) . ' ' . ( $v['model'] ?? '' ) . ' ' . ( $v['derivative'] ?? '' ) ) . ' [' . $sid . ']';
        }
    }
    $out['dry_run']                = $stats;
    $out['advertiser_status_dist'] = $status_dist;
    $out['lifecycle_dist']         = $lifecycle_dist;
    $out['would_import_sample']    = $would;

    // Compare with the vehicle posts currently on the site (read-only).
    $site_ids = array();
    $posts = get_posts( array( 'post_type' => 'vehicle', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids' ) );
    foreach ( $posts as $pid ) {
        $v = get_post_meta( $pid, 'vehicle_id', true );
        if ( '' !== (string) $v ) { $site_ids[] = (string) $v; }
    }
    $out['site_vehicle_posts']      = count( $posts );
    $out['site_ids_in_sandbox']     = count( array_intersect( $site_ids, $api_ids ) );
    $out['site_ids_not_in_sandbox'] = count( array_diff( $site_ids, $api_ids ) );
    $out['sandbox_ids_new_to_site'] = count( array_diff( $api_ids, $site_ids ) );
    return $out;
}

// Sandbox webhook receiver. AutoTrader signs stock-change PUTs to the theme's
// /autotrader/v1/fetch_vehicles/ route with "AutoTrader-Signature: t=<ts>,v1=<hmac>",
// where v1 = HMAC-SHA256( "<ts>.<raw body>", secret ). The theme checks the production
// secret. This filter runs first: if the signature matches the SANDBOX secret the event
// is logged and acknowledged with 200, and the theme handler never runs (dry run).
// Anything else is passed through untouched, so production behaviour is unchanged.
function nbm_at_sb_signature_ok( WP_REST_Request $request, $secret ) {
    $header = (string) $request->get_header( 'AutoTrader-Signature' );
    if ( '' === $header ) { return false; }
    preg_match( '/t=([0-9]+)/', $header, $t );
    preg_match( '/v1=([a-fA-F0-9]+)/', $header, $v );
    if ( empty( $t[1] ) || empty( $v[1] ) ) { return false; }
    $calc = hash_hmac( 'sha256', $t[1] . '.' . $request->get_body(), $secret );
    return hash_equals( $calc, strtolower( $v[1] ) );
}

add_filter( 'rest_pre_dispatch', function ( $result, $server, $request ) {
    if ( null !== $result ) { return $result; }
    if ( ! ( $request instanceof WP_REST_Request ) || 'PUT' !== $request->get_method() ) { return $result; }
    if ( ! preg_match( '#^/autotrader/v1/fetch_vehicles/?$#', (string) $request->get_route() ) ) { return $result; }
    $wh = nbm_at_sb_cfg( 'webhook_secret' );
    if ( '' === $wh ) { return $result; }
    if ( ! nbm_at_sb_signature_ok( $request, $wh ) ) { return $result; }

    $json  = $request->get_json_params();
    $d     = ( is_array( $json ) && isset( $json['data'] ) && is_array( $json['data'] ) ) ? $json['data'] : array();
    $veh   = isset( $d['vehicle'] ) && is_array( $d['vehicle'] ) ? $d['vehicle'] : array();
    $entry = array(
        'received_at'            => gmdate( 'c' ),
        'self_test'              => (bool) $request->get_header( 'X-NBM-Selftest' ),
        'top_keys'               => is_array( $json ) ? array_keys( $json ) : array(),
        'data_keys'              => array_keys( $d ),
        'stockId'                => $d['metadata']['stockId'] ?? null,
        'lifecycleState'         => $d['metadata']['lifecycleState'] ?? null,
        'advertiserAdvertStatus' => $d['adverts']['retailAdverts']['advertiserAdvert']['status'] ?? null,
        'vehicle'                => trim( ( $veh['make'] ?? '' ) . ' ' . ( $veh['model'] ?? '' ) . ' ' . ( $veh['derivative'] ?? '' ) ),
        'body_bytes'             => strlen( (string) $request->get_body() ),
    );
    $log = get_option( 'nbm_at_sb_webhook_log', array() );
    if ( ! is_array( $log ) ) { $log = array(); }
    array_unshift( $log, $entry );
    update_option( 'nbm_at_sb_webhook_log', array_slice( $log, 0, 25 ), false );

    return new WP_REST_Response( array( 'ok' => true, 'sandbox' => true, 'dry' => true ), 200 );
}, 5, 3 );

add_action( 'rest_api_init', function () {
    $admin = function () { return current_user_can( 'manage_options' ); };

    // Set or inspect the sandbox credentials. GET never returns values, only whether each is set.
    register_rest_route( 'nbm/v1', '/at-sb-config', array(
        array(
            'methods'             => 'GET',
            'permission_callback' => $admin,
            'callback'            => function () {
                return array(
                    'key'            => '' !== nbm_at_sb_cfg( 'key' ),
                    'secret'         => '' !== nbm_at_sb_cfg( 'secret' ),
                    'webhook_secret' => '' !== nbm_at_sb_cfg( 'webhook_secret' ),
                );
            },
        ),
        array(
            'methods'             => 'POST',
            'permission_callback' => $admin,
            'callback'            => function ( WP_REST_Request $r ) {
                $cfg = get_option( 'nbm_at_sb_config', array() );
                if ( ! is_array( $cfg ) ) { $cfg = array(); }
                foreach ( array( 'key', 'secret', 'webhook_secret' ) as $k ) {
                    $v = $r->get_param( $k );
                    if ( null !== $v ) { $cfg[ $k ] = trim( (string) $v ); }
                }
                update_option( 'nbm_at_sb_config', $cfg, false );
                return array( 'ok' => true, 'set' => array_keys( array_filter( $cfg ) ) );
            },
        ),
    ) );

    register_rest_route( 'nbm/v1', '/at-sandbox-check', array(
        'methods'             => 'GET',
        'permission_callback' => $admin,
        'callback'            => 'nbm_at_sb_check',
    ) );

    register_rest_route( 'nbm/v1', '/at-sb-webhook-log', array(
        'methods'             => 'GET',
        'permission_callback' => $admin,
        'callback'            => function () {
            return array(
                'webhook_secret_set' => '' !== nbm_at_sb_cfg( 'webhook_secret' ),
                'log'                => get_option( 'nbm_at_sb_webhook_log', array() ),
            );
        },
    ) );

    // Sends one sandbox-signed PUT to the real webhook route on this site and reports the
    // result. The payload is NOT_PUBLISHED with a made-up stockId, so even if it reached the
    // theme handler it would be a no-op.
    register_rest_route( 'nbm/v1', '/at-sb-webhook-selftest', array(
        'methods'             => 'POST',
        'permission_callback' => $admin,
        'callback'            => function () {
            $wh = nbm_at_sb_cfg( 'webhook_secret' );
            if ( '' === $wh ) {
                return new WP_REST_Response( array( 'ok' => false, 'error' => 'webhook secret not set' ), 500 );
            }
            $body = wp_json_encode( array( 'data' => array(
                'vehicle'  => array( 'make' => 'NBM', 'model' => 'Selftest', 'derivative' => 'do not import' ),
                'metadata' => array( 'stockId' => 'nbm-selftest-' . time(), 'lifecycleState' => 'FORECOURT' ),
                'adverts'  => array( 'retailAdverts' => array( 'advertiserAdvert' => array( 'status' => 'NOT_PUBLISHED' ) ) ),
            ) ) );
            $t   = time();
            $sig = 't=' . $t . ',v1=' . hash_hmac( 'sha256', $t . '.' . $body, $wh );
            $url = rest_url( 'autotrader/v1/fetch_vehicles/' );
            $resp = wp_remote_request( $url, array(
                'method'  => 'PUT',
                'timeout' => 30,
                'headers' => array( 'Content-Type' => 'application/json', 'AutoTrader-Signature' => $sig, 'X-NBM-Selftest' => '1' ),
                'body'    => $body,
            ) );
            if ( is_wp_error( $resp ) ) {
                return new WP_REST_Response( array( 'ok' => false, 'url' => $url, 'error' => $resp->get_error_message() ), 500 );
            }
            $code = (int) wp_remote_retrieve_response_code( $resp );
            return array( 'ok' => 200 === $code, 'url' => $url, 'http' => $code, 'body' => substr( wp_remote_retrieve_body( $resp ), 0, 300 ) );
        },
    ) );
} );

// Interim fix until theme 1.2.8-nbm is deployed. The live theme appends every raw
// AutoTrader webhook body to ABSPATH/put_file.log, which is publicly downloadable.
// This moves that file's contents to a private directory (outside the web root when
// possible) and removes the public copy, both on demand and after every webhook.
function nbm_at_sb_private_dir() {
    foreach ( array( dirname( ABSPATH ) . '/nbm-private-logs', WP_CONTENT_DIR . '/nbm-private-logs' ) as $dir ) {
        if ( ! is_dir( $dir ) ) { wp_mkdir_p( $dir ); }
        if ( is_dir( $dir ) && is_writable( $dir ) ) {
            if ( 0 === strpos( $dir, WP_CONTENT_DIR ) && ! file_exists( $dir . '/.htaccess' ) ) {
                file_put_contents( $dir . '/.htaccess', "Require all denied\nDeny from all\n" );
                file_put_contents( $dir . '/index.php', "<?php // Silence.\n" );
            }
            return $dir;
        }
    }
    return '';
}

function nbm_at_sb_secure_put_log() {
    $pub = ABSPATH . 'put_file.log';
    if ( ! file_exists( $pub ) ) { return array( 'moved' => false, 'reason' => 'no public log' ); }
    $dir = nbm_at_sb_private_dir();
    if ( '' === $dir ) { return array( 'moved' => false, 'reason' => 'no writable private dir' ); }
    $dest = $dir . '/put_file.log';
    $in   = fopen( $pub, 'rb' );
    $out  = fopen( $dest, 'ab' );
    if ( ! $in || ! $out ) { return array( 'moved' => false, 'reason' => 'could not open files' ); }
    $copied = stream_copy_to_stream( $in, $out );
    fclose( $in ); fclose( $out );
    clearstatcache();
    if ( false === $copied || $copied < filesize( $pub ) ) {
        return array( 'moved' => false, 'reason' => 'copy incomplete, public file left in place' );
    }
    $removed = @unlink( $pub );
    return array(
        'moved'        => $removed,
        'private_dir'  => ( 0 === strpos( $dir, WP_CONTENT_DIR ) ) ? 'wp-content (denied by .htaccess)' : 'outside web root',
        'copied_bytes' => $copied,
        'private_size' => filesize( $dest ),
    );
}

add_filter( 'rest_post_dispatch', function ( $response, $server, $request ) {
    if ( $request instanceof WP_REST_Request && 'PUT' === $request->get_method()
        && preg_match( '#^/autotrader/v1/fetch_vehicles/?$#', (string) $request->get_route() ) ) {
        nbm_at_sb_secure_put_log();
    }
    return $response;
}, 10, 3 );

add_action( 'rest_api_init', function () {
    register_rest_route( 'nbm/v1', '/secure-put-log', array(
        'methods'             => 'POST',
        'permission_callback' => function () { return current_user_can( 'manage_options' ); },
        'callback'            => 'nbm_at_sb_secure_put_log',
    ) );
} );
