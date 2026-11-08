import { searchTripLocations, findTripLocation, locationContext } from '../../src/features/trips/trip-locations.ts';
import { getLocationMapArea } from '../../src/features/trips/trip-map-data.ts';
export const qaPlaceId=id=>'qa_'+Buffer.from(id).toString('base64url');
const camps=[{id:'qa_camp_morski',name:'Camping Morski',context:'Armii Krajowej 4, Ustka',kind:'campground',address:'Armii Krajowej 4, 76-270 Ustka',latitude:54.579,longitude:16.862}];
export function mockPlaces(body) {
  if(body.action==='refresh')return {refreshed:0};
  if(body.action==='autocomplete') {
    const rows=/camp|kemp/i.test(body.query) ? camps : searchTripLocations(body.query,body.mode==='planned'?'planned':'flexible').map(p=>({id:qaPlaceId(p.id),name:p.name,context:locationContext(p),kind:['country','region'].includes(p.kind)?p.kind:'locality'}));
    return {predictions:rows.slice(0,8)};
  }
  const camp=camps.find(p=>p.id===body.placeId);
  const legacy=body.placeId?.startsWith('qa_')?findTripLocation(Buffer.from(body.placeId.slice(3),'base64url').toString()):undefined;
  const area=legacy?getLocationMapArea(legacy):undefined;
  const p=camp??(legacy?{name:legacy.name,address:locationContext(legacy),region:legacy.region,country:'PL',kind:['region','country'].includes(legacy.kind)?legacy.kind:'locality',latitude:area?.latitude??52,longitude:area?.longitude??19}:undefined);
  if(!p)return null;
  return {place:{id:'google:'+body.placeId,source:'google',googlePlaceId:body.placeId,name:p.name,address:p.address??'',region:p.region??'',country:p.country??'PL',kind:p.kind,latitude:p.latitude,longitude:p.longitude,resolvedAt:new Date().toISOString()}};
}
