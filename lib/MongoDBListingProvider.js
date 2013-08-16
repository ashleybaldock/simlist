// ListingProvider which persists changes to MongoDB
var mongodb = require('mongodb');
var MongoClient = require('mongodb').MongoClient;

ListingProvider = function (connection_string) {
    this.data = {};
    this.connection_string = connection_string;
    var self = this;
    MongoClient.connect(this.connection_string, function(err, db) {
        db.collection('listing', function (err, collection) {
            if (err) {
                console.err("Collection enumeration failed - initial listing load");
                return;
            }
            console.log("Loading listings from DB...");
            collection.find().each(function (err, listing) {
                if (err) { throw err; }
                self.data[listing.id] = listing;
                console.log('Loaded listing from DB: ' + JSON.stringify(listing));
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
    MongoClient.connect(this.connection_string, function(err, db) {
        db.collection('listing', function (err, collection) {
            if (err) {
                console.err("Collection enumeration failed - save listing with id: " + listing.id + " error: " + err);
                return;
            }
            collection.update({id: listing.id}, listing, {w: -1, upsert: true});
            console.log("Updated record in database");
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
    MongoClient.connect(this.connection_string, function(err, db) {
        db.collection('listing', function (err, collection) {
            if (err) {
                console.err("Collection enumeration failed - remove listing with id: " + id + " error: " + err);
                return;
            }
            collection.remove({id: id}, false, function (err) {
                console.log("Removed listing with id: " + id + " from database");
            });
        });
    });
    if (typeof callback === 'function') { callback(removed); }
};

exports.ListingProvider = ListingProvider;
