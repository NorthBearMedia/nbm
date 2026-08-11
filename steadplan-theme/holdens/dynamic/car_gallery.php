<section class="carGallery">
    <div class="wrapper">
        <!-- MAIN SLIDES -->
        <div class="slider lightboxWrapper">
            <?php
            if (have_rows('car_gallery_images')) {
                while (have_rows('car_gallery_images')) {
                    the_row();
                    $image = get_sub_field('car_gallery_image');
                    $image_url_large = $image['sizes']['large']; // Use 'large' image size for main slides
            ?>
                    <figure>
                        <img src="<?php echo $image_url_large; ?>" alt="<?php echo $image['alt']; ?>">
                    </figure>
            <?php
                }
            }
            ?>
        </div>

        <!-- THUMBNAILS -->
        <div class="slider-nav-thumbnails">
            <?php
            if (have_rows('car_gallery_images')) {
                while (have_rows('car_gallery_images')) {
                    the_row();
                    $image = get_sub_field('car_gallery_image');
                    $image_url_thumbnail = $image['sizes']['galleryThumb']; // Use 'thumbnail' image size for thumbnails
            ?>
                    <div><img src="<?php echo $image_url_thumbnail; ?>" alt="<?php echo $image['alt']; ?>"></div>
            <?php
                }
            }
            ?>
        </div>
    </div>
</section>

<script>
    const lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    document.body.appendChild(lightbox);

    const images = document.querySelectorAll('.lightboxWrapper figure img'); // Get all images within the grid
    let currentIndex = 0; // Track the index of the currently displayed image

    images.forEach((image, index) => {
        image.addEventListener('click', () => {
            currentIndex = index; // Update the current index
            showImage(currentIndex);
            lightbox.classList.add('active');
        });
    });

    function showImage(index) {
        index = (index + images.length) % images.length; // Handle wrap-around
        const img = new Image(); // Create a new image element
        img.src = images[index].src;
        while (lightbox.firstChild) {
            lightbox.removeChild(lightbox.firstChild);
        }
        lightbox.appendChild(img);
        currentIndex = index; // Update the current index
        createNavigationButtons();
    }

    function createNavigationButtons() {
        const prevButton = document.createElement('button');
        prevButton.innerText = 'Previous';
        prevButton.className = 'lightbox-nav-button';
        prevButton.addEventListener('click', () => showImage(currentIndex - 1));

        const nextButton = document.createElement('button');
        nextButton.innerText = 'Next';
        nextButton.className = 'lightbox-nav-button';
        nextButton.addEventListener('click', () => showImage(currentIndex + 1));

        lightbox.appendChild(prevButton);
        lightbox.appendChild(nextButton);
    }

    lightbox.addEventListener('click', (e) => {
        if (!e.target.classList.contains('lightbox-nav-button')) {
            lightbox.classList.remove('active');
        }
    });

    // Initialize with the first image
    showImage(currentIndex);

</script>