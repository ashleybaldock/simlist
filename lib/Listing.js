var dns = require("dns");

// Each field record has the following methods:
//   mydefault()  - return a default value
//   validate() - validate storage format of field
//   parse()    - convert the "on-the-wire" data into the storage format
var valid_fields = {
    "st": { // Status
        mydefault: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 0 && value < 2);
        }
    },
    "aiv": { // Announce interval (seconds)
        mydefault: function () { return 900; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && value >= 30);
        }
    },
    "rev": { // Server game revision, numeric
        mydefault: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 100);
        }
    },
    "ver": { // Server game verbose version information
        mydefault: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 100);
        }
    },
    "pak": {
        mydefault: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 100);
        }
    },
    "name": {
        mydefault: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 200);
        }
    },
    "email": {
        mydefault: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            // From http://www.regular-expressions.info/email.html
            return (typeof value === typeof "str" && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,6}$/i.test(value));
        }
    },
    "pakurl": {
        mydefault: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return true;                        // TODO (url)
        }
    },
    "infurl": {
        mydefault: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return true;                        // TODO (url)
        }
    },
    "comments": {
        mydefault: function () { return ""; },
        parse: function(rawvalue) { return rawvalue.toString(); },
        validate: function (value) {
            return (typeof value === typeof "str" && value.length < 2000);
        }
    },
    "time": {
        // Current date of the server game
        mydefault: function () { return {"yr": 1, "mn": 0}; },
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
        mydefault: function () { return {"yr": 1, "mn": 0}; },
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
        mydefault: function () { return {"x": 0, "y": 0}; },
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
        mydefault: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value >= 0 && value < 16);
        }
    },
    "locked": {
        // number of locked players
        mydefault: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value >= 0 && value < 16);
        }
    },
    "clients": {
        mydefault: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value >= 0 && value < 16);
        }
    },
    "towns": {
        mydefault: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    },
    "citizens": {
        mydefault: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    },
    "factories": {
        mydefault: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    },
    "convoys": {
        mydefault: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    },
    "stops": {
        mydefault: function () { return 0; },
        parse: function(rawvalue) { return parseInt(rawvalue, 10); },
        validate: function (value) {
            return (typeof value === typeof 0 && !isNaN(value) && value > 0);
        }
    }
};

exports.Listing = function Listing (dns, port) {
    this.port = port;
    this.dns = dns;
    this.id = this.dns + ":" + this.port;
    this.date = (new Date()).getTime();

    // Set all default values
    for (key in valid_fields) {
        this[key] = valid_fields[key].mydefault();
    }
    console.log("New Listing created, ID: " + this.id);
}

// Update updateable fields from the parsed html form body specified
exports.Listing.prototype.update_from_body = function (from_body) {
    for (key in valid_fields) {
        if (valid_fields.hasOwnProperty(key) && from_body.hasOwnProperty(key)) {
            var parsed_field = valid_fields[key].parse(from_body[key])
            if (valid_fields[key].validate(parsed_field)) {
                this[key] = parsed_field;
            }
        }
    }
};

// Update updateable fields from an existing Listing object (or similar object)
exports.Listing.prototype.update_from_object = function (from_object) {
    // For each field in from
        // Check if it's in the list of updateable fields
        // If so call associated validate() method on result
        // If that succeeds, set the value
    if (from_object === null) { return; }
    for (key in valid_fields) {
        if (valid_fields.hasOwnProperty(key) && from_object.hasOwnProperty(key)) {
            if (valid_fields[key].validate(from_object[key])) {
                this[key] = from_object[key];
            }
        }
    }
};

exports.parse_dns = function (dns) {
    return dns;
};
exports.validate_dns = function (value, reqip, success, failure) {
    if (typeof reqip === "undefined") { return failure(); }

    // Setup dummy functions (for validate without callbacks)
    if (typeof success !== "function") {
        console.log("dns.validate - override success()");
        success = function () { return true; };
    }
    if (typeof failure !== "function") {
        console.log("dns.validate - override failure()");
        failure = function () { return false; };
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
            console.log("dns.validate - success (matched IPv6 address)");
            return success();
        } else {
            console.error("dns.validate - failure (valid IPv6 but does not match request IP");
            return failure();
        }
    }

    if (checkipv4(value)) {
        if (value === reqip) {
            console.log("dns.validate - success (matched IPv4 address)");
            return success();
        } else {
            console.error("dns.validate - failure (valid IPv4 but does not match request IP");
            return failure();
        }
    }

    if (checkdomain(value)) {
        dns.resolve6(value, function (err, addresses) {
            if (!err && addresses.length > 0) {
                var found = false;
                addresses.forEach(function (element, index, array) {
                    if (element === reqip) {
                        found = true;
                        console.log("dns.validate - success (matched IPv6 address from DNS)");
                    }
                });
                if (found) { return success(); }
            }
            dns.resolve4(value, function (err, addresses) {
                if (!err && addresses.length > 0) {
                    var found = false;
                    addresses.forEach(function (element, index, array) {
                        if (element === reqip) {
                            console.log("dns.validate - success (matched IPv4 address from DNS)");
                            found = true;
                        }
                    });
                    if (found) { return success(); }
                }
                console.error("dns.validate - failure (no matching addresses in DNS)");
                return failure();
            });
        });
    } else {
        console.error("dns.validate - failure (Invalid domain name)");
        return failure();
    }
};

exports.parse_port = function (port) {
    if (typeof port === typeof 0) {
        return port;
    } else if (typeof port === typeof "") {
        return parseInt(port, 10);
    }
    return 0;
};

exports.validate_port = function (port) {
    return (typeof port === typeof 0 && !isNaN(port) && port > 0 && port <= 65535);
};
