# Polish campground catalogue

Source: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright.
This separate, derived campground database is distributed under the Open Database
License 1.0: https://opendatacommons.org/licenses/odbl/1-0/.
This notice covers the catalogue dataset, maintained separately from app code
and user-created content.

`polish-campgrounds.json` contains tuples:
`[osmTypeAndId, name, address, locality, latitude, longitude]`.
Address and locality may be empty. Addresses use the available OSM tags; missing
street addresses are not invented or inferred from the selected trip locality.
Unselected free-text names remain valid in trip forms and are not sent to OSM.

`polish-campgrounds-source.json` records the snapshot date, query, counts, source
SHA-256 and licence. Names and addresses are limited to the existing trip limits.
Private, inaccessible and explicitly inactive sites are excluded.

Refresh with `npm run campgrounds:import`, or reproduce the last download with
`npm run campgrounds:import -- --offline`. The original download is cached only
in ignored `.expo/campground-import/osm.json`. Add `--check` to verify the generated
snapshot without overwriting it. Incomplete or unexpectedly small responses
cannot replace the previous catalogue. The app searches a deferred local index;
typing never calls Overpass or Nominatim.
