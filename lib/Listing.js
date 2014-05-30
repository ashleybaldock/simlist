var dns = require("dns");
var validator = require("validator");

var isString = function (value) {
    return typeof value === typeof "str";
};
var isInt = function (value) {
    return typeof value === typeof 0;
};
var parseTime = function (rawvalue) {
    // Split by "," and store in dict with two fields
    return {"mn": parseInt(rawvalue.toString().split(",")[0], 10),
            "yr": parseInt(rawvalue.toString().split(",")[1], 10)};
};
var parseBaseTenInt = function (rawvalue) {
    return parseInt(rawvalue, 10);
};
var parseString = function (rawvalue) {
    return rawvalue.toString();
};

var intNotNegative = {
    mydefault: 0,
    parse: parseBaseTenInt,
    validate: function (value) {
        return (isInt(value) && !isNaN(value) && value >= 0);
    }
};
var intZeroToFifteen = {
    mydefault: 0,
    parse: parseBaseTenInt,
    validate: function (value) {
        return (isInt(value) && !isNaN(value) && value >= 0 && value < 16);
    }
};
var time = {
    mydefault: {"yr": 1, "mn": 0},
    parse: parseTime,
    validate: function (value) {
        if (typeof value === typeof {}) {
            if (value.hasOwnProperty("yr") && typeof value.yr === typeof 0 && value.yr > 0) {
                if (value.hasOwnProperty("mn") && typeof value.mn === typeof 0 && value.mn >= 0 && value.mn < 12) {
                    return true;
                }
            }
        }
        return false;
    }
};
var url = {
    mydefault: "",
    parse: parseString,
    validate: validator.isURL
};
var shortString = {
    mydefault: "",
    parse: parseString,
    validate: function (value) {
        return (isString(value) && value.length < 100);
    }
};

// Each field record has the following methods:
//   mydefault()  - return a default value
//   validate() - validate storage format of field
//   parse()    - convert the "on-the-wire" data into the storage format
var valid_fields = {
    "st": { // Status
        mydefault: 0,
        parse: parseBaseTenInt,
        validate: function (value) {
            return (isInt(value) && value >= 0 && value < 2);
        }
    },
    "aiv": { // Announce interval (seconds)
        mydefault: 900,
        parse: parseBaseTenInt,
        validate: function (value) {
            return (isInt(value) && value >= 30);
        }
    },
    "pak": {
        mydefault: "unknown",
        parse: parseString,
        validate: function (value) {
            return (isString(value) && value.length < 100);
        }
    },
    "email": {
        mydefault: "",
        parse: parseString,
        validate: validator.isEmail
    },
    "rev": shortString,
    "ver": shortString,
    "name": shortString,
    "pakurl": url,
    "infurl": url,
    "comments": {
        mydefault: "",
        parse: parseString,
        validate: function (value) {
            return (isString(value) && value.length < 2000);
        }
    },
    "time": time,
    "start": time,
    "size": {
        mydefault: {"x": 0, "y": 0},
        parse: function(rawvalue) {
            // Split by "," and store in dict with two fields
            return {"x": parseInt(rawvalue.toString().split(",")[0], 10),
                    "y": parseInt(rawvalue.toString().split(",")[1], 10)};
        },
        validate: function (value) {
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
    "active": intZeroToFifteen,
    "locked": intZeroToFifteen,
    "clients": intZeroToFifteen,
    "towns": intNotNegative,
    "citizens": intNotNegative,
    "factories": intNotNegative,
    "convoys": intNotNegative,
    "stops": intNotNegative
};

exports.Listing = function Listing (dns, port) {
    this.port = port;
    this.dns = dns;
    this.id = this.dns + ":" + this.port;
    this.date = (new Date()).getTime();

    // Set all default values
    for (key in valid_fields) {
        this[key] = valid_fields[key].mydefault;
    }
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
    if (typeof success !== "function") { success = function () { return true; }; }
    if (typeof failure !== "function") { failure = function () { return false; }; }

    var checkdomain = function (str) {
        // From http://www.mczen.com/blog/post/viewitemaspxid3deed1cc4f-92a4-4485-85b2-21356a3d18e0.aspx
        return (/^([a-zA-Z0-9]([-a-zA-Z0-9]+)?\.)+([a-zA-Z]{2,7}\.?)$/.test(str));
    };

    // DNS MUST be valid FQDN, IPv4 or IPv6
    // Additionally one of the IP addresses MUST match reqip, else invalid
    if (validator.isIP(value, "6")) {
        if (value === reqip) {
            return success();
        } else {
            console.error("dns.validate - failure (valid IPv6 but does not match request IP");
            return failure();
        }
    }

    if (validator.isIP(value, "4")) {
        if (value === reqip) {
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
                    }
                });
                if (found) { return success(); }
            }
            dns.resolve4(value, function (err, addresses) {
                if (!err && addresses.length > 0) {
                    var found = false;
                    addresses.forEach(function (element, index, array) {
                        if (element === reqip) {
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
