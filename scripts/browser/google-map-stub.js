// Browser-only provider double. Native SDK rendering is checked on Android.
(function(){
  const rad=n=>n*Math.PI/180, y=lat=>(1-Math.log(Math.tan(Math.PI/4+rad(lat)/2))/Math.PI)/2;
  const lat=y=>(Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI);
  class LatLng {constructor(a,b){this.a=a;this.b=b;}lat(){return this.a;}lng(){return this.b;}}
  class Map {
    constructor(el,options){this.el=el;this.center=new LatLng(options.center.lat,options.center.lng);this.zoom=options.zoom;this.listeners={};this.overlays=new Set();
      el.style.background='#dcebd7';el.style.position='relative';
      const label=document.createElement('div');label.className='google-map-canvas';label.textContent='Google Maps';label.style.cssText='position:absolute;bottom:10px;left:10px;color:#455b54';el.appendChild(label);
      for(const [label,direction]of[['Powiększ',1],['Pomniejsz',-1]]){const b=document.createElement('button');b.textContent=direction>0?'+':'−';b.setAttribute('aria-label',label);b.style.cssText='position:absolute;right:10px;bottom:'+(direction>0?60:15)+'px;z-index:4;width:40px;height:40px';b.onclick=e=>{e.stopPropagation();this.setZoom(this.zoom+direction);};el.appendChild(b);}
      let drag=null;
      el.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,c:this.center};el.setPointerCapture?.(e.pointerId);});
      el.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>4){const scale=256*2**this.zoom;this.center=new LatLng(lat(y(d.c.lat())-dy/scale),d.c.lng()-dx*360/scale);this.idle();}else{const r=el.getBoundingClientRect();this.emit('click',{latLng:this.unproject(e.clientX-r.left,e.clientY-r.top)});}});
      setTimeout(()=>{this.idle();this.emit('tilesloaded');},30);
    }
    addListener(k,f){(this.listeners[k]??=[]).push(f);return{remove:()=>{this.listeners[k]=this.listeners[k].filter(x=>x!==f);}};}
    emit(k,...args){for(const f of [...this.listeners[k]??[]])f(...args);}
    idle(){for(const o of this.overlays)o.draw?.();this.emit('idle');}
    getCenter(){return this.center;}getZoom(){return this.zoom;}
    setZoom(z){this.zoom=Math.max(2,Math.min(18,z));this.idle();}
    unproject(xp,yp){const scale=256*2**this.zoom;return new LatLng(lat(y(this.center.lat())+(yp-this.el.clientHeight/2)/scale),this.center.lng()+(xp-this.el.clientWidth/2)*360/scale);}
    getBounds(){return{getSouthWest:()=>this.unproject(0,this.el.clientHeight),getNorthEast:()=>this.unproject(this.el.clientWidth,0)};}
    fitBounds(b){this.center=new LatLng((b.south+b.north)/2,(b.west+b.east)/2);const sx=(b.east-b.west)/360,sy=Math.abs(y(b.south)-y(b.north));this.zoom=Math.max(2,Math.min(18,Math.floor(Math.log2(Math.min((this.el.clientWidth-110)/256/Math.max(sx,1e-10),(this.el.clientHeight-110)/256/Math.max(sy,1e-10))))));this.idle();}
  }
  class OverlayView {
    setMap(m){if(this.map){this.map.overlays.delete(this);this.onRemove?.();}this.map=m;if(m){m.overlays.add(this);this.onAdd?.();this.draw?.();}}
    getPanes(){return{overlayMouseTarget:this.map.el};}
    getProjection(){return{fromLatLngToDivPixel:p=>{const m=this.map,s=256*2**m.zoom;return{x:m.el.clientWidth/2+(p.lng()-m.center.lng())/360*s,y:m.el.clientHeight/2+(y(p.lat())-y(m.center.lat()))*s};}};}
    static preventMapHitsAndGesturesFrom(el){for(const e of ['click','pointerdown','pointerup'])el.addEventListener(e,event=>event.stopPropagation());}
  }
  class Marker {
    constructor(options){this.map=options.map;this.listeners={};this.el=document.createElement('div');this.el.textContent='📍';this.el.style.cssText='position:absolute;font-size:28px;transform:translate(-50%,-100%)';this.map.el.appendChild(this.el);}
    addListener(k,f){this.listeners[k]=f;}
    setPosition(p){const m=this.map,s=256*2**m.zoom;this.el.style.left=m.el.clientWidth/2+(p.lng-m.center.lng())/360*s+'px';this.el.style.top=m.el.clientHeight/2+(y(p.lat)-y(m.center.lat()))*s+'px';}
    setDraggable(){}
  }
  class Circle {constructor(o){const el=document.createElement('div');el.className='google-map-area';el.style.cssText='position:absolute;left:30%;top:30%;width:40%;height:40%;border:2px solid #086996;border-radius:50%;background:#08699626;pointer-events:none';o.map.el.appendChild(el);}}
  window.google={maps:{Map,LatLng,OverlayView,Marker,Circle}};
  const callback=new URL(document.currentScript.src).searchParams.get('callback');window[callback]();
})();
