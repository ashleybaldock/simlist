ListingProvider = function () {};
ListingProvider.prototype.data = {};

ListingProvider.prototype.findAll = function(callback) {
    callback(this.data);
};

ListingProvider.prototype.findById = function(id, callback) {
    var result = null;
    if (this.data.hasOwnProperty(id)) {
        result = this.data[id];
    }
    callback(result);
};

ListingProvider.prototype.save = function(listing, callback) {
    this.data[listing.id] = listing;
    callback(listing);
};

ListingProvider.prototype.removeById = function(id, callback) {
    var removed = null;
    if (this.data.hasOwnProperty(id)) {
        removed = this.data[id];
        delete this.data[id];
    }
    callback(removed);
};


/* Lets bootstrap with data 
new ListingProvider().save([
  {title: 'Post one', body: 'Body one', comments:[{author:'Bob', comment:'I love it'}, {author:'Dave', comment:'This is rubbish!'}]},
  {title: 'Post two', body: 'Body two'},
  {title: 'Post three', body: 'Body three'}
], function(error, listings){});
*/

exports.ListingProvider = ListingProvider;
