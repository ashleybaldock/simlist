exports.format_time = function () {
    return function (text, render) {
        var time, timestr, days, hours, mins, secs;
        time = parseInt(render(text), 10);

        timestr = "";

        days  = Math.floor(time / 1000 / 60 / 60 / 24);
        hours = Math.floor(time / 1000 / 60 / 60) - days * 24;
        mins  = Math.floor(time / 1000 / 60) - days * 24 * 60 - hours * 60;
        secs  = Math.floor(time / 1000) - days * 24 * 60 * 60 - hours * 60 * 60 - mins * 60;

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
            timestr = timestr + mins.toString() + " minute ";
        } else if (mins > 1) {
            timestr = timestr + mins.toString() + " minutes ";
        }
        if (days < 1) {
            if (secs === 1) {
                timestr = timestr + secs.toString() + " second ";
            } else if (secs > 1) {
                timestr = timestr + secs.toString() + " seconds ";
            }
        }

        return timestr;
    };
};

exports.get_times = function (date, aiv) {
    var cdate, last, offset, next, overdue_by;
    // Takes last report date and the announce interval and returns object containing information about times
    // last - How long ago was the last report (and units for the time quantity)
    // next - How long until the next report (and units)
    // overdue_by - How long overdue is the next report (and units)

    cdate = (new Date()).getTime();

    // Current minus last = ms since report
    last  = cdate - date;

    // Difference between last date + interval and now
    offset = date + aiv * 1000 - cdate;

    if (offset > 0) {
        // Positive offset, not overdue
        next       = offset;
        overdue_by = 0;
    } else if (offset === 0) {
        // No offset, due now
        next       = 0;
        overdue_by = 1;
    } else {
        // Negative offset, overdue
        next       = 0;
        overdue_by = offset * -1;
    }

    return {last: last, next: next, overdue_by: overdue_by};
};

exports.csv_escape = function (text) {
    while (text.indexOf("\"") !== -1) {
        text = text.replace("\"", "");
    }
    if (text.indexOf(",") !== -1) {
        text = "\"" + text + "\"";
    }
    return text;
};
