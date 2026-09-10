import React, { useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { WebView } from "react-native-webview";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  icon?: string;
};

type Props = {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  showUser?: boolean;
  tappable?: boolean;
  onTap?: (lat: number, lng: number) => void;
  onMarkerPress?: (id: string) => void;
  height?: number | string;
};

/**
 * Embedded Leaflet + OpenStreetMap tile map. Uses `react-native-webview` on
 * iOS/Android and a plain <iframe> on web (react-native-webview has no web
 * support). Supports tap-to-drop-pin, multi-marker with per-marker color,
 * and imperative recenter via postMessage.
 */
export default function LeafletMap({
  center, zoom = 14, markers = [], showUser = true, tappable = false, onTap, onMarkerPress, height = 320,
}: Props) {
  const nativeRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);

  const html = useMemo(() => {
    const markersJs = JSON.stringify(markers);
    return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#F2EBE5}
.pin{border:2px solid #fff;width:30px;height:30px;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px}
.user{background:#2BB8D6;border:3px solid #fff;width:22px;height:22px;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,.35)}
.picked{background:#FF5A36;border:3px solid #fff;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(0,0,0,.35)}
</style></head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const post = (m) => {
  const payload = JSON.stringify(m);
  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
    window.ReactNativeWebView.postMessage(payload);
  } else if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, '*');
  }
};
const map = L.map('map', {zoomControl:true, attributionControl:false}).setView([${center.lat}, ${center.lng}], ${zoom});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
${showUser ? `const userIcon = L.divIcon({className:'', html:'<div class=\"user\"></div>', iconSize:[22,22], iconAnchor:[11,11]});
window._userMarker = L.marker([${center.lat}, ${center.lng}], {icon: userIcon}).addTo(map);` : ""}

const markers = ${markersJs};
markers.forEach(m => {
  const bg = m.color || '#FF5A36';
  const icon = L.divIcon({className:'', html:'<div class="pin" style="background:'+bg+'">'+(m.label||'')+'</div>', iconSize:[30,30], iconAnchor:[15,15]});
  const marker = L.marker([m.lat, m.lng], {icon}).addTo(map);
  marker.on('click', () => post({type:'marker', id: m.id}));
});

${tappable ? `let picked = null;
const pickIcon = L.divIcon({className:'', html:'<div class=\"picked\"></div>', iconSize:[34,34], iconAnchor:[17,34]});
function dropPin(lat, lng){
  if (picked) map.removeLayer(picked);
  picked = L.marker([lat, lng], {icon: pickIcon}).addTo(map);
}
map.on('click', function(e){
  dropPin(e.latlng.lat, e.latlng.lng);
  post({type:'tap', lat: e.latlng.lat, lng: e.latlng.lng});
});
dropPin(${center.lat}, ${center.lng});
window._dropPin = dropPin;` : ""}

function handleMessage(raw){
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (d && d.type === 'recenter') {
      map.setView([d.lat, d.lng], d.zoom || map.getZoom());
      if (window._userMarker) window._userMarker.setLatLng([d.lat, d.lng]);
      if (window._dropPin) window._dropPin(d.lat, d.lng);
    }
  } catch(err) {}
}
document.addEventListener('message', function(e){ handleMessage(e.data); });
window.addEventListener('message', function(e){ handleMessage(e.data); });
</script>
</body></html>`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, showUser, tappable]);

  // Recenter without rebuilding the HTML when only center changes
  useEffect(() => {
    const payload = JSON.stringify({ type: "recenter", lat: center.lat, lng: center.lng });
    if (Platform.OS === "web") {
      try { iframeRef.current?.contentWindow?.postMessage(payload, "*"); } catch {}
    } else {
      try { nativeRef.current?.postMessage?.(payload); } catch {}
    }
  }, [center.lat, center.lng]);

  // Web: attach a global message listener for iframe messages
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: any) => {
      try {
        const msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "tap" && onTap) onTap(msg.lat, msg.lng);
        if (msg.type === "marker" && onMarkerPress) onMarkerPress(msg.id);
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onTap, onMarkerPress]);

  const onMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "tap" && onTap) onTap(msg.lat, msg.lng);
      if (msg.type === "marker" && onMarkerPress) onMarkerPress(msg.id);
    } catch {}
  };

  return (
    <View style={[styles.container, { height: height as any }]}>
      {Platform.OS === "web" ? (
        // Web fallback: real iframe (react-native-webview has no web support)
        React.createElement("iframe", {
          ref: iframeRef,
          srcDoc: html,
          style: {
            width: "100%",
            height: "100%",
            border: 0,
            backgroundColor: "transparent",
          },
          sandbox: "allow-scripts allow-same-origin allow-popups",
        })
      ) : (
        <WebView
          ref={nativeRef}
          source={{ html }}
          onMessage={onMessage}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          style={styles.web}
          androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 20, overflow: "hidden", backgroundColor: "#F2EBE5" },
  web: { flex: 1, backgroundColor: "transparent" },
});
