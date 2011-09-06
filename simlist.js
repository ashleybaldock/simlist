HOST = null;                            // Server listening IP (or null for all)
PORT = 8001;                            // Server listing port
OFFLINE_MULTIPLIER = 2;                 // Number of server announce intervals before server marked offline
PRUNE_INTERVAL = 604800;                // Length of time before inactive servers are removed from the listing
STATUS_CHECK_INTERVAL = 60;             // Interval between checks of server status
SYNC_FILE = "/var/simlist/listing";     // File to write out internal data model to
SYNC_INTERVAL = 30;                     // Sync internal data model to disk every XX seconds, default 30
DEBUG = false;                          // Turns on debugging interfaces



var mustache = require("/usr/local/bin/nodemodules/mustache");
var http = require("http");
var fs = require("fs");
var sys = require("sys");
var url = require("url");
var dns = require("dns");
var querystring = require("querystring");

// Set up available languages/formats
var av_lang = ["en", "de", "fr"];
var av_formats = ["html", "csv"];

// when the daemon started
var starttime = (new Date()).getTime();

var mem = process.memoryUsage();
// every 10 seconds poll for the memory.
setInterval(function () {
    mem = process.memoryUsage();
}, 10*1000);


var status_monitor;         // timeoutId for the status checks
var status_check = function () {
    sys.puts("Checking server statuses");
    // Check the last report date of all listed servers against the current date with respect to their announce interval
    // any which haven't been heard from in OFFLINE_MULTIPLIER times the interval should be set to offline status
    // Also check the last report date against the current date with respect to the PRUNE_INTERVAL
    // any not heard from in this interval should be removed entirely
    var cdate = (new Date()).getTime();
    for (var key in listing.model) {
        if (listing.model.hasOwnProperty(key) && listing.model[key]["st"] > 0) {
            sys.puts("Checking server: " + key + " aiv: " + listing.model[key]["aiv"]);
            // Check for prune interval
            var prunedate = listing.model[key]["date"] + PRUNE_INTERVAL * 1000;
            sys.puts("prunedate: " + prunedate + ", (" + prunedate/1000 + ")");
            sys.puts("difference: " + (cdate - prunedate));
            if (cdate > prunedate) {
                sys.puts("Removing server: " + key);
                delete listing.model[key];
                listing.sync = true;
            } else {
                // Check for offline interval
                var expiredate = listing.model[key]["date"] + listing.model[key]["aiv"] * 1000 * OFFLINE_MULTIPLIER;
                sys.puts("cdate:      " + cdate + ", (" + cdate/1000 + ")");
                sys.puts("expiredate: " + expiredate + ", (" + expiredate/1000 + ")");
                sys.puts("difference: " + (cdate - expiredate));
                if (cdate > expiredate) {
                    sys.puts("Setting server: " + key + " to offline");
                    listing.model[key]["st"] = 0;
                    listing.sync = true;
                }
            }
        }
    }
    status_monitor = setTimeout(status_check, STATUS_CHECK_INTERVAL*1000);
};


var sync_monitor;           // timeoutId for db file sync
var sync_check = function () {
    sys.puts("Checking sync status");
    // Check value of listing.sync, if true we should sync the current state of the listing to file (JSON.stringify) and set listing.sync to false
    if (listing.sync) {
        listing.sync = false;
        var output = JSON.stringify(listing.model);
        fs.writeFile(SYNC_FILE, output, function (err) {
            if (err) {
                sys.puts("Warning: Unable to sync model to file!");
                listing.sync = true;
                // throw err;
            } else {
                sys.puts("Sync complete");
            }
            // Schedule next check
            sync_monitor = setTimeout(sync_check, SYNC_INTERVAL*1000);
        });
    } else {
        // Schedule next check
        sync_monitor = setTimeout(sync_check, SYNC_INTERVAL*1000);
    }
};



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


var not_found = function(req, res) {
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
    var handler;
    if (req.method === "GET" || req.method === "HEAD") {
        handler = map_get[url.parse(req.url).pathname] || not_found;

        handler(req, res);
    } else if (req.method === "POST") {
        handler = map_post[url.parse(req.url).pathname] || not_found;

        handler(req, res);
    }
});

var listen = function (port, host) {
    server.listen(port, host);
    sys.puts("Server at http://" + (host || "0.0.0.0") + ":" + port.toString() + "/");
};

var close = function () { server.close(); };


// do the work of checking the string
var checkipv6 = function (str) {
    // From http://intermapper.com/support/tools/IPV6-Validator.aspx
    return (/^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/.test(str));
};
var checkipv4 = function (str) {
    // From http://www.regular-expressions.info/examples.html
    return (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(str));
};
var checkdomain = function (str) {
    // From http://www.mczen.com/blog/post/viewitemaspxid3deed1cc4f-92a4-4485-85b2-21356a3d18e0.aspx
    return (/^([a-zA-Z0-9]([-a-zA-Z0-9]+)?\.)+([a-zA-Z]{2,7}\.?)$/.test(str));
};



// New ID format is dns:port, e.g. entropy.me.uk:13353 or 2001:98b::33:13357
// Unique by this identifier


var listing = {
    // Set to true whenever any data changes to inform sync_monitor that a write to disk is needed
    sync: false,

    // Access methods
    lookup: function (lookupid) {
        // Lookup the record with the specified ID, return false if record not found
        for (var id in this.model) {
            if (this.model.hasOwnProperty(id) && id === lookupid) {
                return this.model[lookupid];
            }
        }
        return false;
    },

    new: function (newid, newdns, newport) {
        var new_server = {};
        // Add to listing + write out listing file
        for (var key in this.ifields) {
            new_server[key] = this.ifields[key].default();
        }
        // Set port + dns
        new_server["dns"] = newdns;
        new_server["port"] = newport;

        for (var key in this.vfields) {
            new_server[key] = this.vfields[key].default();
        }
        sys.puts("New server created, ID: " + newid);
        // Add a new server to the listing
        this.model[newid] = new_server;
        // Return true if added successfully
        return true;
    },

    read: function () {
        // Read listings in from file (load) (synchronous)
        var input = fs.readFileSync(SYNC_FILE);
        if (input.length > 0) {
            // Pass file contents through JSON
            var testlist = JSON.parse(input);
        } else {
            var testlist = {};
        }
        // Validate all properties using their validator functions to ensure loaded data isn't corrupt
        this.model = {};

        sys.puts("this.model: " + JSON.stringify(this.model));
        sys.puts("testlist: " + JSON.stringify(testlist));

        // For each ID record
        for (var key in testlist) {
            sys.puts("key: " + key);

            // Rebuild keys from the DNS and port fields of each record, if these fields are missing then it is an invalid record

            if (testlist[key]["port"] && this.ifields["port"].validate(testlist[key]["port"])) {
                if (testlist[key]["dns"] && this.ifields["dns"].validate(testlist[key]["dns"])) {
                    var newid = testlist[key]["dns"] + ":" + testlist[key]["port"];
                    if (listing.new(newid, testlist[key]["dns"], testlist[key]["port"])) {
                        // Must be a date field, must be valid
                        if (testlist[key]["date"] && this.ifields["date"].validate(testlist[key]["date"])) {
                            this.model[newid]["date"] = testlist[key]["date"];
                        }
                        // Then check all in vfields, and update values if valid
                        for (var vkey in this.vfields) {
                            if (this.vfields.hasOwnProperty(vkey)) {
                                if (testlist[key].hasOwnProperty(vkey) && this.vfields[vkey].validate(testlist[key][vkey])) {
                                    this.model[newid][vkey] = testlist[key][vkey];
                                }
                            }
                        }
                    } else {
                        sys.puts("Failed to add item with ID: " + newid + " - not unique!");
                    }
                } else {
                    sys.puts("Failed to add item with ID: " + newid + " - failed to validate dns!");
                }
            } else {
                sys.puts("Failed to add item with ID: " + newid + " - failed to validate port!");
            }
        }
    },

/*
    filter: function (field, value, set) {
        // Return an array of server objects where the specified field equals the specified value
        // If set is provided then the search is done against that list of objects rather than the master one
    },
*/

    update_datestamp: function (id) {
        // Set datestamp of specified ID to now()
        listing.ifields["date"].update(id);
        return true;
    },

    // Generic field update function used by simple fields (internal)
    update_field: function (id, field, value) {
        // First call parse method, which will take input as it comes in
        // over the wire and convert it into the correct representation
        sys.puts("update_field for: id: " + id + ", field: " + field + ", value: " + value);
        var parsedval = listing.vfields[field].parse(value);

        // Then check with the validate method, if this returns true it's safe
        // to go ahead and update the field
        if (listing.vfields[field].validate(parsedval)) {
            listing.model[id][field] = parsedval;
            listing.sync = true;
            return true;
        }
        return false;
    },


    // External method, should be called for any potential update field
    validate_field: function (id, field, value) {
        // Validate (and update if valid) an externally accessible field
        if (this.lookup(id)) {
            if (field in this.vfields) {
                return this.vfields[field].update(id, field, value);
            }
        }
        return false;
    }
};


// Data representation
listing.model = {};

// Internal fields are valid but not settable remotely
// Each internal field record has the following methods:
//   default()  - return a default value
//   validate() - validate storage format of field
//   update()   - update the field
listing.ifields = {
    "dns": {
        default: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        // Todo: validate should take a callback to execute on success
        // to permit async validation (e.g. dns lookups)
        validate: function (value, reqip, success, failure) {
            // Setup dummy functions (for validate without callbacks)
            if (typeof success !== "function") {
                success = function () { return true; };
            }
            if (typeof failure !== "function") {
                failure = function () { return false; };
            }
            if (typeof reqip === "undefined") {
                reqip = value;
            }

            // DNS MUST be valid FQDN, IPv4 or IPv6
            // Additionally one of the IP addresses MUST match reqip, else invalid
            if (checkipv6(value)) {
                if (value === reqip) {
                    // Exactly one IPv6 address which matches the reqip
                    sys.puts("dns.validate - success (matched IPv6 address)");
                    return success();
                } else {
                    sys.puts("dns.validate - failure (valid IPv6 but does not match request IP");
                    return failure();
                }
            }

            if (checkipv4(value)) {
                if (value === reqip) {
                    // Exactly one IPv4 address which matches the reqip
                    sys.puts("dns.validate - success (matched IPv4 address)");
                    return success();
                } else {
                    sys.puts("dns.validate - failure (valid IPv4 but does not match request IP");
                    return failure();
                }
            }

            if (checkdomain(value)) {
                if (value === reqip) {
                    // This will only occur when reqip was originally undefined
                    // i.e. when DNS validation is not needed (loading from disk)
                    return success();
                }
                // Try resolving IPv6 first (AAAA records)
                dns.resolve6(value, function (err, addresses) {
                    // if (err) throw err;
                    if (!err && addresses.length > 0) {
                        // Got at least one v6 address, compare them against reqip
                        addresses.forEach(function (element, index, array) {
                            if (element === reqip) {
                                sys.puts("dns.validate - success (matched IPv6 address from DNS)");
                                return success();
                            }
                        });
                    }
                    // No v6 addresses or none of them matches, try v4
                    dns.resolve4(value, function (err, addresses) {
                        // if (err) throw err;
                        if (!err && addresses.length > 0) {
                            // Got at least one v4 address, compare them against reqip
                            addresses.forEach(function (element, index, array) {
                                if (element === reqip) {
                                    sys.puts("dns.validate - success (matched IPv4 address from DNS)");
                                    return success();
                                }
                            });
                        }
                        // If we've got here then no addresses match, invoke failure
                        return failure();
                    });
                });
            }
        },
        update: function () { return false; }   // Immutable
    },
    "port": {
        default: function () { return 13353 },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value > 0 && value <= 65535);
        },
        update: function () { return false; }   // Immutable
    },
    "date": {
        default: function () { return 0; },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 0);
        },
        update: function (id) {
            listing.model[id]["date"] = (new Date()).getTime();
            listing.sync = true;
        }
    }
};

// Each field record has the following methods:
//   default()  - return a default value
//   validate() - validate storage format of field
//   update()   - update the field
//   parse()    - convert the "on-the-wire" data into the storage format
listing.vfields = {
    "st": {     // Status
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 0 && value < 2);
        },
        update: listing.update_field,
    },
    "aiv": {
        // Announce interval (seconds)
        default: function () { return 900; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 30);
        },
        update: listing.update_field,
    },
    "rev": {
        default: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 100);
        },
        update: listing.update_field,
    },
    "pak": {
        default: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 100);
        },
        update: listing.update_field,
    },
    "name": {
        default: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 200);
        },
        update: listing.update_field,
    },
    "email": {
        default: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return true;                        // TODO (email)
        },
        update: listing.update_field,
    },
    "pakurl": {
        default: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return true;                        // TODO (url)
        },
        update: listing.update_field,
    },
    "infurl": {
        default: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return true;                        // TODO (url)
        },
        update: listing.update_field,
    },
    "comments": {
        default: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 2000);
        },
        update: listing.update_field,
    },
    "name": {
        default: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 100);
        },
        update: listing.update_field,
    },
    "time": {
        // Current date of the server game
        default: function () { return {"yr": 1, "mn": 0}; },
        parse: function(rawvalue) {
            // Split by "," and store in dict with two fields
            return {"mn": parseInt(rawvalue.toString().split(",")[0]),
                    "yr": parseInt(rawvalue.toString().split(",")[1])};
        },
        validate: function (value) {
            sys.puts(JSON.stringify(value));
            if (typeof value === typeof {}) {
                if (value.hasOwnProperty("yr") && typeof value["yr"] === typeof 0 && value["yr"] > 0) {
                    if (value.hasOwnProperty("mn") && typeof value["mn"] === typeof 0 && value["mn"] >= 0 && value["mn"] < 12) {
                        return true;
                    }
                }
            }
            return false;
        },
        update: listing.update_field,
    },
    "start": {
        // Starting date of the server game
        default: function () { return {"yr": 1, "mn": 0}; },
        parse: function(rawvalue) {
            // Split by "," and store in dict with two fields
            return {"mn": parseInt(rawvalue.toString().split(",")[0]),
                    "yr": parseInt(rawvalue.toString().split(",")[1])};
        },
        validate: function (value) {
            sys.puts(JSON.stringify(value));
            if (typeof value === typeof {}) {
                if (value.hasOwnProperty("yr") && typeof value["yr"] === typeof 0 && value["yr"] > 0) {
                    if (value.hasOwnProperty("mn") && typeof value["mn"] === typeof 0 && value["mn"] >= 0 && value["mn"] < 12) {
                        return true;
                    }
                }
            }
            return false;
        },
        update: listing.update_field,
    },
    "size": {
        default: function () { return {"x": 0, "y": 0}; },
        parse: function(rawvalue) {
            // Split by "," and store in dict with two fields
            return {"x": parseInt(rawvalue.toString().split(",")[0]),
                    "y": parseInt(rawvalue.toString().split(",")[1])};
        },
        validate: function (value) {
            sys.puts(JSON.stringify(value));
            if (typeof value === typeof {}) {
                if (value.hasOwnProperty("x") && typeof value["x"] === typeof 0 && value["x"] > 0) {
                    if (value.hasOwnProperty("y") && typeof value["y"] === typeof 0 && value["y"] > 0) {
                        return true;
                    }
                }
            }
            return false;
        },
        update: listing.update_field,
    },
/*
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
        // If additional fields added to spec they go here
        suboutputfields: ["p", "a", "l"],
        parse: function (rawvalue) {
            // Raw value looks like:
            // 0,0,0;1,0,0;2,0,0;3,0,0;4,0,0;...
            // Split by comma, then parse into dict set
            // If this fails at any point return false
            if (typeof rawvalue === typeof "") {
                var output = [];
                var vals = rawvalue.split(";");
                for (var i=0; i<16; i++) {
                    var suboutput = {};
                    var subvals = vals[i].split(",");
                    for (var j=0; j<subvals.length; j++) {
                        if (j < this.suboutputfields.length) {
                            suboutput[this.suboutputfields[j]] = parseInt(subvals[j]);
                        }
                    }
                    output.push(suboutput);
                }
                return output;
            }
            return false;
        },
*/
        validate: function (value) {
            sys.puts(JSON.stringify(value));
            // Must be an array + must contain exactly 16 items
            if (typeof value === typeof [] && value.length === 16) {
                // Each dict must contain the fields specified in player_fields
                for (var i=0; i<value.length; i++) {
                    for (var j=0; j<this.suboutputfields.length; j++) {
                        if (!value[i].hasOwnProperty(this.suboutputfields[j])) {
                            return false;
                        }
                    }
                    // Each field must conform to its own spec
                    // TODO - these would be better stored as validator functions in the suboutputfields object for flexible validation
                        // "p" field must be number > 0
                        // "a" field must be number 0 or 1
                        // "l" field must be number 0 or 1
                    if (value[i]["p"] < 0) {
                        return false;
                    }
                    if (value[i]["a"] < 0 || value[i]["a"] > 1) {
                        return false;
                    }
                    if (value[i]["l"] < 0 || value[i]["l"] > 1) {
                        return false;
                    }
                }
                // If we got this far it must be valid
                return true;
            }
            return false;
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
    "active": {
        // number of active players
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value >= 0 && value < 16);
        },
        update: listing.update_field,
    },
    "locked": {
        // number of locked players
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value >= 0 && value < 16);
        },
        update: listing.update_field,
    },
    "clients": {
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value >= 0 && value < 16);
        },
        update: listing.update_field,
    },
    "towns": {
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value > 0);
        },
        update: listing.update_field,
    },
    "citizens": {
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value > 0);
        },
        update: listing.update_field,
    },
    "factories": {
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value > 0);
        },
        update: listing.update_field,
    },
    "convoys": {
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value > 0);
        },
        update: listing.update_field,
    },
    "stops": {
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value > 0);
        },
        update: listing.update_field,
    }
};





var redirect_handler_perm = function (filename) {
    var newloc = filename;
    var msg = "Redirecting you to: <a href=\"" + newloc + "\">" + newloc + "</a>";
    var headers = {"Location": newloc,
        "Content-Type": "text/html",
        "Content-Length": msg.length};

    return function (req, res) {
        res.writeHead(301, headers);
        res.end(msg);
    }
};

var static_handler = function (filename) {
    // returns MIME type for extension, or fallback, or octet-steam
    var mimelookup = function(ext, fallback) {
        return mimetypes[ext.toLowerCase()] || fallback || "application/octet-stream";
    };

    var extname = function (path) {
        var index = path.lastIndexOf(".");
        return index < 0 ? "" : path.substring(index);
    };

    // List of mime-types we are likely to use
    var mimetypes = {
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
    };

    var body, headers;
    var content_type = mimelookup(extname(filename));

    function load_response_data(callback) {
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
                headers = {"Content-Type": content_type, "Content-Length": body.length};
                if (!DEBUG) {
                    headers["Cache-Control"] = "public";
                }
                callback();
            }
        });
    }

    return function (req, res) {
        load_response_data(function () {
            res.writeHead(200, headers);
            res.end(req.method === "HEAD" ? "" : body);
        });
    }
};




// URL handlers

// Redirect to /list
get("/", redirect_handler_perm("/list"));

get("/style.css", static_handler("style.css"));
get("/simlogo.png", static_handler("simlogo.png"));
get("/demomap.png", static_handler("demomap.png"));


// Map available languages into object for formatting page template
// TODO do this once on server startup for all languages and then just select one
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

// TODO load in translations from file on startup
var translate = function() {
    var translations = {
        server_listing: "Server Listing",
        show_server_details: "Expand detailed server information",
        hide_server_details: "Hide detailed server information",

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
        list_rev: "The server game version is: ",

        list_announce_1: "The last announce by this server was ",
        list_announce_2: " ago, the next announce is ",
        list_announce_3: "expected in ",
        list_announce_4: "overdue by ",
        list_announce_5: ".",

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
        size_unknown: "Unknown",

    };
    return function(text, render) {
        if (translations[render(text)]) {
            return translations[render(text)];
        } else {
            return render(text);
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
    sys.puts("POST from " + req.connection.remoteAddress + " to " + req.url);

    var body="";
    req.on("data", function (data) {
        body += data;
    });
    req.on("end", function () {
        var qs = querystring.parse(body);
        // process defaults

        // ID formed of dns and port fields, these must be present + valid
        if (qs["port"] && listing.ifields["port"].validate(listing.ifields["port"].parse(qs["port"]))) {
            
            // Valid port field
            if (qs["dns"]) {
                listing.ifields["dns"].validate(listing.ifields["dns"].parse(qs["dns"]),
                req.connection.remoteAddress,
                function () {
                    // Success callback

                    var id = qs["dns"] + ":" + qs["port"];

                    if (!listing.lookup(id)) {
                        listing.new(id, listing.ifields["dns"].parse(qs["dns"]), listing.ifields["port"].parse(qs["port"]));
                    }

                    for (var key in qs)
                    {
                        if (qs.hasOwnProperty(key)) {
                            sys.puts("post data - " + key + ": " + qs[key]);
                            listing.validate_field(id, key, qs[key]);
                        }
                    }

                    // Set date of this request, to keep track of server status in future
                    listing.update_datestamp(id);

                    // Respond with just 202 Accepted header + single error code digit
                    // TODO replace with a better HTTP response given that we know if it worked now
                    res.writeHead(202, {"Content-Type": "text/html"});
                    res.end("<a href=\"./list\">back to list</a>");
                    
                }, function () {
                    // Failure callback
                    // Invalid ID, return Bad Request error
                    var err = "Bad Request - Missing DNS field or value invalid";
                    sys.puts(err);
                    res.writeHead(400, {"Content-Type": "text/plain", "Content-Length": err.length});
                    res.end(err);
                    return;
                });
            }
        } else {
            // Invalid ID, return Bad Request error
            var err = "Bad Request - Missing port field or value invalid";
            sys.puts(err);
            res.writeHead(400, {"Content-Type": "text/plain", "Content-Length": err.length});
            res.end(err);
            return;
        }
    });
});


// /list?format=csv     - format for game engine
// /list?format=html    - default (html) output
// /list?lang=en&detail=id
get("/list", function (req, res) {
    sys.puts("GET from " + req.connection.remoteAddress + " for " + req.url);

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

        // Pakset ID string split by space, first part used to collate them


        var get_times = function (date, aiv) {
            // Takes last report date and the announce interval and returns object containing information about times
            // last/lastu - How long ago was the last report (and units for the time quantity)
            // next/nextu - How long until the next report (and units)
            // odue/odueu - How long overdue is the next report (and units)

            var units = function (time) {
                // Return the best units for a time, ms, secs, mins, hours, days etc.
                // Input must be +ve

                if (time === 1) {
                    unit = "ms";
                } else if (time < 1000) {
                    unit = "mss";
                } else {
                    time = time / 1000;
                    if (time === 1) {
                        unit = "sec";
                    } else if (time < 60) {
                        unit = "secs";
                    } else {
                        time = time / 60;
                        if (time === 1) {
                            unit = "min";
                        } else if (time < 60) {
                            unit = "mins";
                        } else {
                            time = time / 60;
                            if (time === 1) {
                                unit = "hour";
                            } else if (time < 24) {
                                unit = "hours";
                            } else {
                                time = time / 24;
                                if (time === 1) {
                                    unit = "day";
                                } else {
                                    unit = "days";
                                }
                            }
                        }
                    }
                }
                return [time, unit];
            };

            var cdate = (new Date()).getTime();

            // Current minus last = ms since report
            var last, lastu;
            last  = units(cdate - date)[0];
            lastu = units(cdate - date)[1];

            // Difference between last date + interval and now
            var offset = date + aiv * 1000 - cdate;
            var next, nextu;
            var odue, odueu;

            if (offset > 0) {
                // Positive offset, not overdue
                next  = units(offset)[0];
                nextu = units(offset)[1];
            } else if (offset === 0) {
                // No offset, due now
                odue  = 1;
                odueu = "ms";
            } else {
                // Negative offset, overdue
                odue  = units(offset * -1)[0];
                odueu = units(offset * -1)[1];
            }

            return {last: last, lastu: lastu, next: next, nextu: nextu, odue: odue, odueu: odueu};
        };

        // TODO - optimise this to only attach timing info for the expanded entry

        var pakset_names = [];
        var paksets = {};
        for (var key in listing.model) {
            if (listing.model.hasOwnProperty(key)) {
                var new_item = listing.model[key];
                var pakstring = new_item["pak"].split(" ")[0];
                if (pakset_names.indexOf(pakstring) < 0) {
                    // Add new pakset name
                    pakset_names.push(pakstring);
                    paksets[pakstring] = [];
                }
                paksets[pakstring].push({detail: (key === qs["detail"]), data: new_item, timing: get_times(new_item["date"], new_item["aiv"])});
            }
        }
        // Map paksets into output format for mustache
        var paksets_mapped = [];
        for (var key in paksets) {
            paksets_mapped.push({name: key, items: paksets[key]});
        }

        // Return html formatted listing of servers
        res.write(mustache.to_html(templates["list.html"],
            {lang: qs["lang"], translate: translate, paksets: paksets_mapped}));

        res.write(mustache.to_html(templates["langselect.html"],
            {available_lang: make_lang(qs["lang"], urlbase), translate: translate}
        ));
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
                if (listing.model[key]["dns"] !== listing.vfields["dns"].default() &&
                    listing.model[key]["port"] !== listing.vfields["port"].default() &&
                    listing.model[key]["rev"] !== listing.vfields["rev"].default() &&
                    listing.model[key]["pak"] !== listing.vfields["pak"].default()) {
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

// Read model from file
listing.read();

// Set up monitor processes
status_monitor = setTimeout(status_check, STATUS_CHECK_INTERVAL*1000);
sync_monitor   = setTimeout(sync_check, SYNC_INTERVAL*1000);

listen(Number(process.env.PORT || PORT), HOST);







