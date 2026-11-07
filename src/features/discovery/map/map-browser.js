/* global L */
// Runs only inside the isolated map document. No tokens, profiles or trip text enter it.
(function () {
  'use strict';
  const channel = 'razemgo-discovery-map-v1';
  const travelModeImages = JSON.parse(
    document.getElementById('travel-mode-images').textContent,
  );
  let map = null,
    markers = null,
    token = null,
    nextReason = 'initial',
    tileError = false;
  function send(value) {
    value.channel = channel;
    value.token = token;
    if (window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify(value));
    else if (window.parent !== window)
      window.parent.postMessage(value, window.location.origin);
  }
  function viewport() {
    if (!map) return;
    const b = map.getBounds(),
      c = map.getCenter();
    const bounds = {
      south: Math.max(-85, b.getSouth()),
      north: Math.min(85, b.getNorth()),
      west: Math.max(-180, b.getWest()),
      east: Math.min(180, b.getEast()),
    };
    if (bounds.south >= bounds.north || bounds.west >= bounds.east) return;
    send({
      type: 'viewport',
      bounds: bounds,
      camera: {
        latitude: Math.max(-85, Math.min(85, c.lat)),
        longitude: Math.max(-180, Math.min(180, c.lng)),
        zoom: Math.round(map.getZoom()),
      },
      reason: nextReason,
    });
    nextReason = 'pan';
  }
  function receive(message) {
    if (!message || message.channel !== channel) return;
    if (message.type === 'init' && !map) {
      token = message.token;
      const camera = message.camera;
      map = L.map('map', {
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false,
        attributionControl: true,
        maxBounds: [
          [-85, -180],
          [85, 180],
        ],
        maxBoundsViscosity: 1,
        zoomAnimation: false,
        fadeAnimation: false,
      });
      L.control
        .zoom({
          position: 'topright',
          zoomInTitle: 'Przybliż mapę',
          zoomOutTitle: 'Oddal mapę',
        })
        .addTo(map);
      map.attributionControl.setPrefix(
        '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>',
      );
      markers = L.layerGroup().addTo(map);
      const layer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 18,
          noWrap: true,
          keepBuffer: 0,
          updateWhenIdle: true,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        },
      ).addTo(map);
      layer.on('tileerror', function () {
        if (!tileError) {
          tileError = true;
          send({ type: 'tiles', ok: false });
        }
      });
      layer.on('tileload', function () {
        if (tileError) {
          tileError = false;
          send({ type: 'tiles', ok: true });
        }
      });
      map.on('moveend', viewport);
      map.setView([camera.latitude, camera.longitude], camera.zoom);
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(function () {
          map.invalidateSize({ pan: false });
        }).observe(document.getElementById('map'));
      }
      document.getElementById('hint').hidden = true;
      setTimeout(function () {
        map.invalidateSize();
        viewport();
      }, 0);
      return;
    }
    if (!map || message.token !== token) return;
    if (message.type === 'points') {
      markers.clearLayers();
      (message.points || []).forEach(function (point) {
        const cluster = point.count > 1;
        const source = !cluster && Object.hasOwn(travelModeImages, point.travelMode)
          ? travelModeImages[point.travelMode]
          : null;
        const label = document.createElement(source ? 'img' : 'span');
        if (source) {
          label.src = source;
          label.alt = '';
          label.draggable = false;
          label.dataset.travelMode = point.travelMode;
        } else {
          label.textContent = cluster ? String(point.count) : '●';
        }
        const size = cluster ? 42 : 48;
        const icon = L.divIcon({
          html: label,
          className: cluster ? 'crew-cluster' : 'crew-pin',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const modeLabel = point.travelMode === 'Van' ? 'Kampervan' : point.travelMode;
        const title = cluster
          ? 'Wyjazdy: ' + point.count
          : point.label + (source ? ' · ' + modeLabel : '');
        const marker = L.marker([point.latitude, point.longitude], {
          icon: icon,
          title: title,
          keyboard: true,
        }).addTo(markers);
        marker.getElement().setAttribute('aria-label', title);
        marker.on('click', function () {
          send({ type: 'select', key: point.key });
        });
      });
    }
    if (message.type === 'fit') {
      nextReason = 'cluster';
      map.fitBounds(
        [
          [message.bounds.south, message.bounds.west],
          [message.bounds.north, message.bounds.east],
        ],
        {
          padding: [55, 55],
          maxZoom: Math.min(18, map.getZoom() + 3),
          animate: false,
        },
      );
    }
  }
  window.RazemGoMap = { receive: receive };
  window.addEventListener('message', function (event) {
    if (
      event.source === window.parent &&
      event.origin === window.location.origin
    )
      receive(event.data);
  });
  document.addEventListener('click', function (event) {
    const a = event.target.closest && event.target.closest('a');
    if (!a) return;
    event.preventDefault();
    if (
      a.href === 'https://www.openstreetmap.org/copyright' ||
      a.href === 'https://leafletjs.com'
    )
      send({ type: 'attribution', url: a.href });
  });
  send({ type: 'ready' });
})();
