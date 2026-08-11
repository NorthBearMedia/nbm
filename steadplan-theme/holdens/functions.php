<?php
/**
 * Tom theme functions and definitions
 * */

$themeVersion = '2.8.2';

function theme_setup() {

	add_theme_support( 'post-thumbnails' );

	// Add custom image size used in Cover Template.
	add_image_size( 'twentytwenty-fullscreen', 1980, 9999 );
	add_theme_support( 'align-wide' );
	add_theme_support( 'responsive-embeds' );
}

add_action( 'after_setup_theme', 'theme_setup' );

/**
 * Register and Enqueue Styles.
 */
function register_styles() {

	global $themeVersion;

    // Theme
	wp_enqueue_style( 'headerStyles', get_template_directory_uri() . '/css/header.css', array(), $themeVersion );
    wp_enqueue_style( 'footerStyles', get_template_directory_uri() . '/css/footer.css', array(), $themeVersion );

	wp_register_style( 'homeStyles', get_template_directory_uri() . '/css/home.css', array(), $themeVersion );
	wp_register_style( 'vehicleStyles', get_template_directory_uri() . '/css/vehicle.css', array(), $themeVersion );
	wp_register_style( 'aboutStyles', get_template_directory_uri() . '/css/about.css', array(), $themeVersion );
	wp_register_style( 'whatWeDoStyles', get_template_directory_uri() . '/css/whatwedo.css', array(), $themeVersion );
	wp_register_style( 'workStyles', get_template_directory_uri() . '/css/work.css', array(), $themeVersion );
	wp_register_style( 'blogStyles', get_template_directory_uri() . '/css/blog.css', array(), $themeVersion );
	wp_register_style( 'contactStyles', get_template_directory_uri() . '/css/contact.css', array(), $themeVersion );
    wp_register_style( 'showroomPPCStyles', get_template_directory_uri() . '/css/ppc-showroom.css', array(), $themeVersion );
	
}
add_action( 'wp_enqueue_scripts', 'register_styles' );

/**
 * Register and Enqueue Scripts.
 */
function register_scripts() {

	global $themeVersion;
	wp_enqueue_script( 'scripts', get_template_directory_uri() . '/js/script.js', array(), $themeVersion, false );
	// wp_enqueue_script( 'barba', get_template_directory_uri() . '/js/lib/barba.min.js', array(), $themeVersion, false );
	wp_enqueue_script( 'gsap', get_template_directory_uri() . '/js/lib/gsap.min.js', array(), $themeVersion, false );
	wp_enqueue_script( 'scrolltrigger', get_template_directory_uri() . '/js/lib/ScrollTrigger.min.js', array(), $themeVersion, false );
	// wp_enqueue_script( 'locomotive', get_template_directory_uri() . '/js/lib/locomotive.min.js', array(), $themeVersion, false );
}
add_action( 'wp_enqueue_scripts', 'register_scripts' );


// Hide the admin bar
add_filter('show_admin_bar', '__return_false');


/**
 * Register navigation menus
 */
function register_my_menus() {
    register_nav_menus(
      array(
        'header'  => 'Header Menu',
        'home'  => 'Home Menu',
        'useful'  => 'Useful Menu',
		'mobile'  => 'Mobile Menu',
        'footer'   => 'Footer Menu'
      )
    );
}
add_action( 'init', 'register_my_menus' );



// Remove unnecessary header information
function remove_header_info() {
    remove_action('wp_head', 'feed_links_extra', 3);
    remove_action('wp_head', 'rsd_link');
    remove_action('wp_head', 'wlwmanifest_link');
    remove_action('wp_head', 'wp_generator');
    remove_action('wp_head', 'start_post_rel_link');
    remove_action('wp_head', 'index_rel_link');
    remove_action('wp_head', 'parent_post_rel_link', 10, 0);
    remove_action('wp_head', 'adjacent_posts_rel_link_wp_head',10,0); // for WordPress >= 3.0
}
add_action('init', 'remove_header_info');

// Remove wp version meta tag and from rss feed
add_filter('the_generator', '__return_false');

// Disable ping back scanner
add_filter('wp_xmlrpc_server_class', '__return_false');
add_filter('xmlrpc_enabled', '__return_false');


// Remove unnecessary feeds
function fb_disable_feed() {
    wp_die( __('No feed available, please visit our <a href="'. get_bloginfo('url') .'">homepage</a>!') );
}

add_action('do_feed', 'fb_disable_feed', 1);
add_action('do_feed_rdf', 'fb_disable_feed', 1);
add_action('do_feed_rss', 'fb_disable_feed', 1);
add_action('do_feed_rss2', 'fb_disable_feed', 1);
add_action('do_feed_atom', 'fb_disable_feed', 1);
add_action('do_feed_rss2_comments', 'fb_disable_feed', 1);
add_action('do_feed_atom_comments', 'fb_disable_feed', 1);

// Remove xpingback header
function remove_x_pingback($headers) {
    unset($headers['X-Pingback']);
    return $headers;
}
add_filter('wp_headers', 'remove_x_pingback');




add_action('admin_init', function () {
    // Redirect any user trying to access comments page
    global $pagenow;
    
    if ($pagenow === 'edit-comments.php') {
        wp_redirect(admin_url());
        exit;
    }

    // Remove comments metabox from dashboard
    remove_meta_box('dashboard_recent_comments', 'dashboard', 'normal');

    // Disable support for comments and trackbacks in post types
    foreach (get_post_types() as $post_type) {
        if (post_type_supports($post_type, 'comments')) {
            remove_post_type_support($post_type, 'comments');
            remove_post_type_support($post_type, 'trackbacks');
        }
    }
});

// Close comments on the front-end
add_filter('comments_open', '__return_false', 20, 2);
add_filter('pings_open', '__return_false', 20, 2);

// Hide existing comments
add_filter('comments_array', '__return_empty_array', 10, 2);

// Remove comments page in menu
add_action('admin_menu', function () {
    remove_menu_page('edit-comments.php');
});

// Remove comments links from admin bar
add_action('init', function () {
    if (is_admin_bar_showing()) {
        remove_action('admin_bar_menu', 'wp_admin_bar_comments_menu', 60);
    }
});


function remove_comments(){
        global $wp_admin_bar;
        $wp_admin_bar->remove_menu('comments');
}
add_action( 'wp_before_admin_bar_render', 'remove_comments' );

// custom thumbnail sizes

add_image_size( 'caseStudyImage', 1700, 1000, true );
add_image_size( 'featuredCaseStudy', 950, 680, true );
//add_image_size( 'clientLogos', 950, 300, true );

// single.php
add_image_size( 'blogFeatured', 800, 620, true );
add_image_size( 'blogThumb', 510, 306, true );
add_image_size( 'galleryThumb', 482, 374, true );
add_image_size( 'full', '', 1000, false );

// work archive
add_image_size( 'workThumb', 770, 600, true );

// work single
add_image_size( 'workFeatured', 1600, 590, true );

// excerpt length
add_filter( 'excerpt_length', function($length) {
    return 46;
} );

function new_excerpt_more( $more ) {
	return '...';
}
add_filter('excerpt_more', 'new_excerpt_more');

// select dropdown on form


function my_wpcf7_dropdown_form($html) {
	$text = 'Please select...';
	$html = str_replace('---', '' . $text . '', $html);
	return $html;
}
add_filter('wpcf7_form_elements', 'my_wpcf7_dropdown_form');


add_filter('wpcf7_form_elements', function($content) {
    $content = preg_replace('/<(span).*?class="\s*(?:.*\s)?wpcf7-form-control-wrap(?:\s[^"]+)?\s*"[^\>]*>(.*)<\/\1>/i', '\2', $content);

    return $content;
});



// remove p tag wrapper from around img tags in content of posts

// Remove P Tags Around Images 
// From: http://justlearnwp.com/remove-p-tag-around-wordpress-images/
function filter_ptags_on_images($content){
    return preg_replace('/<p>\s*(<a .*>)?\s*(<img .* \/>)\s*(<\/a>)?\s*<\/p>/iU', '\1\2\3', $content);
}
add_filter('the_content', 'filter_ptags_on_images');

// Custom Admin menu settings
function change_posts_menu_label() {
    global $menu;
    $menu[5][0] = 'News'; // Change the label to "Blog"
}
add_action( 'admin_menu', 'change_posts_menu_label' );

// Register Custom Post Type
function testimonials() {

	$labels = array(
		'name'                  => _x( 'Testimonials', 'Post Type General Name', 'text_domain' ),
		'singular_name'         => _x( 'Testimonial', 'Post Type Singular Name', 'text_domain' ),
		'menu_name'             => __( 'Testimonials', 'text_domain' ),
		'name_admin_bar'        => __( 'Testimonial', 'text_domain' ),
		'archives'              => __( 'Testimonials Archives', 'text_domain' ),
		'attributes'            => __( 'Testimonial Attributes', 'text_domain' ),
		'parent_item_colon'     => __( 'Parent Testimonial:', 'text_domain' ),
		'all_items'             => __( 'All Testimonial', 'text_domain' ),
		'add_new_item'          => __( 'Add New Testimonial', 'text_domain' ),
		'add_new'               => __( 'Add New', 'text_domain' ),
		'new_item'              => __( 'New Testimonial', 'text_domain' ),
		'edit_item'             => __( 'Edit Testimonial', 'text_domain' ),
		'update_item'           => __( 'Update Testimonial', 'text_domain' ),
		'view_item'             => __( 'View Testimonial', 'text_domain' ),
		'view_items'            => __( 'View Testimonial', 'text_domain' ),
		'search_items'          => __( 'Search Testimonial', 'text_domain' ),
		'not_found'             => __( 'Not found', 'text_domain' ),
		'not_found_in_trash'    => __( 'Not found in Trash', 'text_domain' ),
		'featured_image'        => __( 'Featured Image', 'text_domain' ),
		'set_featured_image'    => __( 'Set featured image', 'text_domain' ),
		'remove_featured_image' => __( 'Remove featured image', 'text_domain' ),
		'use_featured_image'    => __( 'Use as featured image', 'text_domain' ),
		'insert_into_item'      => __( 'Insert into Testimonial', 'text_domain' ),
		'uploaded_to_this_item' => __( 'Uploaded to this Testimonial', 'text_domain' ),
		'items_list'            => __( 'Testimonial list', 'text_domain' ),
		'items_list_navigation' => __( 'Testimonial list navigation', 'text_domain' ),
		'filter_items_list'     => __( 'Filter Testimonial list', 'text_domain' ),
	);
	$args = array(
		'label'                 => __( 'Testimonial', 'text_domain' ),
		'description'           => __( 'Testimonial Description', 'text_domain' ),
		'labels'                => $labels,
		'supports'              => array( 'title', 'editor' ),
		'hierarchical'          => false,
		'public'                => true,
		'show_ui'               => true,
		'show_in_menu'          => true,
		'menu_position'         => 6,
        'show_in_admin_bar'     => true,
        'menu_icon'             => 'dashicons-admin-comments',
		'show_in_nav_menus'     => true,
		'can_export'            => true,
		'has_archive'           => true,
		'exclude_from_search'   => true,
		'publicly_queryable'    => true,
		'capability_type'       => 'post',
	);
	register_post_type( 'testimonials', $args );

}
add_action( 'init', 'testimonials', 0 );

// Register Custom Post Type
function custom_careers_post_type() {

	$labels = array(
		'name'                  => _x( 'Careers', 'Post Type General Name', 'text_domain' ),
		'singular_name'         => _x( 'Career', 'Post Type Singular Name', 'text_domain' ),
		'menu_name'             => __( 'Careers', 'text_domain' ),
		'name_admin_bar'        => __( 'Career', 'text_domain' ),
		'archives'              => __( 'Careers Archives', 'text_domain' ),
		'attributes'            => __( 'Career Attributes', 'text_domain' ),
		'parent_item_colon'     => __( 'Parent Career:', 'text_domain' ),
		'all_items'             => __( 'All Careers', 'text_domain' ),
		'add_new_item'          => __( 'Add New Career', 'text_domain' ),
		'add_new'               => __( 'Add New', 'text_domain' ),
		'new_item'              => __( 'New Career', 'text_domain' ),
		'edit_item'             => __( 'Edit Career', 'text_domain' ),
		'update_item'           => __( 'Update Career', 'text_domain' ),
		'view_item'             => __( 'View Career', 'text_domain' ),
		'view_items'            => __( 'View Careers', 'text_domain' ),
		'search_items'          => __( 'Search Careers', 'text_domain' ),
		'not_found'             => __( 'Not found', 'text_domain' ),
		'not_found_in_trash'    => __( 'Not found in Trash', 'text_domain' ),
		'featured_image'        => __( 'Featured Image', 'text_domain' ),
		'set_featured_image'    => __( 'Set featured image', 'text_domain' ),
		'remove_featured_image' => __( 'Remove featured image', 'text_domain' ),
		'use_featured_image'    => __( 'Use as featured image', 'text_domain' ),
		'insert_into_item'      => __( 'Insert into Career', 'text_domain' ),
		'uploaded_to_this_item' => __( 'Uploaded to this Career', 'text_domain' ),
		'items_list'            => __( 'Career list', 'text_domain' ),
		'items_list_navigation' => __( 'Career list navigation', 'text_domain' ),
		'filter_items_list'     => __( 'Filter Career list', 'text_domain' ),
	);
	$args = array(
		'label'                 => __( 'Career', 'text_domain' ),
		'description'           => __( 'Career Description', 'text_domain' ),
		'labels'                => $labels,
		'supports'              => array( 'title', 'editor' ),
		'hierarchical'          => false,
		'public'                => true,
		'show_ui'               => true,
		'show_in_menu'          => true,
		'menu_position'         => 6,
		'show_in_admin_bar'     => true,
		'menu_icon'             => 'dashicons-businessman',
		'show_in_nav_menus'     => true,
		'can_export'            => true,
		'has_archive'           => true,
		'exclude_from_search'   => true,
		'publicly_queryable'    => true,
		'capability_type'       => 'post',
	);
	register_post_type( 'careers', $args );

}
add_action( 'init', 'custom_careers_post_type', 0 );



// remove Gutenberg

add_filter('use_block_editor_for_post', '__return_false', 10);

// redirect subscribers

// function wpdocs_my_login_redirect( $url, $request, $user ) {
//     if ( $user && is_object( $user ) && is_a( $user, 'WP_User' ) ) {
//         if ( $user->has_cap( 'administrator' ) ) {
//             $url = admin_url();
//         } else {
//             $url = home_url( '/scorecards/' );
//         }
//     }
//     return $url;
// }

// add_filter( 'login_redirect', 'wpdocs_my_login_redirect', 10, 3 );

// remove the <p> tag around iframes in the content editors.
function remove_paragraph_from_iframe( $value, $post_id, $field ) {
    if ( is_string( $value ) && strpos( $value, '<iframe' ) !== false ) {
        $pattern = '/<p>\s*(<iframe.*<\/iframe>)\s*<\/p>/i';
        $replacement = '${1}'; // Keep only the iframe tag
        
        $value = preg_replace( $pattern, $replacement, $value );
    }
    
    return $value;
}
add_filter( 'acf/format_value', 'remove_paragraph_from_iframe', 10, 3 );

// Hook into the 'init' action
add_action( 'init', 'create_vehicle_post_type', 0 );

// Create Vehicle Custom Post Type
function create_vehicle_post_type() {

    $labels = array(
        'name'                  => _x( 'Vehicles', 'Post Type General Name', 'text_domain' ),
        'singular_name'         => _x( 'Vehicle', 'Post Type Singular Name', 'text_domain' ),
        'menu_name'             => __( 'Vehicles', 'text_domain' ),
        'name_admin_bar'        => __( 'Vehicle', 'text_domain' ),
        'archives'              => __( 'Vehicle Archives', 'text_domain' ),
        'attributes'            => __( 'Vehicle Attributes', 'text_domain' ),
        'parent_item_colon'     => __( 'Parent Vehicle:', 'text_domain' ),
        'all_items'             => __( 'All Vehicles', 'text_domain' ),
        'add_new_item'          => __( 'Add New Vehicle', 'text_domain' ),
        'add_new'               => __( 'Add New', 'text_domain' ),
        'new_item'              => __( 'New Vehicle', 'text_domain' ),
        'edit_item'             => __( 'Edit Vehicle', 'text_domain' ),
        'update_item'           => __( 'Update Vehicle', 'text_domain' ),
        'view_item'             => __( 'View Vehicle', 'text_domain' ),
        'view_items'            => __( 'View Vehicles', 'text_domain' ),
        'search_items'          => __( 'Search Vehicle', 'text_domain' ),
        'not_found'             => __( 'Not found', 'text_domain' ),
        'not_found_in_trash'    => __( 'Not found in Trash', 'text_domain' ),
        'featured_image'        => __( 'Featured Image', 'text_domain' ),
        'set_featured_image'    => __( 'Set featured image', 'text_domain' ),
        'remove_featured_image' => __( 'Remove featured image', 'text_domain' ),
        'use_featured_image'    => __( 'Use as featured image', 'text_domain' ),
        'insert_into_item'      => __( 'Insert into vehicle', 'text_domain' ),
        'uploaded_to_this_item' => __( 'Uploaded to this vehicle', 'text_domain' ),
        'items_list'            => __( 'Vehicles list', 'text_domain' ),
        'items_list_navigation' => __( 'Vehicles list navigation', 'text_domain' ),
        'filter_items_list'     => __( 'Filter vehicles list', 'text_domain' ),
    );
    $args = array(
        'label'                 => __( 'Vehicle', 'text_domain' ),
        'description'           => __( 'Custom Post Type for Vehicles', 'text_domain' ),
        'labels'                => $labels,
        'supports'              => array( 'title', 'editor', 'thumbnail', 'excerpt' ),
        'taxonomies'            => array( 'category', 'post_tag' ),
        'hierarchical'          => false,
        'public'                => true,
        'show_ui'               => true,
        'show_in_menu'          => true,
        'menu_position'         => 5,
        'show_in_admin_bar'     => true,
        'show_in_nav_menus'     => true,
        'can_export'            => true,
        'has_archive'           => 'showroom',  // Enable archive page
        'exclude_from_search'   => false,
        'publicly_queryable'    => true,
        'capability_type'       => 'post',
    );
    register_post_type( 'vehicle', $args );

}

function register_body_type_taxonomy() {
    $labels = array(
        'name' => _x('Body Types', 'taxonomy general name'),
        'singular_name' => _x('Body Type', 'taxonomy singular name'),
        'search_items' => __('Search Body Types'),
        'all_items' => __('All Body Types'),
        'parent_item' => __('Parent Body Type'),
        'parent_item_colon' => __('Parent Body Type:'),
        'edit_item' => __('Edit Body Type'),
        'update_item' => __('Update Body Type'),
        'add_new_item' => __('Add New Body Type'),
        'new_item_name' => __('New Body Type Name'),
        'menu_name' => __('Body Types'),
    );

    $args = array(
        'hierarchical' => true,
        'labels' => $labels,
        'show_ui' => true,
        'show_admin_column' => true,
        'query_var' => true,
        'rewrite' => array('slug' => 'body-type'),
    );

    register_taxonomy('body_type', 'vehicle', $args);
}

add_action('init', 'register_body_type_taxonomy');

// cab type taxonomy for the vehicles
function register_cab_type_taxonomy() {
    $labels = array(
        'name' => _x('Cab Types', 'taxonomy general name'),
        'singular_name' => _x('Cab Type', 'taxonomy singular name'),
        'search_items' => __('Search Cab Types'),
        'all_items' => __('All Cab Types'),
        'parent_item' => __('Parent Cab Type'),
        'parent_item_colon' => __('Parent Cab Type:'),
        'edit_item' => __('Edit Cab Type'),
        'update_item' => __('Update Cab Type'),
        'add_new_item' => __('Add New Cab Type'),
        'new_item_name' => __('New Cab Type Name'),
        'menu_name' => __('Cab Types'),
    );

    $args = array(
        'hierarchical' => true,
        'labels' => $labels,
        'show_ui' => true,
        'show_admin_column' => true,
        'query_var' => true,
        'rewrite' => array('slug' => 'cab-type'),
    );

    register_taxonomy('cab_type', 'vehicle', $args);
}

add_action('init', 'register_cab_type_taxonomy');

// Wheelbase type taxonomy for the vehicles
function register_wheelbase_type_taxonomy() {
    $labels = array(
        'name' => _x('Wheelbase Types', 'taxonomy general name'),
        'singular_name' => _x('Wheelbase Type', 'taxonomy singular name'),
        'search_items' => __('Search Wheelbase Types'),
        'all_items' => __('All Wheelbase Types'),
        'parent_item' => __('Parent Wheelbase Type'),
        'parent_item_colon' => __('Parent Wheelbase Type:'),
        'edit_item' => __('Edit Wheelbase Type'),
        'update_item' => __('Update Wheelbase Type'),
        'add_new_item' => __('Add New Wheelbase Type'),
        'new_item_name' => __('New Wheelbase Type Name'),
        'menu_name' => __('Wheelbase Types'),
    );

    $args = array(
        'hierarchical' => true,
        'labels' => $labels,
        'show_ui' => true,
        'show_admin_column' => true,
        'query_var' => true,
        'rewrite' => array('slug' => 'wheelbase-type'), // Change 'wheelbase-type' to the desired slug
    );

    register_taxonomy('wheelbase_type', 'vehicle', $args); // Change 'wheelbase_type' to the desired taxonomy name
}

add_action('init', 'register_wheelbase_type_taxonomy');


// Fuel type taxonomy for the vehicles
function register_fuel_type_taxonomy() {
    $labels = array(
        'name' => _x('Fuel Types', 'taxonomy general name'),
        'singular_name' => _x('Fuel Type', 'taxonomy singular name'),
        'search_items' => __('Search Fuel Types'),
        'all_items' => __('All Fuel Types'),
        'parent_item' => __('Parent Fuel Type'),
        'parent_item_colon' => __('Parent Fuel Type:'),
        'edit_item' => __('Edit Fuel Type'),
        'update_item' => __('Update Fuel Type'),
        'add_new_item' => __('Add New Fuel Type'),
        'new_item_name' => __('New Fuel Type Name'),
        'menu_name' => __('Fuel Types'),
    );

    $args = array(
        'hierarchical' => true,
        'labels' => $labels,
        'show_ui' => true,
        'show_admin_column' => true,
        'query_var' => true,
        'rewrite' => array('slug' => 'fuel-type'), // Change 'fuel-type' to the desired slug
    );

    register_taxonomy('fuel_type', 'vehicle', $args); // Change 'fuel_type' to the desired taxonomy name
}

add_action('init', 'register_fuel_type_taxonomy');

// Colour taxonomy for the vehicles
function register_colour_taxonomy() {
    $labels = array(
        'name' => _x('Colours', 'taxonomy general name'),
        'singular_name' => _x('Colour', 'taxonomy singular name'),
        'search_items' => __('Search Colours'),
        'all_items' => __('All Colours'),
        'parent_item' => __('Parent Colour'),
        'parent_item_colon' => __('Parent Colour:'),
        'edit_item' => __('Edit Colour'),
        'update_item' => __('Update Colour'),
        'add_new_item' => __('Add New Colour'),
        'new_item_name' => __('New Colour Name'),
        'menu_name' => __('Colours'),
    );

    $args = array(
        'hierarchical' => true,
        'labels' => $labels,
        'show_ui' => true,
        'show_admin_column' => true,
        'query_var' => true,
        'rewrite' => array('slug' => 'colour'), // Change 'colour' to the desired slug
    );
    

    register_taxonomy('colour', 'vehicle', $args); // Change 'colour' to the desired taxonomy name
}

add_action('init', 'register_colour_taxonomy');


function get_bearer_token() {
    $apiKey = $_SERVER['API_KEY'];
    $apiSecret = $_SERVER['API_SECRET'];

    $args = array(
        'headers' => array(
            'Content-Type' => 'application/x-www-form-urlencoded',
        ),
        'body' => array(
            'key' => $apiKey,
            'secret' => $apiSecret
        ),
    );

    // $response = wp_remote_post('https://api-sandbox.autotrader.co.uk/authenticate', $args);
    $response = wp_remote_post('https://api.autotrader.co.uk/authenticate', $args);

    if (is_wp_error($response)) {
        wp_die('Failed to retrieve token: ' . $response->get_error_message());
        return;
    }

    $http_code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);
    $result = json_decode($body);

    if ($http_code != 200) {
        wp_die("Failed to retrieve token, HTTP code: $http_code, Body: " . print_r($result, true));
        return;
    }

    if (isset($result->access_token)) {
        return $result->access_token;
    } else {
        wp_die("No bearer token in response: " . print_r($result, true));
        return null;
    }
}

// ADMIN PANEL BUTTON to fetch all vehicles


function my_custom_menu_page() {
    add_menu_page('Update Vehicles', 'Update Vehicles', 'manage_options', 'fetch_vehicles', 'fetch_vehicles_page', 'dashicons-car', 8);
}
add_action('admin_menu', 'my_custom_menu_page');

// get script for when fetch vehicles button is pressed in the admin panel

// Your other functions and code

add_action('wp_ajax_fetch_vehicles', 'manual_fetch_vehicles_function');

function manual_fetch_vehicles_function() {
    error_log("Function manual_fetch_vehicles_function started");

    $bearer_token = get_bearer_token(); 
    error_log('Bearer token: ' . $bearer_token);

    $response = wp_remote_get('https://api.autotrader.co.uk/stock?advertiserId=10012129&pageSize=200', [
        'headers' => ['Authorization' => 'Bearer ' . $bearer_token]
    ]);
    $data = json_decode(wp_remote_retrieve_body($response), true);
    
    handle_vehicle_data($data);
    
    wp_die();
}

// // Your other functions and code

function handle_vehicle_data($data) {
    error_log("=== STARTING VEHICLE DATA PROCESSING ===");
    error_log("Raw data structure: " . print_r(array_keys($data), true));

    // Check if data is from GET or PUT method
    if (isset($data['results'])) {
        $vehicles = $data['results'];
        error_log("Processing GET request with " . count($vehicles) . " vehicles");
    } elseif (isset($data['data']) && isset($data['data']['vehicle'])) {
        $vehicles = [$data['data']]; // Convert single vehicle data from PUT into an array for compatibility
        error_log("Processing PUT request with single vehicle");
    } else {
        error_log("CRITICAL ERROR: Unknown data format.");
        error_log("Available keys: " . print_r(array_keys($data), true));
        return;
    }

    $api_stock_ids = [];
    error_log("Data exists, proceeding to loop through " . count($vehicles) . " vehicles.");

    foreach ($vehicles as $index => $result) {
        error_log("--- Processing vehicle #" . ($index + 1) . " ---");
        
        // Check if result has required structure
        if (!isset($result['vehicle']) || !isset($result['metadata']) || !isset($result['adverts'])) {
            error_log("SKIPPING: Missing required data structure in result #" . ($index + 1));
            error_log("Available keys: " . print_r(array_keys($result), true));
            continue;
        }

        $vehicle_data = $result['vehicle'];
        $metadata = $result['metadata'];
        $adverts = $result['adverts']['retailAdverts'];
        $stock_id = $metadata['stockId'];
        
        error_log("Stock ID: " . $stock_id);
        error_log("Vehicle Make: " . ($vehicle_data['make'] ?? 'NULL'));
        error_log("Vehicle Model: " . ($vehicle_data['model'] ?? 'NULL'));
        error_log("Vehicle Type: " . ($vehicle_data['vehicleType'] ?? 'NULL'));
        error_log("Lifecycle State: " . ($metadata['lifecycleState'] ?? 'NULL'));
        error_log("Advertiser Status: " . ($adverts['advertiserAdvert']['status'] ?? 'NULL'));

        $vehicle_make = $vehicle_data['make'];
        $vehicle_model = $vehicle_data['model'];
        $vehicle_type = $vehicle_data['vehicleType'];
        
        // FIX: Handle null derivative - use make + model as fallback
        $vehicle_derivative = $vehicle_data['derivative'];
        if (empty($vehicle_derivative)) {
            $vehicle_derivative = $vehicle_make . ' ' . $vehicle_model;
            error_log("Derivative was null, using fallback: " . $vehicle_derivative);
        }
        
        $vehicle_ownership_condition = $vehicle_data['ownershipCondition'];
        $vehicle_odometer_miles = $vehicle_data['odometerReadingMiles'];
        
        // FIX: Handle null fuelType
        $vehicle_fuel_type = $vehicle_data['fuelType'] ?? '';
        
        // FIX: Handle null cabType  
        $vehicle_cab_type = $vehicle_data['cabType'] ?? '';
        
        // FIX: Handle null wheelbaseType
        $wheelbaseType = $vehicle_data['wheelbaseType'] ?? '';
        
        $engine_capacity_cc = $vehicle_data['engineCapacityCC'];
        $vehicle_engine_capacity_cc = $engine_capacity_cc ? number_format(($engine_capacity_cc / 1000), 1) . 'L' : '';
        $transmissionType = $vehicle_data['transmissionType'];
        $supplied_price = $adverts['suppliedPrice']['amountGBP'];
        $total_price = $adverts['totalPrice']['amountGBP'];
        $body_type = $vehicle_data['bodyType'] ?? '';
        
        // FIX: Handle color - try main field first, then standard field
        $standard_colour = $vehicle_data['colour'] ?? $vehicle_data['standard']['colour'] ?? '';
        
        $media_images = $result['media']['images'];
        $api_stock_ids[] = $stock_id;
        $features = $result['features'];
        $vehicle_description = $adverts['description'];
        $plate = $vehicle_data['plate'];
        
        error_log("Processing vehicle: $vehicle_derivative (Stock ID: $stock_id)");
        error_log("Price: £" . number_format($supplied_price));

        // Check if 'advertiserAdvert' status is 'PUBLISHED'
        if ($adverts['advertiserAdvert']['status'] !== 'PUBLISHED') {
            error_log("SKIPPING: Vehicle with stockId: {$metadata['stockId']} is not published. Status: " . $adverts['advertiserAdvert']['status']);

            // Find the post with the given stockId
            $existing_posts = get_posts([
                'post_type' => 'vehicle',
                'meta_query' => [['key' => 'vehicle_id', 'value' => $stock_id]]
            ]);

            // If the post exists, delete it
            if (!empty($existing_posts)) {
                $post_id = $existing_posts[0]->ID;
                wp_delete_post($post_id, true);
                error_log("Deleted post with ID: $post_id corresponding to stockId: $stock_id");
            } else {
                error_log("No post found for stockId: $stock_id");
            }
            continue;
        }

        // Check if the vehicle is marked as SOLD
        if (isset($metadata['lifecycleState']) && ($metadata['lifecycleState'] === 'SOLD' || $metadata['lifecycleState'] === 'DELETED') ) {
            error_log("SKIPPING: Vehicle with stockId: $stock_id is SOLD/DELETED. State: " . $metadata['lifecycleState']);

            // Find the post with the given stockId
            $existing_posts = get_posts([
                'post_type' => 'vehicle',
                'meta_query' => [['key' => 'vehicle_id', 'value' => $stock_id]]
            ]);

            // If the post exists, delete it
            if (!empty($existing_posts)) {
                $post_id = $existing_posts[0]->ID;
                wp_delete_post($post_id, true);
                error_log("Deleted post with ID: $post_id corresponding to stockId: $stock_id");
            } else {
                error_log("No post found for stockId: $stock_id");
            }
            continue;
        }

        error_log("PROCEEDING: Vehicle passed all checks, attempting to create/update post");

        $existing_posts = get_posts([
            'post_type' => 'vehicle',
            'meta_query' => [['key' => 'vehicle_id', 'value' => $stock_id]]
        ]);

        error_log("Existing posts found: " . count($existing_posts));

        if (!empty($existing_posts)) {
            $post_id = $existing_posts[0]->ID;
            error_log("Updating existing post ID: " . $post_id);
        } else {
            error_log("Creating new post with title: " . $vehicle_derivative);
            $post_id = wp_insert_post([
                'post_title' => $vehicle_derivative,
                'post_type' => 'vehicle',
                'post_status' => 'publish'
            ]);
            
            if (is_wp_error($post_id)) {
                error_log("CRITICAL ERROR: Failed to create post - " . $post_id->get_error_message());
                continue;
            } else {
                error_log("SUCCESS: Created new post with ID: " . $post_id);
            }
        }
        
        // Update the post title if post already exists and it has been changed in the Autotrader login
        if ($post_id && !empty($existing_posts)) {
            $update_result = wp_update_post([
                'ID' => $post_id,
                'post_title' => $vehicle_derivative
            ]);
            
            if (is_wp_error($update_result)) {
                error_log("ERROR: Failed to update post title - " . $update_result->get_error_message());
            } else {
                error_log("SUCCESS: Updated post title to: " . $vehicle_derivative);
            }
        }

        if ($post_id) {
            error_log("Post ID confirmed: " . $post_id . " - Proceeding with meta data");

            $meta_data = [
                'vehicle_id' => $stock_id,
                'make' => $vehicle_make,
                'model' => $vehicle_model,
                'vehicle_type' => $vehicle_type,
                'condition' => $vehicle_ownership_condition,
                'mileage' => $vehicle_odometer_miles,
                'plate' => $plate,
                'fuel_type' => $vehicle_fuel_type,
                'cab_type' => $vehicle_cab_type,
                'wheelbase_type' => $wheelbaseType,
                'engine_size' => $vehicle_engine_capacity_cc,
                'transmission' => $transmissionType,
                'supplied_price' => $supplied_price,
                'total_price' => $total_price,
                'body_type' => $body_type,
                'colour' => $standard_colour,
                'vehicle_description' => $vehicle_description
            ];

            foreach ($meta_data as $key => $value) {
                $update_result = update_post_meta($post_id, $key, $value);
                error_log("Updated meta $key with value: $value (Result: " . ($update_result ? 'SUCCESS' : 'FAILED') . ")");
            }

            $taxonomy_terms = [
                'fuel_type' => $vehicle_fuel_type,
                'wheelbase_type' => $wheelbaseType,
                'cab_type' => $vehicle_cab_type,
                'body_type' => $body_type,
                'colour' => $standard_colour,
            ];

            foreach ($taxonomy_terms as $taxonomy => $term) {
                // Only process if term is not empty
                if (!empty($term)) {
                    if (!term_exists($term, $taxonomy)) {
                        $term_result = wp_insert_term($term, $taxonomy);
                        if (is_wp_error($term_result)) {
                            error_log("ERROR: Failed to create taxonomy term '$term' for '$taxonomy' - " . $term_result->get_error_message());
                        } else {
                            error_log("SUCCESS: Created taxonomy term '$term' for '$taxonomy'");
                        }
                    }
                    $set_result = wp_set_object_terms($post_id, $term, $taxonomy, false);
                    if (is_wp_error($set_result)) {
                        error_log("ERROR: Failed to set taxonomy '$taxonomy' to '$term' - " . $set_result->get_error_message());
                    } else {
                        error_log("SUCCESS: Set taxonomy $taxonomy to: $term");
                    }
                } else {
                    error_log("SKIPPING: Empty taxonomy term for: $taxonomy");
                }
            }

            // Handle images
            error_log("Processing " . count($media_images) . " images");
            
            // First, clear any existing rows in the 'gallery_images' repeater
            if (have_rows('gallery_images', $post_id)) {
                delete_field('gallery_images', $post_id);
                error_log("Cleared existing gallery images");
            }

            foreach ($media_images as $image_index => $image) {
                $image_url = $image['href'];
                $add_result = add_row('gallery_images', ['image_link' => $image_url], $post_id);
                error_log("Added image #" . ($image_index + 1) . ": " . ($add_result ? 'SUCCESS' : 'FAILED'));
            }

            // Handle features
            error_log("Processing " . count($features) . " features");
            
            if (have_rows('vehicle_features', $post_id)) {
                delete_field('vehicle_features', $post_id);
                error_log("Cleared existing vehicle features");
            }

            // Add the new feature data
            foreach ($features as $feature_index => $feature) {
                $feature_name = $feature['name'];
                $feature_type = $feature['type'];

                $result = add_row('vehicle_features', [
                    'feature_name' => $feature_name,
                    'feature_description' => $feature_type
                ], $post_id);

                if (!$result) {
                    error_log("FAILED to add feature #" . ($feature_index + 1) . ": $feature_name");
                } else {
                    error_log("SUCCESS: Added feature #" . ($feature_index + 1) . ": $feature_name");
                }
            }
            
            error_log("=== COMPLETED PROCESSING VEHICLE: $vehicle_derivative ===");

        } else {
            error_log("CRITICAL ERROR: Post ID not generated for stock_id: $stock_id");
            error_log("Vehicle data: " . print_r($vehicle_data, true));
        }   
    }

    error_log("=== FINISHED PROCESSING ALL VEHICLES ===");
    error_log("Total vehicles processed: " . count($vehicles));
    error_log("API Stock IDs collected: " . print_r($api_stock_ids, true));
}

function delete_posts_not_in_api_response($api_stock_ids) {
    $existing_posts = get_posts([
        'post_type' => 'vehicle',
        'numberposts' => -1,
        'meta_key' => 'vehicle_id',
    ]);

    foreach ($existing_posts as $post) {
        $post_stock_id = get_post_meta($post->ID, 'vehicle_id', true);

        // If the stock_id of the post is not in the API response, delete the post
        if (!in_array($post_stock_id, $api_stock_ids)) {
            wp_delete_post($post->ID, true); // Set the second parameter to true to force deletion permanently
        }
    }
}

function my_custom_sorting($query) {
    if (!is_admin() && $query->is_main_query() && $query->is_post_type_archive('vehicle')) {
        if (isset($_GET['orderby'])) {
            $orderby = sanitize_key($_GET['orderby']);
            
            if ($orderby === 'date') {
                $query->set('orderby', 'date');
                $query->set('order', 'DESC');
            } elseif ($orderby === 'price_low_high') {
                $query->set('meta_key', 'supplied_price');
                $query->set('orderby', 'meta_value_num');
                $query->set('order', 'ASC');
            } elseif ($orderby === 'price_high_low') {
                $query->set('meta_key', 'supplied_price');
                $query->set('orderby', 'meta_value_num');
                $query->set('order', 'DESC');
            }
        }
    }
}
add_action('pre_get_posts', 'my_custom_sorting');

function enqueue_admin_scripts($hook) {
    if ('toplevel_page_fetch_vehicles' !== $hook) {
        return;
    }
    wp_enqueue_script('my_custom_script', get_template_directory_uri() . '/js/admin-fetch-vehicles.js', array('jquery'));
}
add_action('admin_enqueue_scripts', 'enqueue_admin_scripts');

function fetch_vehicles_page() {
    ?>
    <div class="wrap">
        <h1>Update Vehicles from Autotrader</h1>

        <p>This button should be clicked any time that you make any updates to vehicles in Autotrader.</p>
        <p>Whether it is a new vehicle being added, one being deleted, or an existing vehicle being updated.</p>

        <button style="cursor:pointer;margin-top: 3rem;font-size: 24px;padding: 2rem;" id="fetch-vehicles-button">Update Now</button>


    </div>
    <?php
}

// Function to verify the AutoTrader-Signature header
function verify_autotrader_signature( WP_REST_Request $request ) {
    // Your secret key for 'AutoTrader-Signature' header, provided by Auto Trader
    // $your_secret_key = 'REDACTED-see-STEADPLAN-MIGRATION.md';
    $your_secret_key = 'REDACTED-see-STEADPLAN-MIGRATION.md';

    // Get the 'AutoTrader-Signature' header
    $autotraderSignatureHeader = $request->get_header('AutoTrader-Signature');

    // Extract the 't' and 'v1' values from the header
    preg_match('/t=([0-9]+)/', $autotraderSignatureHeader, $tMatches);
    preg_match('/v1=([a-fA-F0-9]+)/', $autotraderSignatureHeader, $v1Matches);
    $timeValue = $tMatches[1] ?? '';
    $receivedHash = $v1Matches[1] ?? '';

    // Get the raw payload
    $payload = $request->get_body();

    // Create the string to be hashed
    $stringToHash = $timeValue . '.' . $payload;

    // Calculate the HMAC SHA256 hash of the string
    $calculatedHmac = hash_hmac('sha256', $stringToHash, $your_secret_key);

    // Compare the calculated HMAC with the received hash
    return hash_equals($calculatedHmac, $receivedHash);
}

// A no-op function that logs the request data and returns a success status.
function noop_callback( WP_REST_Request $request ) {

    $json_data = $request->get_json_params();
    
    if (!empty($json_data)) {
        handle_vehicle_data($json_data);
    }

    // Get the raw request body
    $body = $request->get_body();
    file_put_contents(ABSPATH . 'put_file.log', "Raw Body: " . $body . "\n", FILE_APPEND);

    // Get and log JSON payload if available
    $json_data = $request->get_json_params();
    $json_string = json_encode($json_data, JSON_PRETTY_PRINT);
    $json_string = $json_data;
    file_put_contents(ABSPATH . 'put_file.log', "Parsed JSON: " . $json_string . "\n", FILE_APPEND);

    // // Log headers
    // $headers = $request->get_headers();
    // $headers_string = json_encode($headers, JSON_PRETTY_PRINT);
    // file_put_contents(ABSPATH . 'put_headers.log', $headers_string . "\n", FILE_APPEND);
    
    // file_put_contents(ABSPATH . 'put_full_request.log', print_r($request, true), FILE_APPEND);

    return new WP_REST_Response('Success', 200);
}

// Your existing rest_api_init action
add_action('rest_api_init', function () {
    register_rest_route('autotrader/v1', '/fetch_vehicles/', [
        'methods' => 'PUT',
        'callback' => 'noop_callback',
        'permission_callback' => 'verify_autotrader_signature'
    ]);
});

// 404 redirect for any deleted vehicle just in case it has been indexed. Nice frickin redirect

function redirect_404_vehicle_to_showroom() {
    // Check if this is a 404 and if the queried object is of post type 'vehicle'
    if (is_404() && get_query_var('post_type') === 'vehicle') {
        // Redirect to the /showroom page
        wp_redirect(home_url('/showroom'), 301); // 301 is the status code for 'Moved Permanently'
        exit;
    }
}
add_action('template_redirect', 'redirect_404_vehicle_to_showroom');
// NBM: when this theme is activated under a new folder name (deploy tool
// creates suffixed copies), carry over the previous theme's settings so
// menus, logo and customizer CSS survive the switch.
add_action('after_switch_theme', function ($old_name, $old_theme = null) {
    $new = get_option('stylesheet');
    $src = ($old_theme instanceof WP_Theme) ? $old_theme->get_stylesheet() : 'holdens';
    if (!$src || $src === $new) { return; }
    $mods = get_option('theme_mods_' . $src);
    if (is_array($mods)) { update_option('theme_mods_' . $new, $mods); }
    if (function_exists('wp_get_custom_css')) {
        $css = wp_get_custom_css($src);
        if ($css) { wp_update_custom_css_post($css, ['stylesheet' => $new]); }
    }
}, 10, 2);

// NBM: expose ACF field groups via the REST API (raw/light format) so page
// content can be managed programmatically with an application password.
add_filter('acf/load_field_group', function ($group) {
    $group['show_in_rest'] = 1;
    return $group;
});
add_filter('acf/settings/rest_api_format', function () {
    return 'light';
});
