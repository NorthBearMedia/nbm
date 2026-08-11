jQuery(document).ready(function($) {
    $('#fetch-vehicles-button').click(function() {
        $.post(ajaxurl, { action: 'fetch_vehicles' }, function(response) {
            alert('Autotrader API Data Fetched. Your vehicles will now be all up to date.');
        });
    });
});
