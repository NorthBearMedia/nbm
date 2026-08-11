<!--

Template for the single Work page

-->
<?php
get_header();
wp_enqueue_style('workStyles');
?>

<section class="intro">
    <div class="wrapper">
        <?php
            // Assuming this code is within the single-'work'.php template file

            // Get the current work post
            global $post;

            // Display the post title
            echo '<div class="upper title">';
            echo '<div class="wrap titleWrapper">';
            echo '<h2 class="secondTitle revealTitle">Case Study<svg class="char" xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#101010" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#101010" stroke-width="2"/></g></g></svg></h2>';
            echo '<h1 class="revealTitle">' . get_the_title($post->ID) . '</h1>';
            echo '</div>';


            echo '<div class="wrap tagWrap">';

            // Display the selected 'industry' taxonomy categories
            $industry_terms = get_the_terms($post->ID, 'industry');
            if ($industry_terms && !is_wp_error($industry_terms)) {
                echo '<div class="industry-categories cats" style="opacity:0;transform:translateX(50px);">';
                echo '<h3><span>Client</span> Industry</h3>';
                echo '<ul>';
                foreach ($industry_terms as $industry_term) {
                    echo '<li>' . $industry_term->name . '</li>';
                }
                echo '</ul>';
                echo '</div>';
            }

            // Display the selected 'services' taxonomy categories
            $services_terms = get_the_terms($post->ID, 'services');
            if ($services_terms && !is_wp_error($services_terms)) {
                echo '<div class="services-categories cats" style="opacity:0;transform:translateX(50px);">';
                echo '<h3>Services <span>Provided</span></h3>';
                echo '<ul>';
                foreach ($services_terms as $services_term) {
                    echo '<li>' . $services_term->name . '</li>';
                }
                echo '</ul>';
                echo '</div>';
            }

            echo '</div>';
            echo '</div>';
            echo '<div class="imageWrapper" style="opacity:0;transform:translateY(50px;);">';
            // Display the featured image
            $featured_image_id = get_field('featured_image');
            if ($featured_image_id) {
                $image = wp_get_attachment_image_src($featured_image_id, 'workFeatured');
                if ($image) {
                    echo '<img src="' . $image[0] . '" alt="' . get_post_meta($featured_image_id, '_wp_attachment_image_alt', true) . '">';
                }
            } else {
                echo '<img src="/wp-content/uploads/2023/06/placeholder-1600x590.png" alt="Soda Sound">';
            }
            echo '</div>';
        ?>
    </div>
</section>
<div class="bottomContent" style="float:left;width:100%;transform:translateY(50px);opacity:0;">

<section class="caseStudyContent">
    <div class="wrapper">
        <?php
            // Display the case study copy
            $case_study_copy = get_field('case_study_copy');
            if ($case_study_copy) {
                echo '<div class="case-study-copy">' . $case_study_copy . '</div>';
            }
        ?>
    </div>
</section>

<?php if( get_field('case_study_video') ): ?>
    <section class="caseStudyVideo <?php the_field('square_video'); ?> onScreen">
        <div class="wrapper">
            <?php
                // Display the case study video
                $case_study_video = get_field('case_study_video');
                $video_caption = get_field('video_caption');
                if ($case_study_video) {
                    echo '<div class="videoContainer">' . $case_study_video . '</div>';
                }
                if ($video_caption) {
                    echo '<span class="caption">' . $video_caption . '</span>';
                }
            ?>
        </div>
    </section>
<?php endif; ?>

<?php if( get_field('case_study_video_2') ): ?>
    <section class="caseStudyVideo <?php the_field('square_video_2'); ?> onScreen">
        <div class="wrapper">
            <?php
                // Display the case study video
                $case_study_video_2 = get_field('case_study_video_2');
                $video_caption_2 = get_field('video_caption_2');
                if ($case_study_video_2) {
                    echo '<div class="videoContainer">' . $case_study_video_2 . '</div>';
                }
                if ($video_caption_2) {
                    echo '<span class="caption">' . $video_caption_2 . '</span>';
                }
            ?>
        </div>
    </section>
<?php endif; ?>

<?php if( get_field('case_study_video_3') ): ?>
    <section class="caseStudyVideo <?php the_field('square_video_3'); ?> onScreen">
        <div class="wrapper">
            <?php
                // Display the case study video
                $case_study_video_3 = get_field('case_study_video_3');
                $video_caption_3 = get_field('video_caption_3');
                if ($case_study_video_3) {
                    echo '<div class="videoContainer">' . $case_study_video_3 . '</div>';
                }
                if ($video_caption_3) {
                    echo '<span class="caption">' . $video_caption_3 . '</span>';
                }
            ?>
        </div>
    </section>
<?php endif; ?>

<?php if (get_field('audio_files') || get_field('apple_music_embed')): ?>
    <section class="caseStudyAudio caseStudyAppleMusic onScreen">
        <div class="wrapper topWrapper">
            <h3 class="secondTitle revealTitle"><svg class="char" xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#101010" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#101010" stroke-width="2"/></g></g></svg>Audio</h3>
        </div>
        <?php
            // Display the case study video
            $apple_music = get_field('apple_music_embed');
            if ($apple_music) {
                echo '<div class="wrapper"><div class="appleMusicContainer">' . $apple_music . '</div></div>';
            }
        ?>

        <?php
            // Display the audio files repeater
            $audio_files = get_field('audio_files');
            if ($audio_files) { ?>
                <div class="audio-files">
                    <div class="lower">
                        <div class="wrapper">
                            <ul>
                                <?php   
                                foreach ($audio_files as $audio_file) {
                                    $audio_file_title = $audio_file['audio_file_title'];
                                    $audio_file_copy = $audio_file['audio_file_copy'];
                                    $cs_audio_file = $audio_file['cs_audio_file'];
                                    $player_id = 'player_' . uniqid();
                                    ?>

                                    <li class="onScreen">
                                        <span class="audioWrap">
                                            <h4><?php echo $audio_file_title ?></h4>
                                            <p><?php echo $audio_file_copy ?></p>
                                        </span>

                                        <audio src="<?php echo $cs_audio_file['url'] ?>" id="<?php echo $player_id ?>" controls></audio>

                                        <div class="audioTrack">
                                            <div class="playPause"> 
                                                <button onclick="playAudio('<?php echo $player_id; ?>')" id="play" class="clickable play <?php echo $player_id; ?>">Play</button> 
                                                <button onclick="pauseAudio('<?php echo $player_id; ?>')" id="pause" class="clickable pause <?php echo $player_id; ?> hide">Pause</button> 
                                            </div>

                                            <div class="track">
                                                <input type="range" id="trackSlider_<?php echo $player_id; ?>" class="styled-slider slider-progress" min="0" max="100" value="0" step="1" oninput="seekAudio('<?php echo $player_id; ?>')">
                                                <div class="trackTime"><span id="progressTime_<?php echo $player_id; ?>">00:00</span><span id="totalTime_<?php echo $player_id; ?>">00:00</span></div>
                                            </div>
                                        </div>
                                    </li>
                                <?php } ?>
                            </ul>
                        </div>
                    </div>
                </div>
        <?php } ?>
    </section>
<?php endif; ?>

<?php if( get_field('testimonial') ): ?>
    <section class="caseStudyTestimonial onScreen">
        <?php
            // Display the testimonial
            $testimonial = get_field('testimonial');
            $testimonial_name = get_field('testimonial_name');
            $testimonial_description = get_field('testimonial_description');
            if ($testimonial && $testimonial_name && $testimonial_description) {
                echo '<div class="testimonial">';
                echo '<div class="wrapper">';
                echo '<h3 class="secondTitle">Testimonial<svg class="char" xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#101010" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#101010" stroke-width="2"/></g></g></svg></h3>';
                echo '</div>';
                echo '<div class="lower">';
                echo '<div class="wrapper">';
                echo '<div class="container">';
                echo '<blockquote>' . $testimonial . '</blockquote>';
                echo '<p class="testimonial-name">' . $testimonial_name . '</p>';
                echo '<p class="testimonial-description">' . $testimonial_description . '</p>';
                echo '</div>';
                echo '</div>';
                echo '</div>';
            }
        ?>
    </section>
<?php endif; ?>

<section class="caseStudyRelated onScreen">
    <div class="wrapper">
        <div class="upper">
            <h2 class="sectionTwoTitle regular secondTitle arrowTitle onScreen revealTitle">
            More Work    
            <svg class="char" xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#fff" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#fff" stroke-width="2"/></g></g></svg></h2>
        </div>
        <div class="serviceLinks"></div>
    </div>
    <div class="wrapper">
        <div class="twoProjects">
        <?php
                $featured_work = get_field('work_case_study_1');
                $post_id = get_the_ID( $featured_work->ID );
                $workTitle = get_the_title( $featured_work->ID );
                $workPermalink = get_permalink( $featured_work->ID );
                $shortTitle = get_field('short_title', $featured_work->ID);
                $workImage = get_field('featured_image', $featured_work->ID);

                if( $featured_work ): ?>

                <div class="project projectOne onScreen">
                    <h2 class="regular caseStudyTitle revealTitle upper"><?php echo $workTitle; ?>.</h2>
                    <a href="<?php echo esc_html( $workPermalink ); ?>" class="imageWrapper">
                        <?php 
                            if ($workImage) {
                                echo wp_get_attachment_image( $workImage, 'featuredCaseStudy' );
                            } else {
                                echo '<img src="/wp-content/uploads/2023/06/placeholder-950x680.png" alt="Soda Sound">';
                            } 
                        ?>
                    </a>
                    <div class="detailWrapper">
                        <div class="top">
                            <h3><span class="words"><?php the_field('short_title', $featured_work->ID); ?></span></h3>
                            <?php 
                                $post_id = $featured_work->ID;
                                $services = get_the_terms($post_id, 'industry');
                                if (!empty($services)) {
                                    $service = reset($services); // Get the first service from the array
                                    echo '<p>' . $service->name . '</p>';
                                }
                            ?>
                        </div>
                        <div class="lower">
                            <h4>Services<br> Provided<svg xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#FA4638" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#FA4638" stroke-width="2"/></g></g></svg></h4>
                            <div class="tags">
                                <?php 
                                    $post_id = $featured_work->ID;
                                    $services = get_the_terms($post_id, 'details');
                                    if (!empty($services)) {
                                        echo '<ul>';
                                        foreach ($services as $service) {
                                            echo '<li><span>' . $service->name . '</span></li>';
                                        }
                                        echo '</ul>';
                                    }
                                ?>
                            </div>
                            <a href="<?php echo esc_html( $workPermalink ); ?>">See Case Study</a>
                        </div>
                    </div>
                </div>
            <?php endif; ?>

            <?php
                $featured_work2 = get_field('work_case_study_2');
                $post_id2 = get_the_ID( $featured_work2->ID );
                $workTitle2 = get_the_title( $featured_work2->ID );
                $workPermalink2 = get_permalink( $featured_work2->ID );
                $shortTitle2 = get_field('short_title', $featured_work2->ID);
                $workImage2 = get_field('featured_image', $featured_work2->ID);
                
                if( $featured_work2 ): ?>

                <div class="project projectTwo onScreen">
                    <h2 class="regular caseStudyTitle revealTitle upper"><?php echo $workTitle2; ?>.</h2>
                    <a href="<?php echo esc_html( $workPermalink2 ); ?>" class="imageWrapper">
                        <?php 
                            if ($workImage2) {
                                echo wp_get_attachment_image( $workImage2, 'featuredCaseStudy' );
                            } else {
                                echo '<img src="/wp-content/uploads/2023/06/placeholder-950x680.png" alt="Soda Sound">';
                            } 
                        ?>
                    </a>
                    <div class="detailWrapper">
                        <div class="top">
                            <h3><span class="words"><?php the_field('short_title', $featured_work2->ID); ?></span></h3>
                            <?php 
                                $post_id2 = $featured_work2->ID;
                                $services2 = get_the_terms($post_id2, 'industry');
                                if (!empty($services2)) {
                                    $service2 = reset($services2); // Get the first service from the array
                                    echo '<p>' . $service2->name . '</p>';
                                }
                            ?>
                        </div>
                        <div class="lower">
                            <h4>Services<br> Provided<svg xmlns="http://www.w3.org/2000/svg" width="51.753" height="51.753" viewBox="0 0 51.753 51.753"><g transform="translate(0.347 0.347)"><g transform="translate(11.498 11.498)"><path d="M.7,0V38.908H-38.209" transform="translate(38.209)" fill="none" stroke="#FA4638" stroke-width="2"/></g><g transform="translate(0.36 0.36)"><path d="M.89.89-48.646-48.646" transform="translate(48.646 48.646)" fill="none" stroke="#FA4638" stroke-width="2"/></g></g></svg></h4>
                            <div class="tags">
                                <?php 
                                    $post_id2 = $featured_work2->ID;
                                    $services2 = get_the_terms($post_id2, 'services');
                                    if (!empty($services2)) {
                                        echo '<ul>';
                                        foreach ($services2 as $service2) {
                                            echo '<li><span>' . $service2->name . '</span></li>';
                                        }
                                        echo '</ul>';
                                    }
                                ?>
                            </div>
                            <a href="<?php echo esc_html( $workPermalink2 ); ?>">See Case Study</a>
                        </div>
                    </div>
                </div>

            <?php endif; ?>
        </div>
    </div>
</section>
</div>

<?php get_footer(); ?>

<script>


    gsap.registerPlugin(ScrollTrigger);

    const splitTitle = new SplitType(".revealTitle");

    gsap.set('.char:not(.intro .upper .char)', { opacity: 0, y: 100 }); // Initial state of items, hidden and positioned off-screen
    gsap.set('.char:not(.bottomContent .char)', { opacity: 0, y: 150 }); // Initial state of items, hidden and positioned off-screen

    ScrollTrigger.batch('.char:not(.filters .char)', {
        onEnter: batch => {
            gsap.to(batch, {
                opacity: 1,
                y: 0,
                stagger: 0.05,
                duration: 0.1
            });
        },
        start: 'top 99%', // Adjust the threshold as per your needs
        end: '+=100', // Adjust the distance after which the animation should stop
        once: true // Animation will only trigger once when entering the screen
    });

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
        
        var tlHome = gsap.timeline({ease: "power3"})
        let intro = document.querySelector('.intro');
        let openingTitleLetters = document.querySelectorAll('.intro .upper .revealTitle .line .char');
        let industrycategories = document.querySelector('.industry-categories');
        let servicecategories = document.querySelector('.services-categories');
        let introImage = document.querySelector('.intro .wrapper .imageWrapper');

        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.bottomContent');

        tlHome.to(intro, {opacity:1, duration: .1, delay: 0.1}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(industrycategories, {opacity:1, x:0, duration: .5}) 
        tlHome.to(servicecategories, {opacity:1, x:0, duration: .5}, "-=.5") 
        tlHome.to(introImage, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}) 
    },

    // desktop
    [desktopBP]: function() {
        var tlHome = gsap.timeline({ease: "power3"})
        let intro = document.querySelector('.intro');
        let openingTitleLetters = document.querySelectorAll('.intro .upper .revealTitle .line .char');
        let industrycategories = document.querySelector('.industry-categories');
        let servicecategories = document.querySelector('.services-categories');
        let introImage = document.querySelector('.intro .wrapper .imageWrapper');

        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.bottomContent');

        tlHome.to(intro, {opacity:1, duration: .1, delay: 0.1}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(industrycategories, {opacity:1, x:0, duration: .5}) 
        tlHome.to(servicecategories, {opacity:1, x:0, duration: .5}, "-=.5") 
        tlHome.to(introImage, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}) 

    },

    // tablet
    [tabletBP]: function() {
        var tlHome = gsap.timeline({ease: "power3"})
        let intro = document.querySelector('.intro');
        let openingTitleLetters = document.querySelectorAll('.intro .upper .revealTitle .line .char');
        let industrycategories = document.querySelector('.industry-categories');
        let servicecategories = document.querySelector('.services-categories');
        let introImage = document.querySelector('.intro .wrapper .imageWrapper');

        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.bottomContent');

        tlHome.to(intro, {opacity:1, duration: .1, delay: 0.1}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(industrycategories, {opacity:1, x:0, duration: .5}) 
        tlHome.to(servicecategories, {opacity:1, x:0, duration: .5}, "-=.5") 
        tlHome.to(introImage, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}) 

    },

    // above mobile
    [largemobileBP]: function() {
        var tlHome = gsap.timeline({ease: "power3"})
        let intro = document.querySelector('.intro');
        let openingTitleLetters = document.querySelectorAll('.intro .upper .revealTitle .line .char');
        let industrycategories = document.querySelector('.industry-categories');
        let servicecategories = document.querySelector('.services-categories');
        let introImage = document.querySelector('.intro .wrapper .imageWrapper');

        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.bottomContent');

        tlHome.to(intro, {opacity:1, duration: .1, delay: 0.1}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(industrycategories, {opacity:1, x:0, duration: .5}) 
        tlHome.to(servicecategories, {opacity:1, x:0, duration: .5}, "-=.5") 
        tlHome.to(introImage, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}) 

    },
    // mobile
    [mobileBP]: function() {
        var tlHome = gsap.timeline({ease: "power3"})
        let intro = document.querySelector('.intro');
        let openingTitleLetters = document.querySelectorAll('.intro .upper .revealTitle .line .char');
        let industrycategories = document.querySelector('.industry-categories');
        let servicecategories = document.querySelector('.services-categories');
        let introImage = document.querySelector('.intro .wrapper .imageWrapper');

        let navWrapper = document.querySelector('.nav .wrapper');
        let container = document.querySelector('.bottomContent');

        tlHome.to(intro, {opacity:1, duration: .1, delay: 0.1}) 
        tlHome.to(openingTitleLetters, {opacity:1, y:0, duration: .5, stagger: .05}, "-=.5") 
        tlHome.to(industrycategories, {opacity:1, x:0, duration: .5}) 
        tlHome.to(servicecategories, {opacity:1, x:0, duration: .5}, "-=.5") 
        tlHome.to(introImage, {opacity:1, y:0, duration: .5}, "-=.5") 
        tlHome.to(navWrapper, {opacity:1, y:0, duration: .5}, "-=.75") 
        tlHome.to(container, {opacity:1, y:0, duration: .5}) 
    },

    // all 
    "all": function() {


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



    var projectsslider = $(".twoProjects");
    
    projectsslider.slick({
        // Slick Slider options
        dots: true,
        dotsClass: 'custom_paging',
        infinite: false,
        customPaging: function (slider, i) {
            //FYI just have a look at the object to find available information
            //press f12 to access the console in most browsers
            //you could also debug or look in the source
            console.log(slider);
            return  (i + 1) + '/' + slider.slideCount;
        },
        onAfterChange: function(slick, currentSlide) {
            setTimeout(function() {
            $('.slick-slide').removeClass('slick-active');
            $('.slick-current').addClass('slick-active');
            }, 100);
        }
        // Add any other options you need
    });

    // Update the counter on slide change
    projectsslider.on("afterChange", function(event, slick, currentSlide) {
        var counter = $(".counter");
        var totalSlides = slick.slideCount;

        counter.text((currentSlide + 1) + " / " + totalSlides);
    });


    // AUDIO

    function playAudio(playerId) {
        const players = document.querySelectorAll('audio');

        players.forEach(player => {
            if (player.id === playerId) {
                player.play();
            } else {
                player.pause();
            }

            const pauseButtons = player.parentNode.querySelectorAll('.pause');
                pauseButtons.forEach(button => {
                button.classList.add('hide');
            });

            const playButtons = player.parentNode.querySelectorAll('.play');
                playButtons.forEach(button => {
                button.classList.remove('hide');
            });
        });
    }

    function pauseAudio(playerId) {
        const player = document.getElementById(playerId);
        player.pause();
    }

    function seekAudio(playerId) {
        const player = document.getElementById(playerId);
        const trackSlider = document.getElementById('trackSlider_' + playerId);
        const seekTime = (player.duration / 100) * trackSlider.value;
        player.currentTime = seekTime;
    }

    const elements = document.getElementsByClassName('clickable');

    for (let i = 0; i < elements.length; i++) {
        elements[i].addEventListener('click', function() {
            const currentElement = this.parentNode.querySelector('.hide');

            if (currentElement) {
            currentElement.classList.remove('hide');
            }

            this.classList.add('hide');
        });
    }

    // Update progress time for each player
    const progressTimeElements = document.querySelectorAll('[id^="progressTime_"]');

    function updateProgressTime() {
        const player = this;
        const playerId = player.getAttribute('id');
        const progressTimeElement = document.getElementById('progressTime_' + playerId);
        const currentTime = formatTime(player.currentTime);
        progressTimeElement.textContent = currentTime;
    }

    function formatTime(time) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${padZero(minutes)}:${padZero(seconds)}`;
    }

    function padZero(num) {
        return String(num).padStart(2, '0');
    }

    // Update track sliders and total time for each player
    const trackSliders = document.querySelectorAll('input[type="range"].slider-progress');
    const totalTimeElements = document.querySelectorAll('[id^="totalTime_"]');

    function updateTrackSlider() {
        const player = this;
        const playerId = player.getAttribute('id');
        const trackSlider = document.getElementById('trackSlider_' + playerId);
        const progress = (player.currentTime / player.duration) * 100;
        trackSlider.value = progress;
    }

    function updateTotalTime() {
        const player = this;
        const playerId = player.getAttribute('id');
        const totalTimeElement = document.getElementById('totalTime_' + playerId);
        const totalTime = formatTime(player.duration);
        totalTimeElement.textContent = totalTime;
    }

    function resetPlayer(player) {
        const pauseButton = player.parentNode.querySelector('#pause');
        const playButton = player.parentNode.querySelector('#play');

        pauseButton.classList.add('hide');
        playButton.classList.remove('hide');

        const trackSlider = player.parentNode.querySelector('.slider-progress');
        const progressTimeElement = player.parentNode.querySelector('.progressTime');

        player.currentTime = 0;
        trackSlider.value = 0;
        progressTimeElement.textContent = '00:00';
    }

    // Add event listeners to each player
    const players = document.querySelectorAll('audio');

    players.forEach(player => {
        player.addEventListener('timeupdate', updateTrackSlider);
        player.addEventListener('timeupdate', updateProgressTime);
        player.addEventListener('loadedmetadata', updateTotalTime);
        player.addEventListener('ended', () => resetPlayer(player));
    });

</script>