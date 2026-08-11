<section class="fullImage">
    <div class="wrapper">
        <?php
        $fullImage = get_sub_field('column_image'); 
        ?>
        <div class="imageWrapper">
            <img src="<?php echo $fullImage['url']; ?>" width="<?php echo $fullImage['width']; ?>" height="<?php echo $fullImage['height']; ?>" alt="<?php echo $fullImage['alt']; ?>" />
        </div>
    </div>
</section>