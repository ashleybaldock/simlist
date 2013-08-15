exports.Translator = function Translator () {
};

exports.Translator.prototype.translate = function () {
    var translations = {
        server_listing: "Server Listing",
        show_server_detail: "Show detailed server information",
        hide_server_detail: "Hide detailed server information",

        status_0: "Offline",
        status_1: "Online",

        en: "English",
        de: "German",
        fr: "French",

        list_time_1: "Map dimensions: ",
        list_time_2: ", current in-game date: ",
        list_time_3: "(starting date: ",
        list_time_4: ")",

        list_players_1: "There are ",
        list_players_2: " active players (",
        list_players_3: " out of 16 player slots are locked). Currently ",
        list_players_4: " clients are connected.",

        list_map_1: "Map detail: ",
        list_map_2: " towns, ",
        list_map_3: " citizens, ",
        list_map_4: " factories, ",
        list_map_5: " vehicles and ",
        list_map_6: " stops.",

        list_pakset: "The pakset version is: ",
        list_ver: "The server game version is: ",

        list_announce_1: "The last announce by this server was ",
        list_announce_2: " ago, the next announce is ",
        list_announce_3: "expected in ",
        list_announce_4: "overdue by ",

        list_email: "Admin email: ",
        list_pakurl: "Pakset link: ",
        list_infurl: "Info link: ",
        list_comments: "Comments:",
        list_dnsport: "Server connection info: ",

        list_notset: "Not set",

        ms: "millisecond",
        mss: "milliseconds",
        sec: "second",
        secs: "seconds",
        min: "minute",
        mins: "minutes",
        hour: "hour",
        hours: "hours",
        day: "day",
        days: "days",

        month_1: "January",
        month_2: "February",
        month_3: "March",
        month_4: "April",
        month_5: "May",
        month_6: "June",
        month_7: "July",
        month_8: "August",
        month_9: "September",
        month_10: "October",
        month_11: "November",
        month_12: "December",
        time_unknown: "Unknown",
        start_unknown: "Unknown",
        size_unknown: "Unknown"

    };
    return function(text, render) {
        if (translations[render(text)]) {
            return translations[render(text)];
        } else {
            return render(text);
        }
    };
};
