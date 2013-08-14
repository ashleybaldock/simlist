exports.format_time = function (text, render) {
    // Format a time in nice human-readable way
    // Takes a time in ms and returns:
    // AA day(s), BB hour(s), CC minute(s), DD second(s), EE millisecond(s)
    var time, timestr, days, hours, mins, secs, ms;
    time = parseInt(render(text), 10);

    timestr = "";

    days  = Math.floor(time / 1000 / 60 / 60 / 24);
    hours = Math.floor(time / 1000 / 60 / 60) - days * 24;
    mins  = Math.floor(time / 1000 / 60) - days * 24 * 60 - hours * 60;
    secs  = Math.floor(time / 1000) - days * 24 * 60 * 60 - hours * 60 * 60 - mins * 60;
    ms    = time - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000 - mins * 60 * 1000 - secs * 1000;

    if (days === 1) {
        timestr = timestr + days.toString() + " day ";
    } else if (days > 1) {
        timestr = timestr + days.toString() + " days ";
    }
    if (hours === 1) {
        timestr = timestr + hours.toString() + " hour ";
    } else if (hours > 1) {
        timestr = timestr + hours.toString() + " hours ";
    }
    if (mins === 1) {
        timestr = timestr + mins.toString() + " min ";
    } else if (mins > 1) {
        timestr = timestr + mins.toString() + " mins ";
    }
    if (secs === 1) {
        timestr = timestr + secs.toString() + " sec ";
    } else if (secs > 1) {
        timestr = timestr + secs.toString() + " secs ";
    }
    if (ms === 1) {
        timestr = timestr + ms.toString() + " ms ";
    } else if (ms > 1) {
        timestr = timestr + ms.toString() + " mss ";
    }

    return timestr;
};
