HOST = null; // localhost
PORT = 8001;

// when the daemon started
var starttime = (new Date()).getTime();

var mem = process.memoryUsage();
// every 10 seconds poll for the memory.
setInterval(function () {
    mem = process.memoryUsage();
}, 10*1000);


var mustache = require("/usr/local/bin/nodemodules/mustache");
var http = require("http");
var fs = require("fs");
var sys = require("sys");
var url = require("url");
var dns = require("dns");
var querystring = require("querystring");
DEBUG = false;

// Set up available languages/formats
var av_lang = ["en", "de", "fr"];
var av_formats = ["html", "csv"];
var av_type = ["std", "ex"];


// Load all templates
var templatefiles = [
    "header.html",
    "footer.html",
    "announce.html",
    "langselect.html",
    "list.html",
    "add_form.html",
    "manage_manageform.html",
    "manage_selectform.html"
];
var templates = {};

for (var n in templatefiles) {
    if (templatefiles.hasOwnProperty(n)) {
        sys.puts("loading file: " + templatefiles[n] + "...");
        templates[templatefiles[n]] = fs.readFileSync(templatefiles[n], "utf8");
    }
}


var notFound = function(req, res) {
    var NOT_FOUND = "Not Found\n";
    res.writeHead(404, {"Content-Type": "text/plain", "Content-Length": NOT_FOUND.length});
    res.end(NOT_FOUND);
};

// Maps containing paths and handlers (maybe same path for GET+POST with different actions)
var map_get = {};
var get = function (path, handler) {
    map_get[path] = handler;
};

var map_post = {};
var post = function (path, handler) {
    map_post[path] = handler;
};

var server = http.createServer(function (req, res) {
    if (req.method === "GET" || req.method === "HEAD") {
        var handler = map_get[url.parse(req.url).pathname] || notFound;

        handler(req, res);
    } else if (req.method === "POST") {
        var handler = map_post[url.parse(req.url).pathname] || notFound;

        handler(req, res);
    }
});

var listen = function (port, host) {
    server.listen(port, host);
    sys.puts("Server at http://" + (host || "127.0.0.1") + ":" + port.toString() + "/");
};

var close = function () { server.close(); };



var listing = {

    model: {},

    // Internal fields are valid but not settable remotely
    internal_fields: {
        "id": function (value) {
            default: function () {
                while(1) {
                    // Random number between 1000000000 and 9999999999
                    var id = 1000000000 + Math.floor(Math.random()*8999999999);
                    // Check that it isn't already in use
                    if (!listing.lookup_id(id)) {
                        return id;
                    }
                }
            },
            validate: function (value) { return false; },           // Immutable
            update: function (id, field, value) { return false; }   // Immutable
        },
        "did": function (value) {
            default: function () {
                while(1) {
                    // Random number between 1048576 (0x100000) and 16777215 (0xFFFFFF)
                    var did = (1048576 + Math.floor(Math.random()*15728639)).toString(16);
                    // Check that it isn't already in use
                    if (!this.lookup_did(did)) {
                        return did;
                    }
                }
            },
            validate: function (value) { return false; },           // Immutable
            update: function (id, field, value) { return false; }   // Immutable
        },
        "ip4": function (value) {
            default: function () { return ""; },
            validate: function (value) {
                return true;                // TODO IPv4 validation
            },
            update: listing.update_internal_field,
        },
        "ip6": function (value) {
            default: function () { return ""; },
            validate: function (value) {
                return true;                // TODO IPv4 validation
            },
            update: listing.update_internal_field,
        },
        "date": function (value) {
            default: function () { return 0; },
            validate: function (value) {
                return (typeof value === typeof 0 && value >= 0);
            },
            update: function (id) {
                listing.model[id]["date"] = (new Date()).getTime();
                listing.sync = true;
            },
        }
    },
    // Valid fields contains all field identifiers which can be set remotely as keys
    // and their validator functions as values
    // If called without a value these functions return the default value for the field
    valid_fields: {
        "st": {
            default: function () { return 0; },
            validate: function (value) {
                return (typeof value === typeof 0 && value >= 0 && value < 2);
            },
            update: listing.update_field,
        },
        "type": function (value) {
            default: function () { return "std"; },
            validate: function (value) {
                for (var n in av_type) {
                    if (value === av_type[n]) { return true; }
                }
                return false;
            },
            update: listing.update_field,
        },
        "dns": {
            default: function () { return ""; },
            validate: function (value) {
                // a-z, 0-9, dot, colon, dash (anything which can be in a url/IPv4/IPv6 address)

                // Validate domain name/IP address here
                // If IP address is RFC1918, error
                // If contains ':' -> v6 validation
                // Else If contains '.' and last character is a number -> v4 validation
                // Else -> domain validation + lookup IP/IP6

                // TODO it should be an error condition if the dns name supplied does not
                // resolve to at least one v4/v6 address (indicates hostname is invalid)

                return true;
            },
            update: function (id, field, value) {
                // TODO
                // Assume that ID has been checked
                if (this.validate(value)) {
                    listing.model[id]["dns"] = value;
                    // Resolve the IPv4/IPv6 address of the hostname
                    dns.resolve4(value, function (err, addresses) {
                        // if (err) throw err;
                        if (!err && addresses.length > 0) {
                            // TODO - Handle multiple addresses better?
                            listing.update_internal_field(id, "ip4", addresses[0]);
                        }
                    });
                    dns.resolve6(value, function (err, addresses) {
                        // if (err) throw err;
                        if (!err && addresses.length > 0) {
                            // TODO - Handle multiple addresses better?
                            listing.update_internal_field(id, "ip6", addresses[0]);
                        }
                    });
                    listing.sync = true;
                    return true;
                }
                return false;
            },
        },
        "port": {
            default: 13353,
            validate: function (value) {
                return (value !== NaN && typeof value === typeof 0 && value > 0 && value < 65536);
            },
            update: listing.update_field,
        },
        "rev": {
            default: function () { return ""; },
            validate: function (value) {
                return (typeof value === typeof "str" && value.length < 100);
            },
            update: listing.update_field,
        },
        "pak": {
            default: function () { return ""; },
            validate: function (value) {
                return (typeof value === typeof "str" && value.length < 100);
            },
            update: listing.update_field,
        },
        "name": {
            default: function () { return ""; },
            validate: function (value) {
                return (typeof value === typeof "str" && value.length < 200);
            },
            update: listing.update_field,
        },
        "email": {
            default: function () { return ""; },
            validate: function (value) {
                return true;                        // TODO (email)
            },
            update: listing.update_field,
        },
        "pakurl": {
            default: function () { return ""; },
            validate: function (value) {
                return true;                        // TODO (url)
            },
            update: listing.update_field,
        },
        "addurl": {
            default: function () { return ""; },
            validate: function (value) {
                return true;                        // TODO (url)
            },
            update: listing.update_field,
        },
        "infurl": {
            default: function () { return ""; },
            validate: function (value) {
                return true;                        // TODO (url)
            },
            update: listing.update_field,
        },
        "comments": {
            default: function () { return ""; },
            validate: function (value) {
                return (typeof value === typeof "str" && value.length < 2000);
            },
            update: listing.update_field,
        },
        "name": {
            default: function () { return ""; },
            validate: function (value) {
                return (typeof value === typeof "str" && value.length < 100);
            },
            update: listing.update_field,
        },
        "time": {
            default: function () { return {"yr": 1, "mn": 0}; },
            validate: function (value) {
            },
            update: ,       // TODO (validate tuple)
        },
        "size": {
            default: function () { return {"x": 0, "y": 0}; },
            validate: function (value) {
            },
            update: ,       // TODO (validate tuple)
        },
        "players": {
            default: function () { return [
                    {"p":  0, "a": 0, "l": 0},
                    {"p":  1, "a": 0, "l": 0},
                    {"p":  2, "a": 0, "l": 0},
                    {"p":  3, "a": 0, "l": 0},
                    {"p":  4, "a": 0, "l": 0},
                    {"p":  5, "a": 0, "l": 0},
                    {"p":  6, "a": 0, "l": 0},
                    {"p":  7, "a": 0, "l": 0},
                    {"p":  8, "a": 0, "l": 0},
                    {"p":  9, "a": 0, "l": 0},
                    {"p": 10, "a": 0, "l": 0},
                    {"p": 11, "a": 0, "l": 0},
                    {"p": 12, "a": 0, "l": 0},
                    {"p": 13, "a": 0, "l": 0},
                    {"p": 14, "a": 0, "l": 0},
                    {"p": 15, "a": 0, "l": 0}
                ]; },
            parse: function (rawvalue) {
                // If additional fields added to spec they go here
                var suboutputfields = ["p", "a", "l"];
                // Raw value looks like:
                // 0,0,0;1,0,0;2,0,0;3,0,0;4,0,0;...
                // Split by comma, then parse into dict set
                // If this fails at any point return false
                if (typeof rawvalue === typeof "") {
                    var output = [];
                    var vals = rawvalue.split(";");
                    for (var i=0; i<vals.length; i++) {
                        var suboutput = {};
                        var subvals = vals[i].split(",");
                        for (var j=0; j<subvals.length; j++) {
                            if (j < suboutputfields.length - 1) {
                                suboutput[suboutputfields[j]] = parseInt(subvals[j]);
                            }
                        }
                        output.push(suboutput);
                    }
                    return output;
                }
                return false;
            },
            validate: function (value) {
                                                        // TODO
                // Must be an array
                // Must contain minimum of 16 dicts
                // Each dict must contain the fields specified in player_fields
                // Each field must conform to its own spec
                    // "p" field must be number > 0
                    // "a" field must be number 0 or 1
                    // "l" field must be number 0 or 1
            },
            update: function (id, field, value) {
                                                        // TODO
                // Data expected in form
                var candidate = this.parse(value);
                if (this.validate(candidate)) {
                    listing.model[id]["players"] = candidate;
                    listing.sync = true;
                    return true;
                }
                return false;
            }
        },
        "clients": {
            default: function () { return 0; },
            validate: function (value) {
                return (value !== NaN && typeof value === typeof 0 && value > 0 && value < 16);
            },
            update: listing.update_field,
        },
        "towns": {
            default: function () { return 0; },
            validate: function (value) {
                return (value !== NaN && typeof value === typeof 0 && value > 0);
            },
            update: listing.update_field,
        },
        "citizens": {
            default: function () { return 0; },
            validate: function (value) {
                return (value !== NaN && typeof value === typeof 0 && value > 0);
            },
            update: listing.update_field,
        },
        "factories": {
            default: function () { return 0; },
            validate: function (value) {
                return (value !== NaN && typeof value === typeof 0 && value > 0);
            },
            update: listing.update_field,
        },
        "convoys": {
            default: function () { return 0; },
            validate: function (value) {
                return (value !== NaN && typeof value === typeof 0 && value > 0);
            },
            update: listing.update_field,
        },
        "stops": {
            default: function () { return 0; },
            validate: function (value) {
                return (value !== NaN && typeof value === typeof 0 && value > 0);
            },
            update: listing.update_field,
        }
    },

    lookup_id: function (lookupid) {
        // Lookup the record with the specified ID, return false if record not found
        for (var id in this.model) {
            if (parseInt(id) === parseInt(lookupid)) {
                return this.model[lookupid];
            }
        }
        return false;
    },
    lookup_did: function (lookupdid) {
        // Lookup record with the specified display ID, return false if record not found
        return false;        // TODO
    },

    create_server: function () {
        var new_server = {};
        // Add to listing + write out listing file
        for (var key in this.internal_fields) {
            new_server[key] = this.internal_fields[key]();
        }
        for (var key in this.valid_fields) {
            new_server[key] = this.valid_fields[key]();
        }
        sys.puts("New server created, ID: " + new_server["id"]);
        // Add a new server to the listing
        this.model[new_server["id"]] = new_server;
        // Return ID of the new server
        return new_server["id"];
    },

    write: function () {
        // Write listings out to file
    },

    read: function () {
        // Read listings in from file (load)
    },

    filter: function (field, value, set) {
        // Return an array of server objects where the specified field equals the specified value
        // If set is provided then the search is done against that list of objects rather than the master one
    },

    update_datestamp: function (id) {
        // Set datestamp of specified ID to now()
        this.update_internal_field(id, "date", Date.now());
        this.valid_fields["date"].update(id);
        return true;
    },

    // Generic field update function used by simple fields (internal)
    update_field: function (id, field, value) {
        // First call parse method, which will take input as it comes in
        // over the wire and convert it into the correct representation

        // Then check with the validate method, if this returns true it's safe
        // to go ahead and update the field
        if (listing.valid_fields[field].validate(value)) {
            this.model[id][field] = value;
            listing.sync = true;
            return true;
        }
        return false;
    },


    // External method, should be called for any potential update field
    validate_field: function (id, field, value) {
        // Validate (and update if valid) an externally accessible field
        if (this.lookup_id(id)) {
            if (field in this.valid_fields) {
                return this.valid_fields[field].update(id, field, value);
            }
        }
        return false;
    },

    update_server_player: function (id, player, active, locked) {
        // Update the specified player's status
        if (player >= 0 && player <= 15) {
            if (active == 0 || active == 1) {
                if (locked == 0 || locked == 1) {
                    listing[id]["players"][player] = [player, active, locked];
                    sync = true;
                    return true;
                }
            }
        } else {
            return false;
        }
    },
    update_internal_field: function (id, field, value) {
        if (this.lookup_id(id)) {
            if (field in this.valid_fields || field in this.internal_fields) {
                this.model[id][field] = value;
                sync = true;
                return true;
            }
        }
        return false;
    },
    update_server_date: function (id) {
        // Set last update datetime to now
        listing[id]["date"] = (new Date()).getTime();
        sync = true;        // We should sync data to disk next time sync check runs
        return true;
    }
};





function extname (path) {
    var index = path.lastIndexOf(".");
    return index < 0 ? "" : path.substring(index);
}

var staticHandler = function (filename) {
    var body, headers;
    var content_type = mime.lookupExtension(extname(filename));

    function loadResponseData(callback) {
        if (body && headers && !DEBUG) {
            callback();
            return;
        }

        sys.puts("GET " + filename);
        fs.readFile(filename, function (err, data) {
            if (err) {
                sys.puts("Error loading " + filename);
            } else {
                body = data;
                headers = { "Content-Type": content_type , "Content-Length": body.length };
                if (!DEBUG) headers["Cache-Control"] = "public";
                callback();
            }
        });
    }

    return function (req, res) {
        loadResponseData(function () {
            res.writeHead(200, headers);
            res.end(req.method === "HEAD" ? "" : body);
        });
    }
};

var mime = {
    // returns MIME type for extension, or fallback, or octet-steam
    lookupExtension : function(ext, fallback) {
        return mime.TYPES[ext.toLowerCase()] || fallback || 'application/octet-stream';
    },

    // List of mime-types we are likely to use
    TYPES : {
        ".css"  : "text/css",
        ".gif"  : "image/gif",
        ".html" : "text/html",
        ".ico"  : "image/vnd.microsoft.icon",
        ".jpeg" : "image/jpeg",
        ".jpg"  : "image/jpeg",
        ".js"   : "application/javascript",
        ".json" : "application/json",
        ".mime" : "message/rfc822",
        ".png"  : "image/png",
        ".xml"  : "application/xml"
    }
};




// Dynamic URL handlers

// Redirect to /list
get("/", staticHandler("index.html"));
get("/style.css", staticHandler("style.css"));
get("/simlogo.png", staticHandler("simlogo.png"));


// Map available languages into object for formatting page template
var make_lang = function (current, baseurl) {
    var cur = function (lang) {
        return lang === current;
    };
    var make_url = function (lang) {
        if (baseurl.indexOf("?") !== -1) {
            return baseurl + "&lang=" + lang;
        } else {
            return baseurl + "?lang=" + lang;
        }
    };
    var ret = [];
    for (var n in av_lang) {
        ret.push({name: av_lang[n], cur: cur(av_lang[n]), url: make_url(av_lang[n])});
    }
    return ret;
};

var translate = function() {
    var translations = {
        add_server: "Add New Server",
        server_listing: "Server Listing",
        manage_server: "Server Management",
        server_details: "Further information:",
        show_server_details: "Expand detailed server information",
        mapinfo_header: "Map information",
        otherinfo_header: "Other game information",
        en: "English",
        de: "German",
        fr: "French",
        status: "Status:",
        status_0: "Server Offline",
        status_1: "Server Online",
        datetime: "Last report:",
        dns: "FQDN or IP address of server:",
        reachable_ip4: "This server should be reachable via IPv4 with address: ",
        unreachable_ip4: "This server has no IPv4 addresses listed in DNS",
        reachable_ip6: "This server should be reachable via IPv6 with address: ",
        unreachable_ip6: "This server has no IPv6 addresses listed in DNS",
        ip4: "IPv4 address of server:",
        ip6: "IPv6 address of server:",
        port: "Server port:",
        rev: "Server revision:",
        email: "Send email to the server administrator",
        pak: "Current pakset:",
        name: "Server comment:",
        default_name: "&lt;No Name Specified&gt;",
        time: "In-game time:",
        players: "List of player slots",
        p_0: "Spectator",
        p_1: "Public Service",
        p_2: "Player 1",
        p_3: "Player 2",
        p_4: "Player 3",
        p_5: "Player 4",
        p_6: "Player 5",
        p_7: "Player 6",
        p_8: "Player 7",
        p_9: "Player 8",
        p_10: "Player 9",
        p_11: "Player 10",
        p_12: "Player 11",
        p_13: "Player 12",
        p_14: "Player 13",
        p_15: "Player 14",
        p_active_0: "Empty",
        p_active_1: "Active",
        p_locked_0: "Unlocked",
        p_locked_1: "Locked",
        pakurl_link: "Download pakset required to join this server",
        addurl_link: "Download addons needed on this server",
        infurl_link: "Further information about this server",
        servertype_std: "Simutrans Standard",
        servertype_ex: "Simutrans Experimental",
        comments: "Comments:",
        clients: "Connected clients:",
        towns: "Towns:",
        citizens: "Citizens:",
        factories: "Factories:",
        convoys: "Vehicles:",
        stops: "Stops:",
        select_server_id: "Enter a Server ID to manage settings",
        select_server_id_error: "Sorry, the ID specified is not registered. Please enter a valid ID or select 'Add Server' to register a new one."
    };
    return function(text, render) {
        if (translations[render(text)]) {
            return translations[render(text)];
        } else {
            return render(text);
        }
    };
};

var format_player = function() {
    return function(text, render) {
        if (text === "1") {
            return render("Yes");
        } else {
            return render("No");
        }
    };
};


// /announce
get("/announce", function (req, res) {
    // Return warning that this url must be POSTed to + link to /list
    sys.puts("GET " + req.url);
    res.writeHead(405, {"Content-Type": "text/html", "Allow": "POST"});
    res.write(mustache.to_html(templates["announce.html"], {}));
    res.end();
});
post("/announce", function (req, res) {
    sys.puts("POST " + req.url);

    var body="";
    req.on("data", function (data) {
        body += data;
    });
    req.on("end", function () {
        var qs = querystring.parse(body);
        // process defaults

        // Check ID is present and registered
        if (qs["id"] && listing.lookup_id(qs["id"])) {
            for (var key in qs)
            {
                if (qs.hasOwnProperty(key) && key !== "id") {
                    sys.puts("post data - " + key + ": " + qs[key]);
                    // Process args
                    // Special case for player info
                    if (key === "pstatus") {
                        listing.update_pstatus(qs["id"], key, qs[key]);
                    } else if (key === "plock") {
                        listing.update_plock(qs["id"], key, qs[key]);
                    } else {
                        listing.update_field(qs["id"], key, qs[key]);
                    }
                }
            }
            // Set date of this request, to keep track of server status in future
            listing.update_datestamp(qs["id"]);
            // Respond with just 202 Accepted header + single error code digit
            res.writeHead(202, {"Content-Type": "text/plain"});
            res.end("0");
        } else {
            // Invalid ID, return Bad Request error
            var err = "Bad Request - Missing ID field or ID not registered with server";
            sys.puts(err);
            res.writeHead(400, {"Content-Type": "text/plain", "Content-Length": err.length});
            res.end(err);
        }
    });
});


// /list?format=csv     - format for game engine
// /list?format=html    - default (html) output
// /list?lang=en&detail=did
get("/list", function (req, res) {
    sys.puts("GET " + req.url);

    // Possible values are: lang, detail
    var qs = url.parse(req.url, true).query;
    // Process defaults
    if (!qs["lang"] || av_lang.indexOf(qs["lang"]) < 0) {
        sys.puts("No language specified, defaulting to English");
        qs["lang"] = "en";
    }
    if (!qs["format"]) {
        sys.puts("No format specified, defaulting to HTML");
        qs["format"] = "html";
    }

    if (qs["format"] === "html") {
        res.writeHead(200, {"Content-Type": "text/html"});

        // Write header
        res.write(mustache.to_html(templates["header.html"],
            {title: "servers.simutrans.org - Server listing", lang: qs["lang"], translate: translate}));

        // Write language selector
        var urlbase = "./list";
        if (qs["detail"]) {
            urlbase = urlbase + "?detail=" + qs["detail"];
        }
        res.write(mustache.to_html(templates["langselect.html"],
            {available_lang: make_lang(qs["lang"], urlbase), translate: translate}
        ));

        var paksets = [{name: "pakset1", items: []}];
        for (var key in listing.model) {
            if (listing.model.hasOwnProperty(key)) {
                var new_item = listing.model[key];
                paksets[0]["items"].push(
                    {detail: (listing.model[key]["did"] === qs["detail"]),
                    data: listing.model[key]});
            }
        }

        // Return html formatted listing of servers
        res.write(mustache.to_html(templates["list.html"],
            {lang: qs["lang"], translate: translate, paksets: paksets,
                format_player: format_player, }));

        // Write the footer and close the request
        res.write(mustache.to_html(templates["footer.html"], {}));
        res.end();
    } else if (qs["format"] === "csv") {
        res.writeHead(200, {"Content-Type": "text/csv"});

        for (var key in listing.model) {
            if (listing.model.hasOwnProperty(key)) {
                // Format output as CSV, any string containing a comma should be quoted
                // Due to validation of input to fields, no need to validate output of the same
                // However only servers where all values differ from defaults should be output
                if (listing.model[key]["dns"] !== listing.valid_fields["dns"]() &&
                    listing.model[key]["port"] !== listing.valid_fields["port"]() &&
                    listing.model[key]["rev"] !== listing.valid_fields["rev"]() &&
                    listing.model[key]["pak"] !== listing.valid_fields["pak"]()) {
                    res.write(listing.model[key]["dns"] + ":" + listing.model[key]["port"] + "," + listing.model[key]["rev"] + "," + listing.model[key]["pak"] + "\n");
                }
            }
        }

        res.end();
    } else {
        // 501 error
        var err = "501 Not Implemented - The specified output format is not supported, supported formats are: " + av_formats.toString();
        res.writeHead(501, {"Content-Type": "text/html", "Content-Length": err.length});
        res.end(err);
    }
});


// GET -> form, POST -> submit
// /add?lang=en
get("/add", function (req, res) {
    sys.puts("GET " + req.url);

    // Possible values are: lang
    var qs = url.parse(req.url, true).query;
    // Process defaults
    if (!qs["lang"] || av_lang.indexOf(qs["lang"]) < 0) {
        sys.puts("No language specified, defaulting to English");
        qs["lang"] = "en";  // Default to English
    }

    res.writeHead(200, {'Content-Type': 'text/html'});

    // Write header
    res.write(mustache.to_html(templates["header.html"],
        {title: "servers.simutrans.org - Server listing", lang: qs["lang"], translate: translate}));

    // Write language selector
    var urlbase = "./add";
    if (qs["id"]) {
        urlbase = urlbase + "?id=" + qs["id"];
    }
    res.write(mustache.to_html(templates["langselect.html"],
        {available_lang: make_lang(qs["lang"], urlbase), translate: translate}
    ));

    // Write form to create new server ID
    res.write(mustache.to_html(templates["add_form.html"],
        {lang: qs["lang"], translate: translate}));

    // Write the footer and close the request
    res.write(mustache.to_html(templates["footer.html"], {}));
    res.end();
});
post("/add", function (req, res) {
    sys.puts("POST " + req.url);

    var body="";
    req.on("data", function (data) {
        body += data;
    });
    req.on("end", function () {
        var qs = querystring.parse(body);
        // Process defaults
        if (!qs["lang"] || av_lang.indexOf(qs["lang"]) < 0) {
            sys.puts("no language specified, defaulting to english");
            qs["lang"] = "en";  // default to english
        }

        // Generate new server here and then return id in redirect url - todo
        var newid = listing.create_server();

        for (var key in qs)
        {
            if (qs.hasOwnProperty(key)) {
                sys.puts("post data - " + key + ": " + qs[key]);
            }
        }

        // Set up redirect url
        // Set game type (standard or experimental)
        listing.update_field(newid, "type", qs["type"]);
        var newloc = "/manage?warn=1&lang=" + qs["lang"] + "&id=" + newid;


        var msg = "Redirecting you to: " + newloc;
        res.writeHead(303, {"location": newloc, "Content-Type": "text/html", "Content-Length": msg.length});
        res.end(msg);
    });
});


// GET -> form, POST -> submit form
// /manage?id=1234567890&lang=en&success=1&warn=1
get("/manage", function (req, res) {
    sys.puts("GET " + req.url);

    // Possible values are: lang, id
    var qs = url.parse(req.url, true).query;
    // Process defaults
    if (!qs["lang"] || av_lang.indexOf(qs["lang"]) < 0) {
        sys.puts("No language specified, defaulting to English");
        qs["lang"] = "en";  // Default to English
    }

    res.writeHead(200, {"Content-Type": "text/html"});

    // Write header
    res.write(mustache.to_html(templates["header.html"],
        {title: "servers.simutrans.org - Server listing", lang: qs["lang"], translate: translate}));

    // Write language selector
    var urlbase = "./manage";
    if (qs["id"]) {
        urlbase = urlbase + "?id=" + qs["id"];
    }
    res.write(mustache.to_html(templates["langselect.html"],
        {available_lang: make_lang(qs["lang"], urlbase), translate: translate}
    ));

    // If ID not found, write a message indicating this and present select form - TODO

    // Write form, either to select a server ID or to manage settings
    if (qs["id"]) {
        if (listing.lookup_id(qs["id"])) {
            res.write(mustache.to_html(templates["manage_manageform.html"],
                {lang: qs["lang"], translate: translate, fields: listing.model[qs["id"]], id: qs["id"]}));
        } else {
            res.write(mustache.to_html(templates["manage_selectform.html"],
                {lang: qs["lang"], translate: translate, error: true}));
        }
    } else {
        res.write(mustache.to_html(templates["manage_selectform.html"],
            {lang: qs["lang"], translate: translate, error: false}));
    }

    // Write the footer and close the request
    res.write(mustache.to_html(templates["footer.html"],
        {}));
    res.end();
});
post("/manage", function (req, res) {
    sys.puts("POST " + req.url);

    var body="";
    req.on("data", function (data) {
        body += data;
    });
    req.on("end", function () {
        var qs = querystring.parse(body);
        // Process defaults
        if (!qs["lang"] || av_lang.indexOf(qs["lang"]) < 0) {
            sys.puts("No language specified, defaulting to English");
            qs["lang"] = "en";  // Default to English
        }

        // Check ID is present and registered
        if (qs["id"] && listing.lookup_id(qs["id"])) {
            for (var key in qs)
            {
                if (qs.hasOwnProperty(key)) {
                    sys.puts("post data - " + key + ": " + qs[key]);
                    // Process args
                    listing.update_field(qs["id"], key, qs[key]);
                }
            }
            // Set up redirect URL
            var newloc = "/manage?success=1&lang=" + qs["lang"] + "&id=" + qs["id"];
            res.writeHead(303, {"Content-Type": "text/plain", "Location": newloc});
            res.end("Redirecting you to: " + newloc);
        } else {
            // Invalid ID, return Bad Request error
            var err = "Bad Request - Missing ID field or ID not registered with server";
            sys.puts(err);
            res.writeHead(400, {"Content-Type": "text/plain", "Content-Length": err.length});
            res.end(err);
        }
    });
});

listen(Number(process.env.PORT || PORT), HOST);







