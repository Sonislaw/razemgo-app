// Keep parsing the catalogue out of app startup and a closed campground field.
let dictionary;
exports.loadCampgrounds = () =>
  (dictionary ??= require('./polish-campgrounds.json'));
