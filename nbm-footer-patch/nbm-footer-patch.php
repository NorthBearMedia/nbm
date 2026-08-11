<?php
/**
 * Plugin Name: NBM Footer Patch (one-off)
 * Description: On activation, replaces the old "Website by Holdens" footer credit in the Holdens theme with "Maintained by North Bear Media" (keeps a backup as footer.php.pre-nbm.bak). Then delete this plugin.
 * Version: 2.0.0
 * Author: North Bear Media
 */

if (!defined('ABSPATH')) { exit; }

register_activation_hook(__FILE__, function () {
    $footer = get_template_directory() . '/footer.php';
    $backup = $footer . '.pre-nbm.bak';

    $new_block = '<a class="holdens" href="https://northbearmedia.co.uk/" title="North Bear Media" target="_blank">' . "\n"
               . '                <span>Maintained by North Bear Media</span>' . "\n"
               . '            </a>';

    if (!is_file($footer)) { update_option('nbm_fp_result', 'ERROR: footer.php not found', false); return; }
    $src = file_get_contents($footer);

    if (strpos($src, 'northbearmedia.co.uk') !== false) {
        update_option('nbm_fp_result', 'Footer already shows North Bear Media — nothing to do. Delete this plugin.', false);
        return;
    }

    $pattern = '/<a class="holdens".*?<\/a>/s';
    if (!preg_match_all($pattern, $src, $m) || count($m[0]) !== 1) {
        update_option('nbm_fp_result', 'ERROR: expected exactly 1 old credit block, found ' . (isset($m[0]) ? count($m[0]) : 0), false);
        return;
    }
    if (!is_file($backup)) { file_put_contents($backup, $src); }
    $out = preg_replace($pattern, $new_block, $src, 1);
    if ($out === null || $out === $src || file_put_contents($footer, $out) === false) {
        update_option('nbm_fp_result', 'ERROR: could not write footer.php', false);
        return;
    }
    update_option('nbm_fp_result', 'Done — footer now says "Maintained by North Bear Media" (backup kept as footer.php.pre-nbm.bak). Delete this plugin.', false);
});

add_action('admin_notices', function () {
    if (!current_user_can('manage_options')) { return; }
    $r = get_option('nbm_fp_result');
    if (!$r) { return; }
    $class = strpos($r, 'ERROR') === 0 ? 'notice-error' : 'notice-success';
    echo '<div class="notice ' . $class . '"><p><strong>NBM Footer Patch:</strong> ' . esc_html($r) . '</p></div>';
});
