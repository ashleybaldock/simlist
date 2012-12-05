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

/*jslint node: true, white: true, maxerr: 500, indent: 4 */


// TODO
// Service monitoring
// Global error handling
// Translation support
// Final fixes for CSS/layout
// init.d script
// Logging to syslog, and from there to rotated file


// Declare globals
var listing,
    http,
    fs,
    sys,
    url,
    dns,
    querystring,
    path,
    rawconfig,
    mustache,
    av_lang,
    av_formats,
    starttime,
    mem,
    status_monitor,     // timeoutId for the status checks
    status_check,
    sync_monitor,       // timeoutId for db file sync
    sync_to_disk,
    sync_check,
    templatefiles,
    templates,
    n,
    not_found,
    internal_error,
    map_get,
    get,
    map_post,
    post,
    handle_req,
    server,
    server4,
    start_server,       // Function which starts a server for each listen address
    stop_server,        // Function which stops all running servers and exits
    checkipv6,
    checkipv4,
    checkdomain,
    checkemail,
    redirect_handler_perm,
    static_handler,
    make_lang,
    timeformat,
    translate,
    arguments
    ;
    


// Load in basic node.js functionality
http        = require("http");
fs          = require("fs");
sys         = require("sys");
url         = require("url");
dns         = require("dns");
querystring = require("querystring");
path        = require("path");


// Set working directory to location of script file
// Second argument of argv is the script location
process.chdir(path.dirname(process.argv[1]));


// Configuration
// Read from config file config.json in same directory
// Read from config file specified on command line with -c
// LISTEN = ["2001:470:9034::3", "82.113.155.82"];
/*
 * host                     DNS name of server (for display purposes)
 * listen                   String, IPv6 address to listen for connections on
 * listen4                  String, IPv4 address to listen for connections on
 * port                     Int, port to listen for connections on
 * offline_multiplier       Int, multipied by server's announce interval to get inactivity time
 * prune_interval           Int, seconds of inactivity before servers are removed
 * status_check_interval    Int, seconds between checking of server status
 * sync_file                String, abs path to location for sync file
 * mustache                 String, abs path to mustache.js
 * sync_interval            Int, seconds between syncs of file to disk
 * debug                    Bool, enable debugging
 * process_user             String, User to setuid to
 * max_connections          Number, max connections to one listen IP
 */

rawconfig = fs.readFileSync("config.json");
if (rawconfig.length > 0) {
    // Pass file contents through JSON
    // TODO: Better validation of configuration data + error if invalid
    var config = JSON.parse(rawconfig);
} else {
    // Invalid config file
    console.log("ERROR: Invalid config file!");
    process.exit(1);
}


// Validate all properties using their validator functions to ensure loaded data isn't corrupt
this.model = {};

// Internals

// Load in mustache
mustache    = require("mustache");

// Set up available languages/formats
av_lang     = ["en"];
av_formats  = ["html", "csv"];

starttime   = (new Date()).getTime();

mem = process.memoryUsage();
setInterval(function () {
    "use strict";
    mem = process.memoryUsage();
}, 10 * 1000);


// Monitors - execute housekeeping tasks at regular intervals

status_check = function () {
    "use strict";
    var cdate, key, prunedate, expiredate;
    console.log("Checking server statuses");
    // Check the last report date of all listed servers against the current date with respect to their announce interval
    // any which haven't been heard from in config.offline_multiplier times the interval should be set to offline status
    // Also check the last report date against the current date with respect to the config.prune_interval
    // any not heard from in this interval should be removed entirely
    cdate = (new Date()).getTime();
    for (key in listing.model) {
        if (listing.model.hasOwnProperty(key)) {
            console.log("Checking server: " + key + " aiv: " + listing.model[key].aiv);
            // Check for prune interval
            prunedate = listing.model[key].date + config.prune_interval * 1000;
            console.log("prunedate: " + prunedate + ", (" + prunedate/1000 + ")");
            console.log("difference: " + (cdate - prunedate));
            if (cdate > prunedate) {
                console.log("Removing server: " + key);
                delete listing.model[key];
                listing.sync = true;
            } else {
                // Check for offline interval
                expiredate = listing.model[key].date + listing.model[key].aiv * 1000 * config.offline_multiplier;
                console.log("cdate:      " + cdate + ", (" + cdate/1000 + ")");
                console.log("expiredate: " + expiredate + ", (" + expiredate/1000 + ")");
                console.log("difference: " + (cdate - expiredate));
                if (cdate > expiredate) {
                    console.log("Setting server: " + key + " to offline");
                    listing.model[key].st = 0;
                    listing.sync = true;
                }
            }
        }
    }
    status_monitor = setTimeout(status_check, config.status_check_interval*1000);
};


sync_to_disk = function () {
    "use strict";
    // Synchronous write to disk
    if (listing.sync) {
        var output = JSON.stringify(listing.model);
        fs.writeFileSync(config.sync_file, output);
        listing.sync = false;
        console.log("Synchronous write to file complete");
    }
};
sync_check = function () {
    "use strict";
    console.log("Checking sync status");
    // Check value of listing.sync, if true we should sync the current state of the listing to file (JSON.stringify) and set listing.sync to false
    if (listing.sync) {
        listing.sync = false;
        var output = JSON.stringify(listing.model);
        fs.writeFile(config.sync_file, output, function (err) {
            if (err) {
                console.error("Warning: Unable to sync model to file!");
                listing.sync = true;
                // throw err;
            } else {
                console.log("Sync complete");
            }
            // Schedule next check
            sync_monitor = setTimeout(sync_check, config.sync_interval*1000);
        });
    } else {
        // Schedule next check
        sync_monitor = setTimeout(sync_check, config.sync_interval*1000);
    }
};


// Templates

templatefiles = [
    "header.html",
    "footer.html",
    "announce.html",
    "langselect.html",
    "list.html"
];
templates = {};

for (n in templatefiles) {
    if (templatefiles.hasOwnProperty(n)) {
        console.log("loading file: " + templatefiles[n] + "...");
        templates[templatefiles[n]] = fs.readFileSync(templatefiles[n], "utf8");
    }
}

// Any file which there isn't a handler for should get a proper 404 error
not_found = function(req, res) {
    "use strict";
    var NOT_FOUND = "Not Found\n";
    res.writeHead(404, {"Content-Type": "text/plain", "Content-Length": NOT_FOUND.length});
    res.end(NOT_FOUND);
};

// Server errors should produce a generic 500 error
internal_error = function(req, res) {
    "use strict";
    var ERROR = "Internal Server Error\n";
    res.writeHead(500, {"Content-Type": "text/plain", "Content-Length": ERROR.length});
    res.end(ERROR);
};

// Maps containing paths and handlers (maybe same path for GET+POST with different actions)
map_get = {};
get = function (path, handler) {
    "use strict";
    map_get[path] = handler;
};

map_post = {};
post = function (path, handler) {
    "use strict";
    map_post[path] = handler;
};

handle_req = function (req, res) {
    "use strict";
    var handler;
    if (req.method === "GET" || req.method === "HEAD") {
        handler = map_get[url.parse(req.url).pathname] || not_found;

        handler(req, res);
    } else if (req.method === "POST") {
        handler = map_post[url.parse(req.url).pathname] || not_found;

        handler(req, res);
    }
};

// Two servers for IPv6 and IPv4
server = http.createServer(handle_req);
server4 = http.createServer(handle_req);

server.maxConnections = 0;
server4.maxConnections = 0;

// TODO - permit arbitrary number of listen directives
start_server = function () {
    "use strict";
    var drop_count, drop_privs;
    drop_count = 0;
    drop_privs = function () {
        // Only do this once all connections bound
        // So only does anything on the second call (or however many addresses we have)
        drop_count += 1;
        if (drop_count === 2) {
            if (config.process_user) {
                try {
                    process.setuid(config.process_user);
                    console.log("Dropped privileges and now running as user: " + config.process_user);
                }
                catch (err) {
                    console.log("Error: Failed to drop privileges, aborting execution!");
                    process.exit(1);
                }
            }
            server.maxConnections = config.max_connections;
            server4.maxConnections = config.max_connections;

        }
    };
    // Start server(s)
    if (server) {
        server.listen(config.port, config.listen, function () {
            console.log("Server at http://[" + config.listen + "]:" + config.port.toString() + "/");
            drop_privs();
        });
    }
    if (server4) {
        server4.listen(config.port, config.listen4, function () {
            console.log("Server at http://" + config.listen4 + ":" + config.port.toString() + "/");
            drop_privs();
        });
    }

    // Lock pidfile
    fs.writeFileSync(config.pidfile, process.pid);
};


stop_server = function () {
    "use strict";
    console.log("Stopping server...");
    if (server) {
        server.close();
    }
    if (server4) {
        server4.close();
    }

    // Write out working model
    sync_to_disk();

    process.exit(0);
};

process.on("SIGINT", stop_server);


// do the work of checking the string
checkipv6 = function (str) {
    "use strict";
    // From http://intermapper.com/support/tools/IPV6-Validator.aspx
    return (/^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/.test(str));
};
checkipv4 = function (str) {
    "use strict";
    // From http://www.regular-expressions.info/examples.html
    return (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(str));
};
checkdomain = function (str) {
    "use strict";
    // From http://www.mczen.com/blog/post/viewitemaspxid3deed1cc4f-92a4-4485-85b2-21356a3d18e0.aspx
    return (/^([a-zA-Z0-9]([-a-zA-Z0-9]+)?\.)+([a-zA-Z]{2,7}\.?)$/.test(str));
};
checkemail = function (str) {
    "use strict";
    // From http://www.regular-expressions.info/email.html
    return (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,6}$/i.test(str));
};



// New ID format is dns:port, e.g. entropy.me.uk:13353 or 2001:98b::33:13357
// Unique by this identifier


listing = {
    // Set to true whenever any data changes to inform sync_monitor that a write to disk is needed
    sync: false,

    // Access methods
    lookup: function (lookupid) {
        "use strict";
        var id;
        // Lookup the record with the specified ID, return false if record not found
        for (id in this.model) {
            if (this.model.hasOwnProperty(id) && id === lookupid) {
                return this.model[lookupid];
            }
        }
        return false;
    },

    makenew: function (newid, newdns, newport) {
        "use strict";
        var new_server, key;
        new_server = {};
        // Add to listing + write out listing file
        for (key in this.ifields) {
            new_server[key] = this.ifields[key].mydefault();
        }
        // Set port + dns
        new_server.dns = newdns;
        new_server.port = newport;

        for (key in this.vfields) {
            new_server[key] = this.vfields[key].mydefault();
        }
        console.log("New server created, ID: " + newid);
        // Add a new server to the listing
        this.model[newid] = new_server;
        // Return true if added successfully
        return true;
    },

    read: function () {
        "use strict";
        var input, testlist, key, vkey, newid;
        // Read listings in from file (load) (synchronous)
        input = fs.readFileSync(config.sync_file);
        if (input.length > 0) {
            // Pass file contents through JSON
            testlist = JSON.parse(input);
        } else {
            testlist = {};
        }
        // Validate all properties using their validator functions to ensure loaded data isn't corrupt
        this.model = {};

        console.log("this.model: " + JSON.stringify(this.model));
        console.log("testlist: " + JSON.stringify(testlist));

        // For each ID record
        for (key in testlist) {
            console.log("key: " + key);

            // Rebuild keys from the DNS and port fields of each record, if these fields are missing then it is an invalid record

            if (testlist[key].port && this.ifields.port.validate(testlist[key].port)) {
                if (testlist[key].dns && this.ifields.dns.validate(testlist[key].dns)) {
                    newid = testlist[key].dns + ":" + testlist[key].port;
                    if (listing.makenew(newid, testlist[key].dns, testlist[key].port)) {
                        // Must be a date field, must be valid
                        if (testlist[key].date && this.ifields.date.validate(testlist[key].date)) {
                            this.model[newid].date = testlist[key].date;
                        }
                        // Then check all in vfields, and update values if valid
                        for (vkey in this.vfields) {
                            if (this.vfields.hasOwnProperty(vkey)) {
                                if (testlist[key].hasOwnProperty(vkey) && this.vfields[vkey].validate(testlist[key][vkey])) {
                                    this.model[newid][vkey] = testlist[key][vkey];
                                }
                            }
                        }
                    } else {
                        console.error("Failed to add item with ID: " + newid + " - not unique!");
                    }
                } else {
                    console.error("Failed to add item with ID: " + newid + " - failed to validate dns!");
                }
            } else {
                console.error("Failed to add item with ID: " + newid + " - failed to validate port!");
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
        "use strict";
        // Set datestamp of specified ID to now()
        listing.ifields.date.update(id);
        return true;
    },

    // Generic field update function used by simple fields (internal)
    update_field: function (id, field, value) {
        "use strict";
        // First call parse method, which will take input as it comes in
        // over the wire and convert it into the correct representation
        console.log("update_field for: id: " + id + ", field: " + field + ", value: " + value);
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
        "use strict";
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
//   mydefault()  - return a default value
//   validate() - validate storage format of field
//   update()   - update the field
listing.ifields = {
    "dns": {
        mydefault: function () {
            "use strict";
            return "";
        },
        parse: function(rawvalue) {
            "use strict";
            return rawvalue.toString();
        },
        // Todo: validate should take a callback to execute on success
        // to permit async validation (e.g. dns lookups)
        validate: function (value, reqip, success, failure) {
            "use strict";
            // Setup dummy functions (for validate without callbacks)
            if (typeof success !== "function") {
                console.log("dns.validate - override success()");
                success = function () { return true; };
            }
            if (typeof failure !== "function") {
                console.log("dns.validate - override failure()");
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
                    console.log("dns.validate - success (matched IPv6 address)");
                    return success();
                } else {
                    console.error("dns.validate - failure (valid IPv6 but does not match request IP");
                    return failure();
                }
            }

            if (checkipv4(value)) {
                if (value === reqip) {
                    // Exactly one IPv4 address which matches the reqip
                    console.log("dns.validate - success (matched IPv4 address)");
                    return success();
                } else {
                    console.error("dns.validate - failure (valid IPv4 but does not match request IP");
                    return failure();
                }
            }

            if (checkdomain(value)) {
                if (value === reqip) {
                    // This will only occur when reqip was originally undefined
                    // i.e. when DNS validation is not needed (loading from disk)
                    console.log("dns.validate - success (matched DNS name without lookup)");
                    return success();
                }
                // Try resolving IPv6 first (AAAA records)
                dns.resolve6(value, function (err, addresses) {
                    // if (err) throw err;
                    if (!err && addresses.length > 0) {
                        // Got at least one v6 address, compare them against reqip
                        var found = false;
                        addresses.forEach(function (element, index, array) {
                            if (element === reqip) {
                                found = true;
                                console.log("dns.validate - success (matched IPv6 address from DNS)");
                            }
                        });
                        if (found) {
                            return success();
                        }
                    }
                    // No v6 addresses or none of them matches, try v4
                    dns.resolve4(value, function (err, addresses) {
                        // if (err) throw err;
                        if (!err && addresses.length > 0) {
                            // Got at least one v4 address, compare them against reqip
                            var found = false;
                            addresses.forEach(function (element, index, array) {
                                if (element === reqip) {
                                    console.log("dns.validate - success (matched IPv4 address from DNS)");
                                    found = true;
                                }
                            });
                            if (found) {
                                return success();
                            }
                        }
                        // If we've got here then no addresses match, invoke failure
                        console.error("dns.validate - failure (no matching IPv4 or IPv6 addresses in DNS)");
                        return failure();
                    });
                });
            } else {
                // Invalid dns name, no further options -> failure
                console.error("dns.validate - failure (Invalid domain name)");
                return failure();
            }
        },
        update: function () {
            "use strict";
            return false;   // Immutable
        }
    },
    "port": {
        mydefault: function () {
            "use strict";
            return 13353;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && !isNaN(value) && value > 0 && value <= 65535);
        },
        update: function () {
            "use strict";
            return false;   // Immutable
        }
    },
    "date": {
        mydefault: function () {
            "use strict";
            return 0;
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && value >= 0);
        },
        update: function (id) {
            "use strict";
            listing.model[id].date = (new Date()).getTime();
            listing.sync = true;
        }
    }
};

// Each field record has the following methods:
//   mydefault()  - return a default value
//   validate() - validate storage format of field
//   update()   - update the field
//   parse()    - convert the "on-the-wire" data into the storage format
listing.vfields = {
    "st": {     // Status
        mydefault: function () {
            "use strict";
            return 0;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && value >= 0 && value < 2);
        },
        update: listing.update_field
    },
    "aiv": {
        // Announce interval (seconds)
        mydefault: function () {
            "use strict";
            return 900;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && value >= 30);
        },
        update: listing.update_field
    },
    // Server game revision, numeric
    "rev": {
        mydefault: function () {
            "use strict";
            return "";
        },
        parse: function(rawvalue) {
            "use strict";
            return rawvalue.toString();
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof "str" && value.length < 100);
        },
        update: listing.update_field
    },
    // Server game verbose version information
    "ver": {
        mydefault: function () {
            "use strict";
            return "";
        },
        parse: function(rawvalue) {
            "use strict";
            return rawvalue.toString();
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof "str" && value.length < 100);
        },
        update: listing.update_field
    },
    "pak": {
        mydefault: function () {
            "use strict";
            return "";
        },
        parse: function(rawvalue) {
            "use strict";
            return rawvalue.toString();
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof "str" && value.length < 100);
        },
        update: listing.update_field
    },
    "name": {
        mydefault: function () {
            "use strict";
            return "";
        },
        parse: function(rawvalue) {
            "use strict";
            return rawvalue.toString();
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof "str" && value.length < 200);
        },
        update: listing.update_field
    },
    "email": {
        mydefault: function () {
            "use strict";
            return "";
        },
        parse: function(rawvalue) {
            "use strict";
            return rawvalue.toString();
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof "str" && checkemail(value));
        },
        update: listing.update_field
    },
    "pakurl": {
        mydefault: function () {
            "use strict";
            return "";
        },
        parse: function(rawvalue) {
            "use strict";
            return rawvalue.toString();
        },
        validate: function (value) {
            "use strict";
            return true;                        // TODO (url)
        },
        update: listing.update_field
    },
    "infurl": {
        mydefault: function () {
            "use strict";
            return "";
        },
        parse: function(rawvalue) {
            "use strict";
            return rawvalue.toString();
        },
        validate: function (value) {
            "use strict";
            return true;                        // TODO (url)
        },
        update: listing.update_field
    },
    "comments": {
        mydefault: function () {
            "use strict";
            return "";
        },
        parse: function(rawvalue) {
            "use strict";
            return rawvalue.toString();
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof "str" && value.length < 2000);
        },
        update: listing.update_field
    },
    "time": {
        // Current date of the server game
        mydefault: function () {
            "use strict";
            return {"yr": 1, "mn": 0};
        },
        parse: function(rawvalue) {
            "use strict";
            // Split by "," and store in dict with two fields
            return {"mn": parseInt(rawvalue.toString().split(",")[0], 10),
                    "yr": parseInt(rawvalue.toString().split(",")[1], 10)};
        },
        validate: function (value) {
            "use strict";
            console.log(JSON.stringify(value));
            if (typeof value === typeof {}) {
                if (value.hasOwnProperty("yr") && typeof value.yr === typeof 0 && value.yr > 0) {
                    if (value.hasOwnProperty("mn") && typeof value.mn === typeof 0 && value.mn >= 0 && value.mn < 12) {
                        return true;
                    }
                }
            }
            return false;
        },
        update: listing.update_field
    },
    "start": {
        // Starting date of the server game
        mydefault: function () {
            "use strict";
            return {"yr": 1, "mn": 0};
        },
        parse: function(rawvalue) {
            "use strict";
            // Split by "," and store in dict with two fields
            return {"mn": parseInt(rawvalue.toString().split(",")[0], 10),
                    "yr": parseInt(rawvalue.toString().split(",")[1], 10)};
        },
        validate: function (value) {
            "use strict";
            console.log(JSON.stringify(value));
            if (typeof value === typeof {}) {
                if (value.hasOwnProperty("yr") && typeof value.yr === typeof 0 && value.yr > 0) {
                    if (value.hasOwnProperty("mn") && typeof value.mn === typeof 0 && value.mn >= 0 && value.mn < 12) {
                        return true;
                    }
                }
            }
            return false;
        },
        update: listing.update_field
    },
    "size": {
        mydefault: function () {
            "use strict";
            return {"x": 0, "y": 0};
        },
        parse: function(rawvalue) {
            "use strict";
            // Split by "," and store in dict with two fields
            return {"x": parseInt(rawvalue.toString().split(",")[0], 10),
                    "y": parseInt(rawvalue.toString().split(",")[1], 10)};
        },
        validate: function (value) {
            "use strict";
            console.log(JSON.stringify(value));
            if (typeof value === typeof {}) {
                if (value.hasOwnProperty("x") && typeof value.x === typeof 0 && value.x > 0) {
                    if (value.hasOwnProperty("y") && typeof value.y === typeof 0 && value.y > 0) {
                        return true;
                    }
                }
            }
            return false;
        },
        update: listing.update_field
    },
    "active": {
        // number of active players
        mydefault: function () {
            "use strict";
            return 0;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && !isNaN(value) && value >= 0 && value < 16);
        },
        update: listing.update_field
    },
    "locked": {
        // number of locked players
        mydefault: function () {
            "use strict";
            return 0;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && !isNaN(value) && value >= 0 && value < 16);
        },
        update: listing.update_field
    },
    "clients": {
        mydefault: function () {
            "use strict";
            return 0;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && !isNaN(value) && value >= 0 && value < 16);
        },
        update: listing.update_field
    },
    "towns": {
        mydefault: function () {
            "use strict";
            return 0;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        },
        update: listing.update_field
    },
    "citizens": {
        mydefault: function () {
            "use strict";
            return 0;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        },
        update: listing.update_field
    },
    "factories": {
        mydefault: function () {
            "use strict";
            return 0;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        },
        update: listing.update_field
    },
    "convoys": {
        mydefault: function () {
            "use strict";
            return 0;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        },
        update: listing.update_field
    },
    "stops": {
        mydefault: function () {
            "use strict";
            return 0;
        },
        parse: function(rawvalue) {
            "use strict";
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            "use strict";
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        },
        update: listing.update_field
    }
};





redirect_handler_perm = function (filename) {
    "use strict";
    var msg, headers;

    msg = "Redirecting you to: <a href=\"" + filename + "\">" + filename + "</a>";
    headers = {"Location": filename,
        "Content-Type": "text/html",
        "Content-Length": msg.length};

    return function (req, res) {
        res.writeHead(301, headers);
        res.end(msg);
    };
};

static_handler = function (filename) {
    "use strict";
    var mimelookup, extname, mimetypes, body, headers, content_type,
        load_response_data;

    // returns MIME type for extension, or fallback, or octet-steam
    mimelookup = function(ext, fallback) {
        return mimetypes[ext.toLowerCase()] || fallback || "application/octet-stream";
    };

    extname = function (path) {
        var index = path.lastIndexOf(".");
        return index < 0 ? "" : path.substring(index);
    };

    // List of mime-types we are likely to use
    mimetypes = {
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

    content_type = mimelookup(extname(filename));

    load_response_data = function (callback) {
        if (body && headers && !config.debug) {
            callback();
            return;
        }

        console.log("GET " + filename);
        fs.readFile(filename, function (err, data) {
            if (err) {
                console.error("Error loading " + filename);
            } else {
                body = data;
                headers = {"Content-Type": content_type, "Content-Length": body.length};
                if (!config.debug) {
                    headers["Cache-Control"] = "public";
                }
                callback();
            }
        });
    };

    return function (req, res) {
        load_response_data(function () {
            res.writeHead(200, headers);
            res.end(req.method === "HEAD" ? "" : body);
        });
    };
};




// URL handlers

// Redirect to /list
get("/", redirect_handler_perm("/list"));

get("/style.css", static_handler("style.css"));
get("/simlogo.png", static_handler("simlogo.png"));
get("/demomap.png", static_handler("demomap.png"));


// Map available languages into object for formatting page template
// TODO do this once on server startup for all languages and then just select one
make_lang = function (current, baseurl) {
    "use strict";
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
    for (n in av_lang) {
        ret.push({name: av_lang[n], cur: cur(av_lang[n]), url: make_url(av_lang[n])});
    }
    return ret;
};

timeformat = function () {
    "use strict";
    // Format a time in nice human-readable way
    // Takes a time in ms and returns:
    // AA day(s), BB hour(s), CC minute(s), DD second(s), EE millisecond(s)
    return function(text, render) {
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
};

// TODO load in translations from file on startup
translate = function () {
    "use strict";
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




// /announce
get("/announce", function (req, res) {
    "use strict";
    // Return warning that this url must be POSTed to + link to /list
    console.log("GET " + req.url);
    res.writeHead(405, {"Content-Type": "text/html", "Allow": "POST"});
    res.write(mustache.to_html(templates["announce.html"], {}));
    res.end();
});
post("/announce", function (req, res) {
    "use strict";
    var body="";

    console.log("POST from " + req.connection.remoteAddress + " to " + req.url);

    req.on("data", function (data) {
        console.log("POST from " + req.connection.remoteAddress + ", received data: " + data);
        body += data;
    });
    req.on("end", function () {
        console.log("POST from " + req.connection.remoteAddress + ", done receiving data");
        var qs, err;
        qs = querystring.parse(body);
        // process defaults

        // ID formed of dns and port fields, these must be present + valid
        if (qs.port && listing.ifields.port.validate(listing.ifields.port.parse(qs.port))) {
            
            // Valid port field
            if (qs.dns) {
                listing.ifields.dns.validate(listing.ifields.dns.parse(qs.dns),
                    req.connection.remoteAddress,
                    function () {
                        var id, key;
                        // Success callback

                        id = qs.dns + ":" + qs.port;

                        if (!listing.lookup(id)) {
                            listing.makenew(id, listing.ifields.dns.parse(qs.dns), listing.ifields.port.parse(qs.port));
                        }

                        for (key in qs)
                        {
                            if (qs.hasOwnProperty(key)) {
                                console.log("post data - " + key + ": " + qs[key]);
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
                        var err = "Bad Request - DNS field invalid";
                        console.error(err);
                        res.writeHead(400, {"Content-Type": "text/plain", "Content-Length": err.length});
                        res.end(err);
                        return;
                    });
            } else {
                // Failure callback
                // Invalid ID, return Bad Request error
                err = "Bad Request - Missing DNS field";
                console.error(err);
                res.writeHead(400, {"Content-Type": "text/plain", "Content-Length": err.length});
                res.end(err);
                return;
            }
        } else {
            // Invalid ID, return Bad Request error
            err = "Bad Request - Missing port field or value invalid";
            console.error(err);
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
    "use strict";
    var qs, urlbase, get_times, pakset_names, paksets, paksets_mapped,
        key, new_item, pakstring, csve, response_text,
        err;
    console.log("GET from " + req.connection.remoteAddress + " for " + req.url);

    // Possible values are: lang, detail
    qs = url.parse(req.url, true).query;
    // Process defaults
    if (!qs.lang || av_lang.indexOf(qs.lang) < 0) {
        console.log("No language specified, defaulting to English");
        qs.lang = "en";
    }
    if (!qs.format) {
        console.log("No format specified, defaulting to HTML");
        qs.format = "html";
    }

    if (qs.format === "html") {
        res.writeHead(200, {"Content-Type": "text/html"});

        // Write header
        res.write(mustache.to_html(templates["header.html"],
            {title: config.host + " - Server listing", lang: qs.lang, translate: translate}));

        // Write language selector
        urlbase = "./list";
        if (qs.detail) {
            urlbase = urlbase + "?detail=" + qs.detail;
        }
        res.write(mustache.to_html(templates["langselect.html"],
            {available_lang: make_lang(qs.lang, urlbase), translate: translate}
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
                paksets[pakstring].push({detail: (key === qs.detail), data: new_item, timing: get_times(new_item.date, new_item.aiv)});
            }
        }
        // Map paksets into output format for mustache
        paksets_mapped = [];
        for (key in paksets) {
            paksets_mapped.push({name: key, items: paksets[key]});
        }

        // Return html formatted listing of servers
        res.write(mustache.to_html(templates["list.html"],
            {lang: qs.lang, translate: translate, timeformat: timeformat,
             paksets: paksets_mapped}));

        res.write(mustache.to_html(templates["langselect.html"],
            {available_lang: make_lang(qs.lang, urlbase), translate: translate}
        ));
        // Write the footer and close the request
        res.write(mustache.to_html(templates["footer.html"], {}));
        res.end();

    } else if (qs.format === "csv") {
        csve = function (text) {
            // Prepare value for entry into CSV file
            // If it contains a comma, quote it, if it contains quotes encode them
            while (text.indexOf("\"") !== -1) {
                text = text.replace("\"", "");
            }
            if (text.indexOf(",") !== -1) {
                text = "\"" + text + "\"";
            }
            return text;
        };

        response_text = "";

        // Format output as CSV, any string containing a comma should be quoted
        // Due to validation of input to fields, no need to validate output of the same
        // However only servers where all values differ from defaults should be output

        // TODO without a name field upload the dns/port field in its place
        // TODO without a rev or pak field, upload entry or not?

        for (key in listing.model) {
            if (listing.model.hasOwnProperty(key)) {
                if (listing.model[key].dns && listing.model[key].port && listing.model[key].name && listing.model[key].rev && listing.model[key].pak) {
                    response_text = response_text + csve(listing.model[key].name) + "," + csve(listing.model[key].dns + ":" + listing.model[key].port) + "," + csve(listing.model[key].rev.toString()) + "," + csve(listing.model[key].pak) + "," + csve(listing.model[key].st.toString()) + "\n";
                }
            }
        }

        res.writeHead(200, {"Content-Type": "text/plain", "Content-Length": response_text.length});

        res.end(response_text);
    } else {
        // 501 error
        err = "501 Not Implemented - The specified output format is not supported, supported formats are: " + av_formats.toString();
        res.writeHead(501, {"Content-Type": "text/html", "Content-Length": err.length});
        res.end(err);
    }
});



// Read model from file
listing.read();

// Set up monitor processes
status_monitor = setTimeout(status_check, config.status_check_interval*1000);
sync_monitor   = setTimeout(sync_check, config.sync_interval*1000);


// TODO Read pid from pidfile, check to see if pid it contains exists and is a simlist process
// If so refuse to start up
start_server();


