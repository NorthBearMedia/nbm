<?php
/**
 * Plugin Name: Steadplan Media Restore (one-off)
 * Description: Restores wp-content/uploads from the Steadplan-Backup zip on Google Drive (the media was left out of the migration archive to keep it small). Activate, then click "Restore media now" in the admin notice. Delete this plugin once media is restored.
 * Version: 1.0.0
 * Author: North Bear Media
 */

if (!defined('ABSPATH')) { exit; }

define('SPMR_DRIVE_URL', 'https://drive.usercontent.google.com/download?id=1Kq2t5d1mczqI5DcK1080cIisN0CpYr3i&export=download&confirm=t');
define('SPMR_EXPECTED_SIZE', 692621040);
define('SPMR_ZIP_PREFIX', 'public_html/wp-content/uploads/');

add_action('admin_notices', function () {
    if (!current_user_can('manage_options')) { return; }
    $done = get_option('spmr_result');
    if ($done) {
        echo '<div class="notice notice-success"><p><strong>Steadplan Media Restore:</strong> ' . esc_html($done) . ' You can delete this plugin now.</p></div>';
        return;
    }
    $url = wp_nonce_url(admin_url('admin-post.php?action=spmr_restore'), 'spmr_restore');
    echo '<div class="notice notice-warning"><p><strong>Steadplan Media Restore:</strong> media files (wp-content/uploads, ~604&nbsp;MB) are not restored yet. '
        . '<a class="button button-primary" href="' . esc_url($url) . '">Restore media now</a> '
        . 'This downloads the backup from Google Drive onto the server and extracts the uploads folder. Takes a few minutes &mdash; leave the page open. If it times out, click again; it resumes.</p></div>';
});

add_action('admin_post_spmr_restore', function () {
    if (!current_user_can('manage_options')) { wp_die('Not allowed'); }
    check_admin_referer('spmr_restore');

    @set_time_limit(0);
    @ignore_user_abort(true);

    $tmp = WP_CONTENT_DIR . '/spmr-backup.tmp.zip';

    // Download (skipped if a complete file is already there from a previous try).
    if (!file_exists($tmp) || filesize($tmp) !== SPMR_EXPECTED_SIZE) {
        $fh = fopen($tmp, 'wb');
        if (!$fh) { wp_die('Cannot write to ' . esc_html($tmp)); }
        $ch = curl_init(SPMR_DRIVE_URL);
        curl_setopt_array($ch, [
            CURLOPT_FILE => $fh,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_LOW_SPEED_LIMIT => 1024,
            CURLOPT_LOW_SPEED_TIME => 60,
        ]);
        $ok = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        fclose($fh);
        clearstatcache();
        if (!$ok || filesize($tmp) !== SPMR_EXPECTED_SIZE) {
            $got = file_exists($tmp) ? filesize($tmp) : 0;
            wp_die('Download failed (' . esc_html($err) . '), got ' . esc_html((string) $got) . ' of ' . SPMR_EXPECTED_SIZE . ' bytes. Click the restore button to retry.');
        }
    }

    $zip = new ZipArchive();
    if ($zip->open($tmp) !== true) { wp_die('Could not open downloaded zip.'); }

    $files = 0; $bytes = 0; $errors = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        if (strpos($name, SPMR_ZIP_PREFIX) !== 0 || substr($name, -1) === '/') { continue; }
        $rel = substr($name, strlen('public_html/'));           // wp-content/uploads/...
        $dest = trailingslashit(ABSPATH) . $rel;
        $dir = dirname($dest);
        if (!is_dir($dir) && !wp_mkdir_p($dir)) { $errors[] = 'mkdir ' . $rel; continue; }
        $in = $zip->getStream($name);
        if (!$in) { $errors[] = 'read ' . $rel; continue; }
        $out = fopen($dest, 'wb');
        if (!$out) { fclose($in); $errors[] = 'write ' . $rel; continue; }
        $bytes += stream_copy_to_stream($in, $out);
        fclose($in); fclose($out);
        $files++;
    }
    $zip->close();
    @unlink($tmp);

    $msg = sprintf('Restored %d media files (%.0f MB).', $files, $bytes / 1048576);
    if ($errors) { $msg .= ' Errors on ' . count($errors) . ' files: ' . implode(', ', array_slice($errors, 0, 5)); }
    update_option('spmr_result', $msg, false);

    wp_safe_redirect(admin_url('plugins.php?spmr=done'));
    exit;
});
