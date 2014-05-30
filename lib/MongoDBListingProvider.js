// ListingProvider which persists changes to MongoDB
var mongodb = require('mongodb');
var MongoClient = require('mongodb').MongoClient;

var connection_string = process.env.MONGOLAB_URI;

ListingProvider = function (init_callback) {
    this.data = {};
    this.db = null;
    this.listing_collection;

    var self = this;
    MongoClient.connect(connection_string, function(err, database) {
        self.db = database;
        self.listing_collection = database.collection('listing');

        console.log("Loading listings from DB...");
        self.listing_collection.find().each(function (err, listing) {
            if (err) { throw err; }
            self.data[listing.id] = listing;
            console.log('Loaded listing from DB: ' + JSON.stringify(listing));
        });

        init_callback();
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
    this.listing_collection.update({id: listing.id}, listing, {w: -1, upsert: true}, function (err) {
        if (err) {
            console.error("ListingProvider.save() - failed to save listing with id: '" + listing.id + "' to DB");
        }
    });
    if (typeof callback === 'function') { callback(listing); }
};

ListingProvider.prototype.removeById = function(id, callback) {
    var removed = null;
    if (this.data.hasOwnProperty(id)) {
        removed = this.data[id];
        delete this.data[id];
    }
    this.listing_collection.remove({id: id}, false, function (err) {
        if (err) {
            console.error("ListingProvider.removeById() - failed to remove listing with id: '" + id + "' from DB");
        }
    });
    if (typeof callback === 'function') { callback(removed); }
};

exports.ListingProvider = ListingProvider;
