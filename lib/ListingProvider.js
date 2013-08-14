ListingProvider = function () {};
ListingProvider.prototype.data = [];

ListingProvider.prototype.findAll = function(callback) {
    callback(null, this.data)
};

ListingProvider.prototype.findById = function(id, callback) {
    var result = null;
    for (var i = 0; i < this.data.length; i++) {
        if (this.data[i].id === id) {
            result = this.data[i];
            break;
        }
    }
    callback(null, result);
};

ListingProvider.prototype.save = function(listing, callback) {
    var existing = null;
    for (var i = 0; i < this.data.length; i++) {
        if (this.data[i].id == listing.id) {
            this.data[i] = listing;
            return;
        }
    }
    this.data[this.data.length] = listing;
    callback(null, listing);
};


/* Lets bootstrap with data 
new ListingProvider().save([
  {title: 'Post one', body: 'Body one', comments:[{author:'Bob', comment:'I love it'}, {author:'Dave', comment:'This is rubbish!'}]},
  {title: 'Post two', body: 'Body two'},
  {title: 'Post three', body: 'Body three'}
], function(error, listings){});
*/

exports.ListingProvider = ListingProvider;
