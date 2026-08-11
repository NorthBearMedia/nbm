<?php
/**
 * The template for displaying the header
 */

?>
<!doctype html>
<html style="margin-top:0!important;" class="no-js" <?php language_attributes(); ?> >
	<head>
        <!-- Google Tag Manager -->
        <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','GTM-W8WMFZBV');</script>
        <!-- End Google Tag Manager -->
		<meta charset="<?php bloginfo( 'charset' ); ?>" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
		<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
		<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
		<link rel="manifest" href="/site.webmanifest">
		<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5">
		<meta name="msapplication-TileColor" content="#da532c">
		<meta name="theme-color" content="#ffffff">
		<?php wp_head(); ?>
		<meta name="format-detection" content="telephone=yes">
		<script src="<?php echo get_template_directory_uri(); ?>/js/lib/jquery.min.js"></script>
        <script type="text/javascript" src="//cdn.jsdelivr.net/npm/slick-carousel@1.8.1/slick/slick.min.js"></script>        
        <script src="https://unpkg.com/split-type"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Sora:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://use.typekit.net/ftu4fzx.css">
        <title>Steadplan</title>
        <style>
            .grecaptcha-badge {
                visibility: hidden;
            }
        </style>
	</head>
	
	<body data-breakpoint-mobile="(max-width: 639px)"
    data-breakpoint-largemobile="(min-width: 640px) and (max-width: 767px)"
    data-breakpoint-tablet="(min-width: 768px) and (max-width: 1099px)"
    data-breakpoint-desktop="(min-width: 1100px) and (max-width: 1199px)"
    data-breakpoint-largedesktop="(min-width: 1200px)" <?php body_class('fade-in'); ?>>

    <!-- Google Tag Manager (noscript) -->
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-W8WMFZBV"
    height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    <!-- End Google Tag Manager (noscript) -->

	<?php include 'nav.php'; ?>