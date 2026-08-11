<section class="oneColText pureAudio">
    <div class="wrapper">
        <div class="articleContent">
            <div class="column">
            <?php
                // Retrieve the ACF "file" field value
                $mp3_file = get_sub_field('mp3_file');

                // Check if the file field is not empty
                if ($mp3_file) {
                    // Get the URL of the uploaded MP3 file
                    $mp3_url = $mp3_file['url'];

                    // Get the title of the uploaded MP3 file
                    $mp3_title = $mp3_file['title'];

                    // Generate a unique ID for the audio player
                    $player_id = 'player_' . uniqid();

                    // Output the HTML for the audio player with the unique ID
                    echo '<audio id="' . $player_id . '" controls>';
                    echo '<source src="' . $mp3_url . '" type="audio/mpeg">';
                    echo 'Your browser does not support the audio element.';
                    echo '</audio>';
                }
                ?>

                <div class="audioTrack">
                    <div class="playPause"> 
                        <button onclick="playAudio('<?php echo $player_id; ?>')" id="play" class="clickable play <?php echo $player_id; ?>">Play</button> 
                        <button onclick="pauseAudio('<?php echo $player_id; ?>')" id="pause" class="clickable pause <?php echo $player_id; ?> hide">Pause</button> 
                    </div>

                    <div class="track">
                        <h4>
                        <?php
                            if ($mp3_file) {
                                $mp3_title = $mp3_file['title'];
                                echo '<span>' . $mp3_title . '</span>';
                            }
                        ?>
                        </h4>
                        <input type="range" id="trackSlider_<?php echo $player_id; ?>" class="styled-slider slider-progress" min="0" max="100" value="0" step="1" oninput="seekAudio('<?php echo $player_id; ?>')">
                        <div class="trackTime"><span id="progressTime_<?php echo $player_id; ?>">00:00</span><span id="totalTime_<?php echo $player_id; ?>">00:00</span></div>
                    </div>

                    <div class="albumArt">
                        <?php if( get_sub_field('album_art') ) { ?>
                            <?php $image=get_sub_field('album_art'); ?>
                            <img src="<?php echo $image['sizes']['albumArt']; ?>" alt="<?php echo $image['alt']; ?>" />
                        <?php } else { ?>
                            <img src="/wp-content/themes/soda/images/album-art-placeholder.jpg" alt="Soda Sound Logo" />
                        <?php } ?>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>