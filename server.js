var express    = require('express');
var fs         = require("fs");
var mustache   = require('mustache');
var listing    = require('./lib/Listing.js');
var simutil    = require('./lib/SimUtil.js');
var translator = require('./lib/Translator.js');
var app = express();

var listing = new listing.Listing();

var translate = (new translator.Translator()).translate;

// Set up available languages/formats
var available_languages     = ["en"];
var available_formats  = ["html", "csv"];

var templatefiles = [
    "header.html",
    "footer.html",
    "announce.html",
    "langselect.html",
    "list.html"
];
var templates = {};

for (n in templatefiles) {
    if (templatefiles.hasOwnProperty(n)) {
        console.log("loading file: " + templatefiles[n] + "...");
        templates[templatefiles[n]] = fs.readFileSync(templatefiles[n], "utf8");
    }
}


var make_language_link_list = function (current, baseurl) {
    var cur, make_url, ret, n;
    cur = function (lang) {
        return lang === current;
    };
    make_url = function (lang) {
        if (baseurl.indexOf("?") !== -1) {
            return baseurl + "&lang=" + lang;
        } else {
            return baseurl + "?lang=" + lang;
        }
    };
    ret = [];
    for (n in available_languages) {
        ret.push({name: available_languages[n], cur: cur(available_languages[n]), url: make_url(available_languages[n])});
    }
    return ret;
};

app.use('/static', express.static(__dirname + '/public'));

app.get('/', function(req, res) {
    res.redirect(301, '/list');
});

app.get('/announce', function(req, res) {
    console.log("GET " + req.url);
    res.writeHead(405, {"Content-Type": "text/html", "Allow": "POST"});
    res.write(mustache.to_html(templates["announce.html"], {}));
    res.end();
});

app.post('/announce', function(req, res) {
    console.log("POST from " + req.connection.remoteAddress + " to " + req.url);
    // TODO
});

app.get('/list', function(req, res) {
    "use strict";
    var urlbase, get_times, pakset_names, paksets, paksets_mapped,
        key, new_item, pakstring, csv_escape, response_text,
        err;
    console.log("GET from " + req.connection.remoteAddress + " for " + req.url);

    // Process defaults
    if (!req.query.lang || available_languages.indexOf(req.query.lang) < 0) {
        console.log("No language specified, defaulting to English");
        req.query.lang = "en";
    }
    if (!req.query.format) {
        console.log("No format specified, defaulting to HTML");
        req.query.format = "html";
    }

    if (req.query.format === "html") {
        res.writeHead(200, {"Content-Type": "text/html"});

        // Write header
        res.write(mustache.to_html(templates["header.html"],
            {title: req.host + " - Server listing", lang: req.query.lang, translate: translate}));

        // Write language selector
        urlbase = "./list";
        if (req.query.detail) {
            urlbase = urlbase + "?detail=" + req.query.detail;
        }
        res.write(mustache.to_html(templates["langselect.html"],
            {available_lang: make_language_link_list(req.query.lang, urlbase), translate: translate}
        ));

        // Pakset ID string split by space, first part used to collate them


        get_times = function (date, aiv) {
            var cdate, last, offset, next, odue;
            // Takes last report date and the announce interval and returns object containing information about times
            // last - How long ago was the last report (and units for the time quantity)
            // next - How long until the next report (and units)
            // odue - How long overdue is the next report (and units)

            cdate = (new Date()).getTime();

            // Current minus last = ms since report
            last  = cdate - date;

            // Difference between last date + interval and now
            offset = date + aiv * 1000 - cdate;

            if (offset > 0) {
                // Positive offset, not overdue
                next  = offset;
            } else if (offset === 0) {
                // No offset, due now
                odue  = 1;
            } else {
                // Negative offset, overdue
                odue  = offset * -1;
            }

            return {last: last, next: next, odue: odue};
        };

        // TODO - optimise this to only attach timing info for the expanded entry

        pakset_names = [];
        paksets = {};
        for (key in listing.model) {
            if (listing.model.hasOwnProperty(key)) {
                new_item = listing.model[key];
                pakstring = new_item.pak.split(" ")[0];
                if (pakset_names.indexOf(pakstring) < 0) {
                    // Add new pakset name
                    pakset_names.push(pakstring);
                    paksets[pakstring] = [];
                }
                paksets[pakstring].push({detail: (key === req.query.detail), data: new_item, timing: get_times(new_item.date, new_item.aiv)});
            }
        }
        // Map paksets into output format for mustache
        paksets_mapped = [];
        for (key in paksets) {
            paksets_mapped.push({name: key, items: paksets[key]});
        }

        res.write(mustache.to_html(templates["list.html"],
            {lang: req.query.lang, translate: translate, timeformat: simutil.format_time,
             paksets: paksets_mapped}));

        res.write(mustache.to_html(templates["langselect.html"],
            {available_lang: make_language_link_list(req.query.lang, urlbase), translate: translate}
        ));
        res.write(mustache.to_html(templates["footer.html"], {}));
        res.end();

    } else if (req.query.format === "csv") {
        csv_escape = function (text) {
            while (text.indexOf("\"") !== -1) {
                text = text.replace("\"", "");
            }
            if (text.indexOf(",") !== -1) {
                text = "\"" + text + "\"";
            }
            return text;
        };

        response_text = "";

        // TODO without a name field upload the dns/port field in its place
        for (key in listing.model) {
            if (listing.model.hasOwnProperty(key)) {
                if (listing.model[key].dns
                    && listing.model[key].port
                    && listing.model[key].name 
                    && listing.model[key].rev
                    && listing.model[key].pak) {
                    response_text = response_text
                        + csv_escape(listing.model[key].name)
                        + "," + csv_escape(listing.model[key].dns
                        + ":" + listing.model[key].port)
                        + "," + csv_escape(listing.model[key].rev.toString())
                        + "," + csv_escape(listing.model[key].pak)
                        + "," + csv_escape(listing.model[key].st.toString()) + "\n";
                }
            }
        }

        res.writeHead(200, {"Content-Type": "text/plain", "Content-Length": response_text.length});
        res.end(response_text);
    } else {
        err = "501 Not Implemented - The specified output format is not supported, supported formats are: " + available_formats.toString();
        res.writeHead(501, {"Content-Type": "text/html", "Content-Length": err.length});
        res.end(err);
    }
});

app.listen(3000);
console.log('Listening on port 3000');
