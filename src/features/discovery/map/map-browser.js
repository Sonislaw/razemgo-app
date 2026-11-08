/* global google */
// Isolated Google Maps page. It never receives account tokens or private trip data.
(function () {
  'use strict';
  const channel = 'razemgo-discovery-map-v1';
  const travelModeImages = JSON.parse(document.getElementById('travel-mode-images').textContent);
  let map = null, markers = [], token = null, loading = false, nextReason = 'initial', picker = false, pin = null;
  const parentOrigin = document.referrer ? new URL(document.referrer).origin : window.location.origin;
  function send(value) {
    value.channel = channel; value.token = token;
    if (window.parent !== window) window.parent.postMessage(value, parentOrigin);
  }
  function fail(code) {
    document.getElementById('hint').textContent = 'Mapa jest chwilowo niedostępna.';
    document.getElementById('hint').hidden = false;
    send({ type: 'error', code: code });
  }
  window.gm_authFailure = function () { fail('load-failed'); };
  function viewport() {
    if (!map || !map.getBounds()) return;
    const b = map.getBounds(), c = map.getCenter(), ne = b.getNorthEast(), sw = b.getSouthWest();
    const crosses = sw.lng() >= ne.lng();
    send({ type: 'viewport', bounds: {
      south: Math.max(-85, sw.lat()), north: Math.min(85, ne.lat()),
      west: crosses ? -180 : Math.max(-180, sw.lng()), east: crosses ? 180 : Math.min(180, ne.lng())
    }, camera: { latitude: c.lat(), longitude: c.lng(), zoom: Math.max(2, Math.min(18, Math.round(map.getZoom()))) },
      reason: nextReason });
    nextReason = 'pan';
  }
  function movePin(latitude, longitude, notify) {
    if (!pin) {
      pin = new google.maps.Marker({ map: map, draggable: true, title: 'Wybrane miejsce' });
      pin.addListener('dragend', function (event) {
        if (event.latLng) send({ type: 'pin', latitude: event.latLng.lat(), longitude: event.latLng.lng() });
      });
    }
    pin.setPosition({ lat: latitude, lng: longitude });
    if (notify) send({ type: 'pin', latitude: latitude, longitude: longitude });
  }
  function start(message) {
    const camera = message.camera;
    picker = !!message.picker;
    map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: camera.latitude, lng: camera.longitude }, zoom: camera.zoom,
      minZoom: 2, maxZoom: 18, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false, gestureHandling: 'greedy',
      restriction: { latLngBounds: { south: -85, north: 85, west: -180, east: 180 }, strictBounds: true }
    });
    map.addListener('idle', viewport);
    map.addListener('tilesloaded', function () { send({ type: 'tiles', ok: true }); });
    if(message.area) new google.maps.Circle({map:map,center:{lat:message.area.latitude,lng:message.area.longitude},radius:message.area.radiusMeters,fillColor:'#086996',fillOpacity:0.15,strokeColor:'#086996',strokeWeight:2});
    if(!picker&&message.selectedPoint) {movePin(message.selectedPoint.latitude,message.selectedPoint.longitude,false);pin.setDraggable(false);}
    if (picker) {
      if (message.selectedPoint) movePin(message.selectedPoint.latitude, message.selectedPoint.longitude, false);
      map.addListener('click', function (e) { if (e.latLng) movePin(e.latLng.lat(), e.latLng.lng(), true); });
    }
    document.getElementById('hint').hidden = true;
  }
  function makeMarker(point) {
    const cluster = point.count > 1;
    const source = !cluster && Object.hasOwn(travelModeImages, point.travelMode) ? travelModeImages[point.travelMode] : null;
    const button = document.createElement('button');
    button.type = 'button'; button.className = cluster ? 'crew-cluster' : 'crew-pin';
    const title = cluster ? 'Wyjazdy: ' + point.count : point.label + (source ? ' · '+(point.travelMode==='Van'?'Kampervan':point.travelMode) : '');
    button.title = title; button.setAttribute('aria-label', title);
    if (source) {
      const img = document.createElement('img'); img.src = source; img.alt = ''; img.draggable = false;
      img.dataset.travelMode = point.travelMode; button.appendChild(img);
    } else button.textContent = cluster ? String(point.count) : '●';
    button.addEventListener('click', function () { send({ type: 'select', key: point.key }); });
    class TripMarker extends google.maps.OverlayView {
      onAdd() {
        this.getPanes().overlayMouseTarget.appendChild(button);
        google.maps.OverlayView.preventMapHitsAndGesturesFrom(button);
      }
      draw() {
        const p = this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(point.latitude, point.longitude));
        if (p) { button.style.left = p.x + 'px'; button.style.top = p.y + 'px'; }
      }
      onRemove() { button.remove(); }
    }
    const marker = new TripMarker(); marker.setMap(map); return marker;
  }
  function receive(message) {
    if (!message || message.channel !== channel) return;
    if (message.type === 'init' && !loading) {
      loading = true; token = message.token;
      if (typeof message.apiKey !== 'string' || !message.apiKey) { fail('not-configured'); return; }
      const callback = '__razemgoGoogleReady';
      window[callback] = function () { start(message); };
      const script = document.createElement('script');
      const params = new URLSearchParams({ key: message.apiKey, v: 'quarterly', language: 'pl', region: 'PL', loading: 'async', callback: callback });
      script.src = 'https://maps.googleapis.com/maps/api/js?' + params.toString();
      script.onerror = function () { fail('load-failed'); };
      document.head.appendChild(script); return;
    }
    if (!map || message.token !== token) return;
    if (message.type === 'points') {
      markers.forEach(function (marker) { marker.setMap(null); });
      markers = (message.points || []).map(makeMarker);
    }
    if (message.type === 'fit') {
      nextReason = 'cluster';
      const listener = map.addListener('idle', function () {
        listener.remove(); if (map.getZoom() > Math.min(18, message.maxZoom || 18)) map.setZoom(Math.min(18, message.maxZoom || 18));
      });
      map.fitBounds(message.bounds, 55);
    }
    if (message.type === 'pin' && picker) movePin(message.latitude, message.longitude, false);
  }
  window.RazemGoMap = { receive: receive };
  window.addEventListener('message', function (event) {
    if (event.source === window.parent && event.origin === parentOrigin) receive(event.data);
  });
  send({ type: 'ready' });
})();
