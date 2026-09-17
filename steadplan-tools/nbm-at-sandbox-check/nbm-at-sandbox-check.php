<?php
/**
 * Plugin Name: NBM AutoTrader Sandbox Check (one-off)
 * Description: Read-only check of AutoTrader Connect sandbox credentials. Authenticates against the sandbox, fetches the stock list for the allocated advertiser and reports counts and payload shape. Never creates, updates or deletes vehicles. Remove after go-live.
 * Version: 1.0.0
 * Author: North Bear Media
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

// Filled in on the deploy copy only. The repo copy must stay as placeholders.
if ( ! defined( 'NBM_AT_SB_KEY' ) )    { define( 'NBM_AT_SB_KEY',    'REPLACE-AT-DEPLOY' ); }
if ( ! defined( 'NBM_AT_SB_SECRET' ) ) { define( 'NBM_AT_SB_SECRET', 'REPLACE-AT-DEPLOY' ); }
if ( ! defined( 'NBM_AT_SB_HOST' ) )   { define( 'NBM_AT_SB_HOST',   'https://api-sandbox.autotrader.co.uk' ); }
if ( ! defined( 'NBM_AT_ADVERTISER' ) ){ define( 'NBM_AT_ADVERTISER', '10012129' ); }

function nbm_at_sb_check( WP_REST_Request $request ) {
    $out = array( 'host' => NBM_AT_SB_HOST, 'advertiserId' => NBM_AT_ADVERTISER );

    if ( 'REPLACE-AT-DEPLOY' === NBM_AT_SB_KEY ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'Sandbox credentials not set in plugin' ), 500 );
    }

    $auth = wp_remote_post( NBM_AT_SB_HOST . '/authenticate', array(
        'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
        'body'    => array( 'key' => NBM_AT_SB_KEY, 'secret' => NBM_AT_SB_SECRET ),
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
    foreach ( array( 'expires_in', 'expires', 'expiresIn', 'token_type' ) as $k ) {
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

    // Payload-shape check against what the theme's handle_vehicle_data() reads.
    $needed = array(
        'metadata.stockId'                 => false,
        'metadata.lifecycleState'          => false,
        'adverts.advertiserAdvert.status'  => false,
        'vehicle.make'                     => false,
        'vehicle.model'                    => false,
        'vehicle.derivative'               => false,
        'media.images'                     => false,
        'adverts.retailAdverts.totalPrice' => false,
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
    $out['first_result_keys'] = ! empty( $results ) ? array_keys( $results[0] ) : array();
    return $out;
}

add_action( 'rest_api_init', function () {
    register_rest_route( 'nbm/v1', '/at-sandbox-check', array(
        'methods'             => 'GET',
        'permission_callback' => function () { return current_user_can( 'manage_options' ); },
        'callback'            => 'nbm_at_sb_check',
    ) );
} );
