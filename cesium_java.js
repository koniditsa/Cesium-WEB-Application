// ion access token
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyNWM1ODE1Yy02YThiLTQ2NWItOWJjZS1hNjA4Y2VhOTg4OTUiLCJpZCI6MzI3MjQ2LCJpYXQiOjE3NTM5MTk0ODB9.H9OrnSuT6ptUiquUvcRvO3S3xLiJR2EP7liJyyJgXe4";

// Define the viewer
const viewer = new Cesium.Viewer("cesiumContainer");
// Set terrain provider as Cesium World Terrain using ion asset id 1
viewer.scene.setTerrain(
  new Cesium.Terrain(
    Cesium.CesiumTerrainProvider.fromIonAssetId(1),
  ),
);
viewer.scene.globe.depthTestAgainstTerrain = true;

// Google Photorealistic 3D Tiles (trees & buildings)
try {
  const googleTiles = await Cesium.createGooglePhotorealistic3DTileset();
  viewer.scene.primitives.add(googleTiles);
  await googleTiles.readyPromise; // optional
} catch (e) {
  console.log("Google 3D Tiles load error:", e);
}

// Lilydale_to_Warburton_Rail_Trail ASSET ID: 3776635 (polyline)
try {
  const trail = await Cesium.IonResource.fromAssetId(3776635);
  const trailSource = await Cesium.GeoJsonDataSource.load(trail, {
    clampToGround: true,
    stroke: Cesium.Color.WHITE,
    strokeWidth: 6,
  });
  await viewer.dataSources.add(trailSource);
  await viewer.zoomTo(trailSource);
} catch (error) {
  console.log(error);
}

// Lilydale_to_Warburton_Rail_Trail_waypoints ASSET ID: 3776636 (points)
try {
  const wpts = await Cesium.IonResource.fromAssetId(3776636);
  const wptsSource = await Cesium.GeoJsonDataSource.load(wpts, {
    clampToGround: true,
  });
  await viewer.dataSources.add(wptsSource);

  // Style waypoints by 'Name' (no `if`, exact + fuzzy match)
  const COLOR_BY_NAME = {
    "car park":                 Cesium.Color.GREY,
    "bridge":                   Cesium.Color.ORANGE,
    "long wooden bridge":       Cesium.Color.SIENNA,
    "toilet":                   Cesium.Color.CYAN,
    "toilet (wheelchair accessible)": Cesium.Color.CYAN,
    "playground":               Cesium.Color.GREEN,
    "picnic table":             Cesium.Color.PURPLE,
    "water (drinking tap)":     Cesium.Color.BLUE,
    "information":              Cesium.Color.YELLOW
  };

  const keys = Object.keys(COLOR_BY_NAME);
  const now = Cesium.JulianDate.now();

  wptsSource.entities.values.forEach((ent) => {
    const raw =
      (ent.properties?.Name && ent.properties.Name.getValue(now)) ||
      ent.name || "";
    const name = raw.trim().toLowerCase();

    // exact match OR fallback to first key contained in the name
    const exact = COLOR_BY_NAME[name];
    const fuzzyKey = exact ? undefined : keys.find(k => name.includes(k));
    const col = exact ?? COLOR_BY_NAME[fuzzyKey] ?? Cesium.Color.RED; // default red

    ent.billboard = undefined;
    ent.point = new Cesium.PointGraphics({
      pixelSize: 10,
      color: col.withAlpha(0.95),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    });
  });

  await viewer.zoomTo(wptsSource);
} catch (error) {
  console.log(error);
}

// LIVE AIR QUALITY + WEATHER (idempotent panel)
(() => {
  // reuse panel if it exists
  let panel = document.getElementById('live-data-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'live-data-panel';
    Object.assign(panel.style, {
      position: 'absolute', top: '5px', left: '5px', zIndex: 999,
      background: 'rgba(0,0,0,.55)', color: '#fff', padding: '7px',
      borderRadius: '7px', font: '14px system-ui'
    });
    viewer.container.appendChild(panel);
    panel.innerHTML = `
      <button id="btn-wx" style="margin-right:6px;padding:6px 10px;cursor:pointer">Weather</button>
      <button id="btn-aq" style="padding:6px 10px;cursor:pointer">Air Quality</button>
      <div id="live-out" style="margin-top:8px"></div>
    `;
  }
  const out   = panel.querySelector('#live-out');
  const btnWx = panel.querySelector('#btn-wx');
  const btnAQ = panel.querySelector('#btn-aq');

  const centerCarto = () => {
    const cv = viewer.scene.canvas;
    const c2 = new Cesium.Cartesian2(cv.clientWidth/2, cv.clientHeight/2);
    const ray = viewer.camera.getPickRay(c2);
    const cart = viewer.scene.globe.pick(ray, viewer.scene);
    return cart ? Cesium.Cartographic.fromCartesian(cart) : null;
  };

  async function fetchWeather(lat, lon) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`;
    out.textContent = 'Loading weather…';
    try {
      const r = await fetch(url);
      const d = await r.json();
      const c = d.current || {};
      out.innerHTML = `
        <b>Weather @ ${lat.toFixed(3)}, ${lon.toFixed(3)}</b><br>
        Temp: ${c.temperature_2m ?? '-'}°C<br>
        Wind: ${c.wind_speed_10m ?? '-'} m/s<br>
        Humidity: ${c.relative_humidity_2m ?? '-'}%
      `;
    } catch (e) { out.textContent = 'Weather unavailable.'; console.log('Weather error:', e); }
  }

  async function fetchAQ(lat, lon) {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=pm2_5,pm10,ozone,nitrogen_dioxide,carbon_monoxide,sulphur_dioxide,european_aqi&timezone=auto`;
    out.textContent = 'Loading air quality…';
    try {
      const r = await fetch(url);
      const d = await r.json();
      const c = d.current || {};
      const rows = [
        ['PM2.5', c.pm2_5, 'µg/m³'],
        ['O₃', c.ozone, 'µg/m³'],
        ['PM10', c.pm10, 'µg/m³'],
        ['NO₂', c.nitrogen_dioxide, 'µg/m³'],
        ['SO₂', c.sulphur_dioxide, 'µg/m³'],
        ['CO', c.carbon_monoxide, 'µg/m³'],
        ['EAQI', c.european_aqi, '']
      ].filter(([, v]) => v != null);

      out.innerHTML = rows.length
        ? `<b>Air Quality @ ${lat.toFixed(3)}, ${lon.toFixed(3)}</b><br>` +
          rows.map(([lab, val, unit]) => `${lab}: ${Number(val).toFixed(1)}${unit}`).join('<br>')
        : 'No air quality data.';
    } catch (e) { out.textContent = 'Air quality unavailable.'; console.log('AQ error:', e); }
  }

  btnWx.onclick = () => {
    const ct = centerCarto();
    ct
      ? fetchWeather(Cesium.Math.toDegrees(ct.latitude), Cesium.Math.toDegrees(ct.longitude))
      : (out.textContent = 'Aim the camera at ground and try again.');
  };
  btnAQ.onclick = () => {
    const ct = centerCarto();
    ct
      ? fetchAQ(Cesium.Math.toDegrees(ct.latitude), Cesium.Math.toDegrees(ct.longitude))
      : (out.textContent = 'Aim the camera at ground and try again.');
  };
})();
