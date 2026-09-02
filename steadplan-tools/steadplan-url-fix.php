<?php
/**
 * Plugin Name: Steadplan URL Fix (one-off)
 * Description: Serialize-safe search and replace of the temporary Hostinger preview domain back to steadplan.co.uk, including siteurl/home and the corrupted enquiry-form email addresses. Run once at go-live, then delete.
 * Version: 1.0.0
 * Author: North Bear Media
 */

if (!defined('ABSPATH')) { exit; }

define('SPFIX_FROM', 'darkcyan-dog-182593.hostingersite.com');
define('SPFIX_TO', 'steadplan.co.uk');

/**
 * Recursive, serialize-aware replace. Rebuilds serialized strings so length
 * prefixes stay correct (a plain str_replace corrupts them).
 */
function spfix_walk($data, $from, $to, &$n) {
    if (is_string($data)) {
        $un = @unserialize($data);
        if ($un !== false || $data === 'b:0;') {
            return serialize(spfix_walk($un, $from, $to, $n));
        }
        if (strpos($data, $from) !== false) {
            $n++;
            return str_replace($from, $to, $data);
        }
        return $data;
    }
    if (is_array($data)) {
        $out = array();
        foreach ($data as $k => $v) {
            $out[$k] = spfix_walk($v, $from, $to, $n);
        }
        return $out;
    }
    if (is_object($data)) {
        if ($data instanceof __PHP_Incomplete_Class) { return $data; }
        $out = clone $data;
        foreach (get_object_vars($data) as $k => $v) {
            $out->$k = spfix_walk($v, $from, $to, $n);
        }
        return $out;
    }
    return $data;
}

function spfix_run($dry = true) {
    global $wpdb;
    @set_time_limit(0);

    $report = array(
        'mode'    => $dry ? 'DRY RUN (nothing written)' : 'LIVE (changes written)',
        'from'    => SPFIX_FROM,
        'to'      => SPFIX_TO,
        'tables'  => array(),
        'total'   => 0,
        'samples' => array(),
    );

    $tables = $wpdb->get_col('SHOW TABLES');
    foreach ($tables as $table) {
        $cols = $wpdb->get_results("SHOW COLUMNS FROM `{$table}`");
        if (!$cols) { continue; }

        $pk = null;
        $text_cols = array();
        foreach ($cols as $c) {
            if ($c->Key === 'PRI' && $pk === null) { $pk = $c->Field; }
            if (preg_match('/(char|text|blob)/i', $c->Type)) { $text_cols[] = $c->Field; }
        }
        if (!$pk || !$text_cols) { continue; }

        $where = array();
        foreach ($text_cols as $col) {
            $where[] = "`{$col}` LIKE '%" . $wpdb->esc_like(SPFIX_FROM) . "%'";
        }
        $rows = $wpdb->get_results(
            "SELECT * FROM `{$table}` WHERE " . implode(' OR ', $where),
            ARRAY_A
        );
        if (!$rows) { continue; }

        $changed = 0;
        foreach ($rows as $row) {
            $update = array();
            foreach ($text_cols as $col) {
                if ($row[$col] === null) { continue; }
                $n = 0;
                $new = spfix_walk($row[$col], SPFIX_FROM, SPFIX_TO, $n);
                if ($n > 0 && $new !== $row[$col]) {
                    $update[$col] = $new;
                    $changed += $n;
                    if (count($report['samples']) < 8) {
                        $report['samples'][] = $table . '.' . $col . ' : ' . substr((string) $row[$col], 0, 90);
                    }
                }
            }
            if ($update && !$dry) {
                $wpdb->update($table, $update, array($pk => $row[$pk]));
            }
        }

        if ($changed) {
            $report['tables'][$table] = $changed;
            $report['total'] += $changed;
        }
    }

    if (!$dry) {
        update_option('siteurl', 'https://' . SPFIX_TO);
        update_option('home', 'https://' . SPFIX_TO);
        $report['siteurl'] = get_option('siteurl');
        $report['home']    = get_option('home');
        delete_option('rewrite_rules');
        wp_cache_flush();
    }

    return $report;
}

add_action('rest_api_init', function () {
    register_rest_route('spfix/v1', '/run', array(
        'methods'             => 'POST',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function ($req) {
            $dry = ($req->get_param('dry') !== '0');
            return spfix_run($dry);
        },
    ));
    register_rest_route('spfix/v1', '/status', array(
        'methods'             => 'GET',
        'permission_callback' => function () { return current_user_can('manage_options'); },
        'callback'            => function () {
            return array(
                'siteurl' => get_option('siteurl'),
                'home'    => get_option('home'),
                'admin_email' => get_option('admin_email'),
            );
        },
    ));
});
