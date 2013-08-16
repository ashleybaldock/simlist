// ListingProvider which persists changes to MongoDB
var config = require('../config.json');
var mongodb = require('mongodb');
var db = new mongodb.Db(config.db_name, new mongodb.Server(config.db_fqdn, config.db_port, {auto_reconnect: true}), {w: -1});

ListingProvider = function () {
    this.data = {};
    var that = this;
    db.open(function (err, db_p) {
        if (err) { throw err; }
        db.authenticate(config.db_user, config.db_pass, function (err, replies) {
            if (err) { throw err; }
            // You are now connected and authenticated.
            db.collection('listing', function (err, collection) {
                if (err) { throw err; }
                collection.find().each(function (err, listing) {
                    if (err) { throw err; }
                    that.data[listing.id] = listing;
                    console.log('Loaded listing from DB: ' + JSON.stringify(listing));
                });
            });
        });
    });
};

ListingProvider.prototype.findAll = function(callback) {
    if (typeof callback === 'function') { callback(this.data); }
};

ListingProvider.prototype.findById = function(id, callback) {
    var result = null;
    if (this.data.hasOwnProperty(id)) {
        result = this.data[id];
    }
    if (typeof callback === 'function') { callback(result); }
};

ListingProvider.prototype.save = function(listing, callback) {
    this.data[listing.id] = listing;
    db.open(function (err, db_p) {
        if (err) {
            console.err("Unable to open DB connection to save listing with id: " + listing.id + " error: " + err);
            return;
        }
        db.authenticate(config.db_user, config.db_pass, function (err, replies) {
            if (err) {
                console.err("DB authentication failed - saving listing with id: " + listing.id + " error: " + err);
                return;
            }
            db.collection('listing', function (err, collection) {
                if (err) {
                    console.err("Collection enumeration failed - saving listing with id: " + listing.id + " error: " + err);
                    return;
                }
                collection.update({id: listing.id}, listing, {w: -1, upsert: true});
                console.log("Updated record in database");
            });
        });
    });
    if (typeof callback === 'function') { callback(listing); }
};

ListingProvider.prototype.removeById = function(id, callback) {
    var removed = null;
    if (this.data.hasOwnProperty(id)) {
        removed = this.data[id];
        delete this.data[id];
    }
    if (typeof callback === 'function') { callback(removed); }
};

exports.ListingProvider = ListingProvider;
