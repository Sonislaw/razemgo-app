// Both Metro and Node can load this module without parsing the 44k-place asset.
// The literal require remains discoverable by Metro's asset graph.
let dictionary;
exports.loadDictionary = () =>
  (dictionary ??= require('./polish-localities.json'));
