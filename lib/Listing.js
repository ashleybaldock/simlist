exports.Listing = function Listing () {
    // Set to true whenever any data changes to inform sync_monitor that a write to disk is needed
    this.sync = false;
    this.model = {};
    this.date = 0;
}

exports.Listing.prototype.lookup = function (lookupid) {
    var id;
    // Lookup the record with the specified ID, return false if record not found
    for (id in this.model) {
        if (this.model.hasOwnProperty(id) && id === lookupid) {
            return this.model[lookupid];
        }
    }
    return false;
};

exports.Listing.prototype.makenew = function (newid, newdns, newport) {
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
};

exports.Listing.prototype.read = function () {
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
};

exports.Listing.prototype.update_datestamp = function (id) {
    // Set datestamp of specified ID to now()
    this.model[id].date = (new Date()).getTime();
    this.sync = true;
    return true;
};

exports.Listing.prototype.update_field = function (id, field, value) {
    // First call parse method, which will take input as it comes in
    // over the wire and convert it into the correct representation
    console.log("update_field for: id: " + id + ", field: " + field + ", value: " + value);
    if (this.lookup(id) && this.vfields.hasOwnProperty(field)) {
        var parsedval = this.vfields[field].parse(value);

        // Then check with the validate method, if this returns true it's safe
        // to go ahead and update the field
        if (this.vfields[field].validate(parsedval)) {
            this.model[id][field] = parsedval;
            this.sync = true;
            return true;
        }
    }
    return false;
};

// Internal fields are valid but not settable remotely
// Each internal field record has the following methods:
//   mydefault()  - return a default value
//   validate() - validate storage format of field
exports.Listing.prototype.ifields = {
    "dns": {
        mydefault: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value, reqip, success, failure) {
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
        }
    },
    "port": {
        mydefault: function () { return 13353; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0 && value <= 65535);
        }
    },
    "date": {
        mydefault: function () { return 0; },
        validate: function (value) { return (typeof value === typeof 0 && value >= 0); }
    }
};

// Each field record has the following methods:
//   mydefault()  - return a default value
//   validate() - validate storage format of field
//   parse()    - convert the "on-the-wire" data into the storage format
exports.Listing.prototype.vfields = {
    "st": {     // Status
        mydefault: function () {
            return 0;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 0 && value < 2);
        }
    },
    "aiv": {
        // Announce interval (seconds)
        mydefault: function () {
            return 900;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 30);
        }
    },
    // Server game revision, numeric
    "rev": {
        mydefault: function () {
            return "";
        },
        parse: function(rawvalue) {
            return rawvalue.toString();
        },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 100);
        }
    },
    // Server game verbose version information
    "ver": {
        mydefault: function () {
            return "";
        },
        parse: function(rawvalue) {
            return rawvalue.toString();
        },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 100);
        }
    },
    "pak": {
        mydefault: function () {
            return "";
        },
        parse: function(rawvalue) {
            return rawvalue.toString();
        },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 100);
        }
    },
    "name": {
        mydefault: function () {
            return "";
        },
        parse: function(rawvalue) {
            return rawvalue.toString();
        },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 200);
        }
    },
    "email": {
        mydefault: function () {
            return "";
        },
        parse: function(rawvalue) {
            return rawvalue.toString();
        },
        validate: function (value) {
            // From http://www.regular-expressions.info/email.html
            return (typeof value === typeof "str" && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,6}$/i.test(value));
        }
    },
    "pakurl": {
        mydefault: function () {
            return "";
        },
        parse: function(rawvalue) {
            return rawvalue.toString();
        },
        validate: function (value) {
            return true;                        // TODO (url)
        }
    },
    "infurl": {
        mydefault: function () {
            return "";
        },
        parse: function(rawvalue) {
            return rawvalue.toString();
        },
        validate: function (value) {
            return true;                        // TODO (url)
        }
    },
    "comments": {
        mydefault: function () {
            return "";
        },
        parse: function(rawvalue) {
            return rawvalue.toString();
        },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 2000);
        }
    },
    "time": {
        // Current date of the server game
        mydefault: function () {
            return {"yr": 1, "mn": 0};
        },
        parse: function(rawvalue) {
            // Split by "," and store in dict with two fields
            return {"mn": parseInt(rawvalue.toString().split(",")[0], 10),
                    "yr": parseInt(rawvalue.toString().split(",")[1], 10)};
        },
        validate: function (value) {
            console.log(JSON.stringify(value));
            if (typeof value === typeof {}) {
                if (value.hasOwnProperty("yr") && typeof value.yr === typeof 0 && value.yr > 0) {
                    if (value.hasOwnProperty("mn") && typeof value.mn === typeof 0 && value.mn >= 0 && value.mn < 12) {
                        return true;
                    }
                }
            }
            return false;
        }
    },
    "start": {
        // Starting date of the server game
        mydefault: function () {
            return {"yr": 1, "mn": 0};
        },
        parse: function(rawvalue) {
            // Split by "," and store in dict with two fields
            return {"mn": parseInt(rawvalue.toString().split(",")[0], 10),
                    "yr": parseInt(rawvalue.toString().split(",")[1], 10)};
        },
        validate: function (value) {
            console.log(JSON.stringify(value));
            if (typeof value === typeof {}) {
                if (value.hasOwnProperty("yr") && typeof value.yr === typeof 0 && value.yr > 0) {
                    if (value.hasOwnProperty("mn") && typeof value.mn === typeof 0 && value.mn >= 0 && value.mn < 12) {
                        return true;
                    }
                }
            }
            return false;
        }
    },
    "size": {
        mydefault: function () {
            return {"x": 0, "y": 0};
        },
        parse: function(rawvalue) {
            // Split by "," and store in dict with two fields
            return {"x": parseInt(rawvalue.toString().split(",")[0], 10),
                    "y": parseInt(rawvalue.toString().split(",")[1], 10)};
        },
        validate: function (value) {
            console.log(JSON.stringify(value));
            if (typeof value === typeof {}) {
                if (value.hasOwnProperty("x") && typeof value.x === typeof 0 && value.x > 0) {
                    if (value.hasOwnProperty("y") && typeof value.y === typeof 0 && value.y > 0) {
                        return true;
                    }
                }
            }
            return false;
        }
    },
    "active": {
        // number of active players
        mydefault: function () {
            return 0;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value >= 0 && value < 16);
        }
    },
    "locked": {
        // number of locked players
        mydefault: function () {
            return 0;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value >= 0 && value < 16);
        }
    },
    "clients": {
        mydefault: function () {
            return 0;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value >= 0 && value < 16);
        }
    },
    "towns": {
        mydefault: function () {
            return 0;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    },
    "citizens": {
        mydefault: function () {
            return 0;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    },
    "factories": {
        mydefault: function () {
            return 0;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    },
    "convoys": {
        mydefault: function () {
            return 0;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    },
    "stops": {
        mydefault: function () {
            return 0;
        },
        parse: function(rawvalue) {
            return parseInt(rawvalue, 10);
        },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    }
};
