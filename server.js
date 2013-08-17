// 
// Simutrans Listing Server
// 
// 
// Copyright © 2011-2013 Timothy Baldock. All Rights Reserved.
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

// Configured by environment parameters
var header_image      = process.env.HEADER_IMAGE;
var port              = process.env.PORT;
var connection_string = process.env.MONGOLAB_URI;

// Includes
var express    = require('express');
var fs         = require("fs");
var mustache   = require('mustache');
var listing    = require('./lib/Listing.js');
var ListingProvider = require('./lib/MongoDBListingProvider.js').ListingProvider;
//var ListingProvider = require('./lib/MemoryListingProvider.js').ListingProvider;
var listingProvider = new ListingProvider(connection_string);
var simutil    = require('./lib/SimUtil.js');
var translator = require('./lib/Translator.js');
var app = express();
app.use(express.bodyParser());
app.set('trust proxy', true);

var translate = (new translator.Translator()).translate;

var prune_interval = 604800;

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

app.get('/', function(req, res) { res.redirect(301, '/list'); });

app.get('/announce', function(req, res) {
    res.writeHead(405, {"Content-Type": "text/html", "Allow": "POST"});
    res.write(mustache.to_html(templates["announce.html"], {}));
    res.end();
});

app.post('/announce', function(req, res) {
    var err;

    if (req.ip === '178.77.102.239') { res.send(403, "IP forbidden"); return; }

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

    listing.validate_dns(listing.parse_dns(req.body.dns), req.ip,
        function () {
            var new_listing = new listing.Listing(req.body.dns, req.body.port);
            console.log(JSON.stringify(req.body));
            if (new_listing.name === "") { new_listing.name = new_listing.dns; }

            listingProvider.findById(new_listing.id, function (existing_listing) {
                new_listing.update_from_object(existing_listing);
                new_listing.update_from_body(req.body);

                listingProvider.save(new_listing, function () {});
                res.send(201, JSON.stringify(new_listing));
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

    // Process defaults
    if (!req.query.format) { req.query.format = "html"; }

    if (req.query.format === "html") {
        res.writeHead(200, {"Content-Type": "text/html"});

        // Write header
        res.write(mustache.to_html(templates["header.html"],
            {title: req.host + " - Server listing", translate: translate, headerimage: header_image}));

        urlbase = "./list";
        if (req.query.detail) {
            urlbase = urlbase + "?detail=" + req.query.detail;
        }

        listingProvider.findAll(function (listings) {
            var pakset_names = [];
            var pakset_groups = {};
            for (key in listings) {
                if (listings.hasOwnProperty(key)) {
                    var item = listings[key];
                    var timings = simutil.get_times(item.date, item.aiv);
                    if (timings.overdue_by > prune_interval * 1000) {
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
                    var item = listings[key];
                    var timings = simutil.get_times(item.date, item.aiv);
                    if (timings.overdue_by > prune_interval * 1000) {
                        listingProvider.removeById(item.id, function(removed) {
                            console.log("Pruned stale server with id: " + removed.id);
                        });
                    } else {
                        if (timings.overdue_by > item.aiv * 1000) {
                            item.st = 0;
                        }
                        if (item.dns
                            && item.port
                            && item.name 
                            && item.rev
                            && item.pak) {
                            response = response
                                + simutil.csv_escape(item.name)
                                + "," + simutil.csv_escape(item.dns
                                + ":" + item.port)
                                + "," + simutil.csv_escape(item.rev.toString())
                                + "," + simutil.csv_escape(item.pak)
                                + "," + simutil.csv_escape(item.st.toString()) + "\n";
                        }
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

app.listen(port);
console.log('Listening on port ' + port);
