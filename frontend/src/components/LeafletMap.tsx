import React, { useMemo, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { WebView } from "react-native-webview";

export type MapMarker = { id: string; lat: number; lng: number; color?: string; label?: string };

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
 * Embedded Leaflet + OpenStreetMap tile map. Runs inside a WebView so it works on
 * iOS, Android, and Expo web. Supports tap-to-drop-pin for merchant location picking
 * and multi-marker rendering for the customer map view.
 */
export default function LeafletMap({
  center, zoom = 14, markers = [], showUser = true, tappable = false, onTap, onMarkerPress, height = 320,
}: Props) {
  const webRef = useRef<any>(null);

  const html = useMemo(() => {
    const markersJs = JSON.stringify(markers);
    return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%}
.pin{background:#FF5A36;border:2px solid #fff;width:28px;height:28px;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px}
.user{background:#2BB8D6;border:3px solid #fff;width:22px;height:22px;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,.35)}
.picked{background:#FF5A36;border:3px solid #fff;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(0,0,0,.35)}
</style></head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const post = (m) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
const map = L.map('map', {zoomControl:true, attributionControl:false}).setView([${center.lat}, ${center.lng}], ${zoom});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
${showUser ? `const userIcon = L.divIcon({className:'', html:'<div class=\"user\"></div>', iconSize:[22,22], iconAnchor:[11,11]});
L.marker([${center.lat}, ${center.lng}], {icon: userIcon}).addTo(map);` : ""}

const markers = ${markersJs};
markers.forEach(m => {
  const icon = L.divIcon({className:'', html:'<div class="pin">'+(m.label||'')+'</div>', iconSize:[28,28], iconAnchor:[14,14]});
  const marker = L.marker([m.lat, m.lng], {icon}).addTo(map);
  marker.on('click', () => post({type:'marker', id: m.id}));
});

${tappable ? `let picked = null;
const pickIcon = L.divIcon({className:'', html:'<div class=\"picked\"></div>', iconSize:[34,34], iconAnchor:[17,34]});
map.on('click', function(e){
  if (picked) map.removeLayer(picked);
  picked = L.marker([e.latlng.lat, e.latlng.lng], {icon: pickIcon}).addTo(map);
  post({type:'tap', lat: e.latlng.lat, lng: e.latlng.lng});
});` : ""}

// Handle messages from RN (e.g. recenter)
document.addEventListener('message', function(e){
  try {
    const d = JSON.parse(e.data);
    if (d.type === 'recenter') map.setView([d.lat, d.lng], d.zoom || ${zoom});
  } catch(err) {}
});
</script>
</body></html>`;
  }, [center.lat, center.lng, zoom, markers, showUser, tappable]);

  const onMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "tap" && onTap) onTap(msg.lat, msg.lng);
      if (msg.type === "marker" && onMarkerPress) onMarkerPress(msg.id);
    } catch {}
  };

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webRef}
        source={{ html }}
        onMessage={onMessage}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        style={styles.web}
        androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 20, overflow: "hidden", backgroundColor: "#F2EBE5" },
  web: { flex: 1, backgroundColor: "transparent" },
});
