// 
// Simutrans Listing Server
// 
// Version 1.0
// 
// 
// Copyright © 2011 Timothy Baldock. All Rights Reserved.
// 
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
// 
// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// 
// 3. The name of the author may not be used to endorse or promote products derived from this software without specific prior written permission from the author.
// 
// THIS SOFTWARE IS PROVIDED BY THE AUTHOR "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. 
// 

var express    = require('express');
var fs         = require("fs");
var mustache   = require('mustache');
var listing    = require('./lib/Listing.js');
var ListingProvider = require('./lib/ListingProvider.js').ListingProvider;
var listingProvider = new ListingProvider();
var simutil    = require('./lib/SimUtil.js');
var translator = require('./lib/Translator.js');
var app = express();
app.use(express.bodyParser());

var translate = (new translator.Translator()).translate;

//var prune_interval = 604800;
var prune_interval = 60;
// Set up available formats
var available_formats  = ["html", "csv"];

var templatefiles = [
    "header.html",
    "footer.html",
    "announce.html",
    "list.html"
];
var templates = {};

for (n in templatefiles) {
    if (templatefiles.hasOwnProperty(n)) {
        console.log("loading file: " + templatefiles[n] + "...");
        templates[templatefiles[n]] = fs.readFileSync("templates/" + templatefiles[n], "utf8");
    }
}


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
    var err;
    console.log("POST from " + req.connection.remoteAddress + " to " + req.url);

    // Perform validation of request
    if (!req.body.port) {
        res.send(400, "Bad Request - port field missing");
        return;
    }
    if (!listing.validate_port(listing.parse_port(req.body.port))) {
        res.send(400, "Bad Request - port field invalid");
        return;
    }
    if (!req.body.dns) {
        res.send(400, "Bad Request - DNS field missing");
        return;
    }

    // TODO cope with proxy http header here
    listing.validate_dns(listing.parse_dns(req.body.dns), req.connection.remoteAddress,
        function () {
            var new_listing = new listing.Listing(req.body.dns, req.body.port);

            listingProvider.findById(new_listing.id, function (existing_listing) {
                new_listing.update_from_object(existing_listing);
                new_listing.update_from_body(req.body);

                // Respond with just 202 Accepted header + single error code digit
                // TODO replace with a better HTTP response given that we know if it worked now
                res.writeHead(202, {"Content-Type": "text/html"});
                res.end(JSON.stringify(new_listing));
                //res.end("<a href=\"./list\">back to list</a>");
                listingProvider.save(new_listing, function () {
                    console.log("Persisted new listing");
                });
            });
        }, function () {
            res.send(400, "Bad Request - DNS field invalid");
        }
    );
});

app.get('/list', function(req, res) {
    var urlbase, pakset_names, paksets, paksets_mapped,
        key, new_item, pakstring, response_text,
        err;
    console.log("GET from " + req.connection.remoteAddress + " for " + req.url);

    // TODO
    // Rewrite this all using new Listings driver
    // GET should show recently offline servers in red, and not return ones which
    // have been offline for too long. Calculated dynamically during request

    // Process defaults
    if (!req.query.format) {
        console.log("No format specified, defaulting to HTML");
        req.query.format = "html";
    }

    if (req.query.format === "html") {
        res.writeHead(200, {"Content-Type": "text/html"});

        // Write header
        res.write(mustache.to_html(templates["header.html"],
            {title: req.host + " - Server listing", translate: translate}));

        urlbase = "./list";
        if (req.query.detail) {
            urlbase = urlbase + "?detail=" + req.query.detail;
        }

        // TODO - optimise this to only attach timing info for the expanded entry

        // TODO online/offline
        // online if it says it is IFF last report within announce interval
        // offline otherwise
        // Any entry found to be outside prune interval should be deleted
        listingProvider.findAll(function (listings) {
            var pakset_names = [];
            var pakset_groups = {};
            for (key in listings) {
                if (listings.hasOwnProperty(key)) {
                    var item = listings[key];
                    var timings = simutil.get_times(item.date, item.aiv);
                    if (timings.overdue_by > prune_interval * 1000) {
                        // Prune expired servers
                        listingProvider.removeById(item.id, function(removed) {
                            console.log("Pruned stale server with id: " + removed.id);
                        });
                    } else {
                        if (timings.overdue_by > item.aiv * 1000) {
                            item.st = 0;
                        }
                        var pakset_name = item.pak.split(" ")[0];
                        if (pakset_names.indexOf(pakset_name) < 0) {
                            pakset_names.push(pakset_name);
                            pakset_groups[pakset_name] = [];
                        }
                        pakset_groups[pakset_name].push({
                            detail: (key === req.query.detail),
                            data: item,
                            timing: timings
                        });
                    }
                }
            }

            // Map paksets into output format for mustache
            paksets_mapped = [];
            for (key in pakset_groups) {
                paksets_mapped.push({name: key, items: pakset_groups[key]});
            }

            res.write(mustache.to_html(templates["list.html"],
                {translate: translate, timeformat: simutil.format_time,
                 paksets: paksets_mapped}));

            res.write(mustache.to_html(templates["footer.html"], {}));
            res.end();
        });
    } else if (req.query.format === "csv") {
        var response = "";

        listingProvider.findAll(function (listings) {
            for (key in listings) {
                if (listings.hasOwnProperty(key)) {
                    // TODO without a name field upload the dns/port field in its place
                    if (listings[key].dns
                        && listings[key].port
                        && listings[key].name 
                        && listings[key].rev
                        && listings[key].pak) {
                        response = response
                            + csv_escape(listings[key].name)
                            + "," + csv_escape(listings[key].dns
                            + ":" + listings[key].port)
                            + "," + csv_escape(listings[key].rev.toString())
                            + "," + csv_escape(listings[key].pak)
                            + "," + csv_escape(listings[key].st.toString()) + "\n";
                    }
                }
            }
            res.writeHead(200, {"Content-Type": "text/plain", "Content-Length": response.length});
            res.end(response);
        });
    } else {
        err = "501 Not Implemented - The specified output format is not supported, supported formats are: " + available_formats.toString();
        res.writeHead(501, {"Content-Type": "text/html", "Content-Length": err.length});
        res.end(err);
    }
});

app.listen(3000);
console.log('Listening on port 3000');
