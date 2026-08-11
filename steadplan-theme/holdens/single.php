<?php 
    // Enqueue styles before get_header()
    function enqueue_single_post_styles() {
        wp_enqueue_style('homeStyles');
        wp_enqueue_style('blogStyles');
    }
    add_action('wp_enqueue_scripts', 'enqueue_single_post_styles', 20);
    
    get_header();
?>
<style>
    .single-post .articleHeaderSection .wrapper .goBack {
        color: #ffffff;
        display: inline-flex;
        align-items: center;
        margin-bottom: 2rem;
        margin-top: 2rem;
    }
    .single-post .articleHeaderSection .wrapper .goBack svg {
        transform: rotate(45deg);
        max-width: 20px;
        margin-right: 20px;
    }
    @media (min-width: 1200px) {
        .single-post .articleHeaderSection .wrapper .goBack {
            margin-top: 0;
        }
    }
    .single-post .articleHeaderSection .wrapper .goBack:hover svg path {
        stroke: #E3F74D;
    }
    .single-post .articleHeaderSection .wrapper .goBack:hover {
        color: #E3F74D;
    }
    .linkWrap {
        max-width: 1374px;
        width:100%;
        margin-left: auto;
        margin-right: auto;
    }
    .single-post .oneColText .wrapper .share .lower .socialShare a:hover svg path {
        fill: #E3F74D;
    }
    .single-post .oneColText .wrapper p a {
        color: #6F49F6;
    }
    .single-post .oneColText .wrapper p a:hover {
        color: #ffffff;
    }
    .single-post .oneColText .wrapper ul, .single-post .oneColText .wrapper ol {
        padding-left: 16px;
    }
    @media (max-width: 599px) {
        .single-post .articleHeaderSection .wrapper .header-wrap .blogTitle h1 {
            font-size: 26px!important;
        }
    }
    .single-post .articleHeaderSection .wrapper .header-wrap .blogTitle h1 {
       text-shadow: 1px 1px 18px rgba(0, 0, 0, .7);
    }
</style>
      
<?php if ( have_posts() ) : ?>
    <?php while ( have_posts() ) : the_post(); ?>
    
    <div class="singlePage">
        
        <section class="articleHeaderSection">
            <div class="wrapper">
                <div class="linkWrap" style="opacity:0;transform:translateY(50px);">
                    <a class="goBack" href="/news/">
                    <svg xmlns="http://www.w3.org/2000/svg" width="35.26" height="35.261" viewBox="0 0 35.26 35.261"><g transform="translate(1.5 1.061)"><g transform="translate(0 7.277)"><path d="M-38.209,0V25.423h25.422" transform="translate(38.209)" fill="none" stroke="#ffffff" stroke-width="3"/></g><g transform="translate(0.332 0)"><path d="M-48.646-16.278l32.367-32.368" transform="translate(48.646 48.646)" fill="none" stroke="#ffffff" stroke-width="3"/></g></g></svg>
                    Back to news</a>
                </div>
                <?php $backgroundImg = wp_get_attachment_image_src( get_post_thumbnail_id($post->ID), 'full' );?>
                <div class="header-wrap" style="opacity:0;background-image: url('<?php echo $backgroundImg[0]; ?>');">
                    <div class="overlay"></div>
                    <div class="blogTitle" style="opacity:0;transform:translateY(50px);">
                        <h1 class="entry-title"><?php the_title(); ?></h1>                        
                    </div>
                </div>
            </div>
        </section>
        <section class="oneColText pureText onScreen">
            <div class="wrapper">
                <?php the_content(); ?>
                <?php include 'share.php'; ?>
            </div>
        </section>
    </div>
    <?php endwhile; wp_reset_query(); ?>
<?php endif; ?>


<script>

gsap.registerPlugin(ScrollTrigger);

// get different breakpoints based on datasets in body tag

var body = document.querySelector('body');

var mobileBP = body.dataset.breakpointMobile,
    largemobileBP = body.dataset.breakpointLargemobile,
    tabletBP = body.dataset.breakpointTablet,
    desktopBP = body.dataset.breakpointDesktop;
    largedesktopBP = body.dataset.breakpointLargedesktop;

ScrollTrigger.matchMedia({
    
// desktop
[largedesktopBP]: function() {      

},

// desktop
[desktopBP]: function() {

},

// tablet
[tabletBP]: function() {

},

// above mobile
[largemobileBP]: function() {

},
// mobile
[mobileBP]: function() {
   
},

// all 
"all": function() {

    var tlHome = gsap.timeline({ease: "power3"})
    let headerwrap = document.querySelector('.header-wrap');
    let blogTitle = document.querySelector('.blogTitle');
    let oneColText = document.querySelector('.oneColText');
    let nav = document.querySelector('header');
    let linkWrap = document.querySelector('.linkWrap');

    tlHome.to(headerwrap, {opacity:1, duration: .3, delay: 0.1})
    tlHome.to(blogTitle, {opacity:1, y:0, duration: .3}, "-=.3")
    tlHome.to(linkWrap, {opacity:1, y:0, duration: .3}, "-=.3")
    tlHome.to(nav, {y:0, duration: .3}, "-=.3")
    tlHome.to(oneColText, {opacity:1, duration: .5, y:0}, "-=.3")

// add class to each item - repeats on scroll back
                                                    
          // add class to each item - repeats on scroll back
                                                                
          const revealText = gsap.utils.toArray('.onScreen');
            revealText.forEach((sec, i) => {
                ScrollTrigger.create({
                trigger: sec,
                toggleClass: 'active',
                invalidateOnRefresh: true,
                start: 'top 99%',
                scrub:1,
                toggleActions:"start none none none",
                once: true,
                endTrigger: 'html',
                end: 'bottom top'
                })
            })

        }
});

</script>

<?php get_footer(); ?>