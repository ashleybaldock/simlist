HOST = null;                            // Server listening IP (or null for all)
PORT = 8001;                            // Server listing port
ANNOUNCE_MULTIPLIER = 2;                // Number of server announce intervals before server marked offline
STATUS_CHECK_INTERVAL = 60;             // Interval between checks of server status
SYNC_FILE = "/var/simlist/listing";     // File to write out internal data model to
SYNC_INTERVAL = 30;                     // Sync internal data model to disk every XX seconds, default 30

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
    // Check the last report date of all listed servers against the current date with respect to their announce interval, any which haven't been heard from in ANNOUNCE_MULTIPLIER times the interval should be set to offline status
    var cdate = (new Date()).getTime();
    for (var key in listing.model) {
        if (listing.model.hasOwnProperty(key) && listing.model[key]["st"] > 0) {
            sys.puts("Checking server: " + key + " aiv: " + listing.model[key]["aiv"]);
            var expiredate = listing.model[key]["date"] + listing.model[key]["aiv"] * 1000 * ANNOUNCE_MULTIPLIER;
            sys.puts("cdate:      " + cdate + ", (" + cdate/1000 + ")");
            sys.puts("expiredate: " + expiredate + ", (" + expiredate/1000 + ")");
            sys.puts("difference: " + (cdate - expiredate));
            if (cdate > expiredate) {
                sys.puts("Setting server: " + key + " to offline");
                listing.model[key]["st"] = 0;
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
var av_type = ["std", "exp"];


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


var listing = {
    sync: false,

    // Access methods
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
            new_server[key] = this.internal_fields[key].default();
        }
        for (var key in this.valid_fields) {
            new_server[key] = this.valid_fields[key].default();
        }
        sys.puts("New server created, ID: " + new_server["id"]);
        // Add a new server to the listing
        this.model[new_server["id"]] = new_server;
        // Return ID of the new server
        return new_server["id"];
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
            // Check ID is valid (checks for duplicates as part of validate())
            if (this.internal_fields["id"].validate(parseInt(key)) &&
                testlist[key]["id"] &&
                this.internal_fields["id"].validate(testlist[key]["id"]) &&
                testlist[key]["id"] === parseInt(key)) {

                sys.puts("id: " + testlist[key]["id"] + " is valid");

                // Must be a DID field, must be valid (+ unique)
                if (testlist[key]["did"] &&
                    this.internal_fields["did"].validate(testlist[key]["did"])) {

                    sys.puts("did: " + testlist[key]["did"] + " is valid");

                    // Add to model
                    this.model[testlist[key]["id"]] = {"id": testlist[key]["id"],
                                                       "did": testlist[key]["did"]};
                    // Must be a date field, must be valid
                    if (testlist[key]["date"] && this.internal_fields["date"].validate(testlist[key]["date"])) {
                        this.model[testlist[key]["id"]]["date"] = testlist[key]["date"];
                    } else {
                        this.model[testlist[key]["id"]]["date"] = this.internal_fields["date"].default();
                    }
                    // Then check all in valid_fields, and use either value or default
                    for (var vkey in this.valid_fields) {
                        if (this.valid_fields.hasOwnProperty(vkey)) {
                            if (testlist[key].hasOwnProperty(vkey) && this.valid_fields[vkey].validate(testlist[key][vkey])) {
                                this.model[testlist[key]["id"]][vkey] = testlist[key][vkey];
                            } else {
                                // Use default
                                this.model[testlist[key]["id"]][vkey] = this.valid_fields[vkey].default();
                            }
                        }
                    }
                }
            }
        }
        // Only add valid fields to the active model by copying them over
    },

    filter: function (field, value, set) {
        // Return an array of server objects where the specified field equals the specified value
        // If set is provided then the search is done against that list of objects rather than the master one
    },

    update_datestamp: function (id) {
        // Set datestamp of specified ID to now()
        listing.internal_fields["date"].update(id);
        return true;
    },

    // Generic field update function used by simple fields (internal)
    update_field: function (id, field, value) {
        // First call parse method, which will take input as it comes in
        // over the wire and convert it into the correct representation
        sys.puts("update_field for: id: " + id + ", field: " + field + ", value: " + value);
        var parsedval = listing.valid_fields[field].parse(value);

        // Then check with the validate method, if this returns true it's safe
        // to go ahead and update the field
        if (listing.valid_fields[field].validate(parsedval)) {
            listing.model[id][field] = parsedval;
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


// Data representation
listing.model = {};

// Internal fields are valid but not settable remotely
// Each internal field record has the following methods:
//   default()  - return a default value
//   validate() - validate storage format of field
//   update()   - update the field
listing.internal_fields = {
    "id": {
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
        validate: function (value) {
            // Must be a number, must be > 1000000000 and < 9999999999
            return (typeof value === typeof 0 && value >= 1000000000 && value <= 9999999999 && !listing.lookup_id(value));
        },
        update: function (id, field, value) { return false; }   // Immutable
    },
    "did": {
        default: function () {
            while(1) {
                // Random number between 1048576 (0x100000) and 16777215 (0xFFFFFF)
                var did = (1048576 + Math.floor(Math.random()*15728639)).toString(16);
                // Check that it isn't already in use
                if (!listing.lookup_did(did)) {
                    return did;
                }
            }
        },
        validate: function (value) {
            return true;
        },
        update: function (id, field, value) { return false; }   // Immutable
    },
    "ip4": {
        default: function () { return ""; },
        validate: function (value) {
            return true;                // TODO IPv4 validation
        },
        update: listing.update_internal_field,
    },
    "ip6": {
        default: function () { return ""; },
        validate: function (value) {
            return true;                // TODO IPv4 validation
        },
        update: listing.update_internal_field,
    },
    "date": {
        default: function () { return 0; },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 0);
        },
        update: function (id) {
            listing.model[id]["date"] = (new Date()).getTime();
            listing.sync = true;
        },
    }
};

// Each field record has the following methods:
//   default()  - return a default value
//   validate() - validate storage format of field
//   update()   - update the field
//   parse()    - convert the "on-the-wire" data into the storage format
listing.valid_fields = {
    "st": {     // Status
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 0 && value < 2);
        },
        update: listing.update_field,
    },
    "aiv": {    // Announce interval (seconds)
        default: function () { return 900; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 30);
        },
        update: listing.update_field,
    },
    "type": {   // Server type
        default: function () { return "std"; },
        parse: function(rawvalue) { return rawvalue.toString(); },
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
        parse: function(rawvalue) { return rawvalue.toString(); },
        // Todo: validate should take a callback to execute on success
        // to permit async validation (e.g. dns lookups)
        validate: function (value, id, callback) {
            // TODO it should be an error condition if the dns name supplied does not
            // resolve to at least one v4/v6 address (indicates hostname is invalid)
            // Validate domain name/IP address here
            // TODO validity of this field should influence the server_valid internal field, which then influences display of servers/appearance in server listing
            if (checkipv6(value) || checkipv4(value) || checkdomain(value)) {
                if (callback === undefined) { return true; }
                sys.puts("dns running calback");
                callback(id, value);
            } else {
                // Invalid
                return false;
            }
        },
        update: function (id, field, value) {
            // TODO
            // Assume that ID has been checked
            return this.validate(value, id, function (id, value) {
                listing.model[id]["dns"] = value;
                if (checkipv6(value)) {
                    listing.update_internal_field(id, "ip4", "");
                    listing.update_internal_field(id, "ip6", value);
                } else if (checkipv4(value)) {
                    listing.update_internal_field(id, "ip4", value);
                    listing.update_internal_field(id, "ip6", "");
                } else {
                    dns.resolve6(value, function (err, addresses) {
                        // if (err) throw err;
                        if (!err && addresses.length > 0) {
                            // TODO - Handle multiple addresses better?
                            listing.update_internal_field(id, "ip6", addresses[0]);
                        } else {
                            listing.update_internal_field(id, "ip6", "");
                        }
                        dns.resolve4(value, function (err, addresses) {
                            // if (err) throw err;
                            if (!err && addresses.length > 0) {
                                // TODO - Handle multiple addresses better?
                                listing.update_internal_field(id, "ip4", addresses[0]);
                            } else {
                                listing.update_internal_field(id, "ip4", "");
                            }
                        });
                    });
                }
                // Update done
                listing.sync = true;
                return true;
            });
        },
    },
    "port": {
        default: function () { return 13353 },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value > 0 && value < 65536);
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
    "addurl": {
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
    "clients": {
        default: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue); },
        validate: function (value) {
            return (value !== NaN && typeof value === typeof 0 && value > 0 && value < 16);
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




// Dynamic URL handlers

// Redirect to /list
get("/", redirect_handler_perm("/list"));
get("/style.css", static_handler("style.css"));
get("/simlogo.png", static_handler("simlogo.png"));


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
        servertype_exp: "Simutrans Experimental",
        comments: "Comments:",
        clients: "Connected clients:",
        towns: "Towns:",
        citizens: "Citizens:",
        factories: "Factories:",
        convoys: "Vehicles:",
        stops: "Stops:",

        addform_explain: "To create a new Simutrans server record click \"Create\" below. This will generate a unique ID code for your server which you can use to configure automated status updates. You will also be able to manage some server details via this website. Upon submission of the form you will be redirected to the management page for the newly created server.",
        addform_header: "Add a server",
        addform_std: "Simutrans Standard",
        addform_exp: "Simutrans Experimental",
        addform_submit: "Create Server",

        selectform_header: "Select a Server",
        selectform_id: "ID of server",
        select_server_id: "Enter a Server ID to manage settings",
        select_server_id_error: "Sorry, the ID specified is not registered. Please enter a valid ID or select 'Add Server' to register a new one.",

        manageform_id_warn1: "This is your server ID:",
        manageform_id_warn2: "Please make a note of it as you will require this ID to manage server properties on this website. You will also need to use this ID in your game configuration to identify your instance of Simutrans to the listing server. I recommend that you bookmark this page to ensure you do not lose the ID number.",
        manageform_header: "Make changes to server settings",
        manageform_explain1: "This field will be updated automatically by the game.",
        manageform_explain2: "IP addresses are determined automatically from the server DNS/IP address field.",
        manageform_name: "Listing name",
        manageform_dns: "DNS name or IP address",
        manageform_ip4: "IPv4 address",
        manageform_ip6: "IPv6 address",
        manageform_port: "Server port",
        manageform_rev: "Simutrans version",
        manageform_pak: "Pakset details",
        manageform_email: "Manager email",
        manageform_pakurl: "Pakset URL",
        manageform_addurl: "Addons URL",
        manageform_infurl: "Info URL",
        manageform_comments: "Other comments",
        manageform_setoffline: "Set server offline",
        manageform_submit: "Submit changes",

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
                    listing.validate_field(qs["id"], key, qs[key]);
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
            {lang: qs["lang"], translate: translate, paksets: paksets}));

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

    res.writeHead(200, {"Content-Type": "text/html"});

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

    res.write(mustache.to_html(templates["langselect.html"],
        {available_lang: make_lang(qs["lang"], urlbase), translate: translate}
    ));
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
        listing.validate_field(newid, "type", qs["type"]);
        var newloc = "/manage?lang=" + qs["lang"] + "&id=" + newid;


        var msg = "Redirecting you to: " + newloc;
        res.writeHead(303, {"Location": newloc, "Content-Type": "text/html", "Content-Length": msg.length});
        res.end(msg);
    });
});


// GET -> form, POST -> submit form
// /manage?id=1234567890&lang=en&success=1
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

    res.write(mustache.to_html(templates["langselect.html"],
        {available_lang: make_lang(qs["lang"], urlbase), translate: translate}
    ));
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
                    listing.validate_field(qs["id"], key, qs[key]);
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

// Read model from file
listing.read();

// Set up monitor processes
status_monitor = setTimeout(status_check, STATUS_CHECK_INTERVAL*1000);
sync_monitor   = setTimeout(sync_check, SYNC_INTERVAL*1000);

listen(Number(process.env.PORT || PORT), HOST);







