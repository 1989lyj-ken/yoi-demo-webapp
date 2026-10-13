import type * as L from "leaflet";
import { mapStatusView, mapStepsView } from "../ui/views";
import { animateCount } from "../ui/count-up";
import {
  DEFAULT_CENTER, INITIAL_LOCATION, locationLabel, nextLocation, offersLocate, shouldWatch, showsOwnPosition, stepsDisplay,
  type LocationEvent, type LocationState,
} from "./shell-state";

/**
 * FSD-08A-1 §4: the steps page map (OpenStreetMap via Leaflet) with today's steps on top.
 * Privacy (M5): positions stay in memory for this view only — never stored, logged, put in a URL or sent
 * to Firestore; no reverse geocoding. The first request is the user's tap on "顯示我的位置"; once the
 * browser reports the permission as granted, later visits locate automatically.
 */
export interface MapHero {
  /** Steps page shown or hidden (the watch runs only while it is shown, M7). */
  setVisible(visible: boolean): void;
  /** Today's confirmed effective steps (FSD-08C S8: × 1.5 after a ride); an increase counts up from the previous confirmed value (FSD-08A-3 B1). */
  setSteps(steps: number | null): void;
  stop(): void;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
const ZOOM = 16;

/** FSD-08B: the location events the weather controller follows (positions stay in memory). */
export interface MapHeroHooks {
  isStale(): boolean;
  onFix?(lat: number, lng: number): void;
  /** Denied or unsupported: forget the weather. */
  onLost?(): void;
  /** The watch stopped (hidden, left the steps page, stale, stopped): abort a weather request. */
  onPause?(): void;
}

export function mountMapHero(root: HTMLElement, hooks: MapHeroHooks): MapHero {
  const canvas = root.querySelector<HTMLElement>("#map-canvas")!;
  const top = root.querySelector<HTMLElement>("#map-status")!;
  const overlay = root.querySelector<HTMLElement>(".yo-step-overlay")!;
  const actions = root.querySelector<HTMLElement>("#map-actions")!;
  const noteBox = root.querySelector<HTMLElement>("#map-note")!;
  let state: LocationState = INITIAL_LOCATION;
  let visible = false;
  let stopped = false;
  let requested = false;
  let watchId: number | null = null;
  let generation = 0;
  let leaflet: typeof L | null = null;
  let map: L.Map | null = null;
  let dot: L.CircleMarker | null = null;
  let ring: L.Circle | null = null;
  let loading = false;
  let fallback = false;
  let lastStatus = "";
  // B1: the last confirmed count, the value on screen and the running count-up (display only, never gates actions).
  let confirmedSteps: number | null = null;
  let shownSteps: number | null = null;
  let cancelCount: (() => void) | undefined;
  /** The last fix, in memory only (never stored or logged), placed once the map exists. */
  let pending: { lat: number; lng: number; accuracy: number } | null = null;

  function renderStatus() {
    const html = mapStatusView({ label: locationLabel(state), ownPosition: showsOwnPosition(state) });
    if (html !== lastStatus) { top.innerHTML = html; lastStatus = html; }
    const offer = offersLocate(state);
    const note = state.status === "denied" ? `<p class="app-map-note">可在瀏覽器設定中開啟定位</p>` : "";
    const hadFocus = actions.contains(document.activeElement);
    actions.innerHTML = offer ? `<button id="map-locate" class="yo-map-move" type="button" aria-describedby="map-privacy">顯示我的位置</button>` : "";
    noteBox.innerHTML = note;
    // The button is rebuilt: keep the keyboard on the map's status instead of dropping focus to <body>.
    if (hadFocus) (actions.querySelector<HTMLElement>("#map-locate") ?? top.querySelector<HTMLElement>(".yo-location-pill"))?.focus();
  }

  function showFallback() {
    if (fallback) return;
    fallback = true;
    map?.remove(); map = null; dot = null; ring = null;
    canvas.innerHTML = `<div class="yo-map-art"><i></i><i></i><i></i><i></i><i></i><b></b></div>`;
  }

  /** M6: a display-only map, created on the first visit of the steps page; later visits only re-measure it. */
  async function ensureMap() {
    if (map || loading || fallback || stopped) return;
    loading = true;
    try {
      const [mod] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
      leaflet = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L);
      if (stopped) return;
      map = leaflet.map(canvas, {
        center: [DEFAULT_CENTER[0], DEFAULT_CENTER[1]], zoom: ZOOM, dragging: false, touchZoom: false, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false, zoomControl: false, attributionControl: true,
      });
      canvas.removeAttribute("tabindex");
      const tiles = leaflet.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION });
      // Offline or blocked tiles: after several failures with nothing loaded, draw the illustration instead.
      let loaded = false;
      let errors = 0;
      tiles.on("tileload", () => { loaded = true; });
      tiles.on("tileerror", () => { errors += 1; if (!loaded && errors >= 4) showFallback(); });
      tiles.addTo(map);
      // The attribution must stay visible but the map is aria-hidden: keep its links out of the Tab order.
      requestAnimationFrame(() => map?.attributionControl?.getContainer()?.querySelectorAll("a").forEach((a) => a.setAttribute("tabindex", "-1")));
      if (pending) placePosition(pending.lat, pending.lng, pending.accuracy);
    } catch {
      showFallback();
    } finally { loading = false; }
  }

  function placePosition(lat: number, lng: number, accuracy: number) {
    pending = { lat, lng, accuracy };
    if (!map || !leaflet) return;
    const at: L.LatLngExpression = [lat, lng];
    if (!dot) {
      ring = leaflet.circle(at, { radius: accuracy, className: "app-map-ring", interactive: false }).addTo(map);
      dot = leaflet.circleMarker(at, { radius: 8, className: "app-map-dot", interactive: false }).addTo(map);
    } else {
      dot.setLatLng(at); ring?.setLatLng(at).setRadius(accuracy);
    }
    map.setView(at, ZOOM, { animate: false });
    // B2: centre the dot in the part not covered by the step card (spec 2-1 l.314): pan by half the card's band.
    // FSD-08A-6 QA B2: the step count now sits in .app-map-row; measure from the stack itself (child of the map section).
    const stack = overlay.closest<HTMLElement>(".app-map-bottom");
    const band = stack ? map.getSize().y - stack.offsetTop : 0;
    if (band > 0) map.panBy([0, Math.round(band / 2)], { animate: false });
  }

  // ----- B1: the big step count -----

  /** Writes a value; only "—" to a number or back rewrites the overlay, otherwise just the number's text (B1 a). */
  function writeSteps(value: number | null) {
    const el = overlay.querySelector<HTMLElement>("#map-steps");
    if (value === null || shownSteps === null || !el) overlay.innerHTML = mapStepsView(value);
    else { el.textContent = String(value); el.classList.toggle("long", String(value).length >= 7); } // FSD-08A-4 C6
    shownSteps = value;
  }

  /** Cancels a running count-up and shows the latest confirmed value (B1 c). */
  function finishCount() {
    if (!cancelCount) return;
    cancelCount();
    cancelCount = undefined;
    writeSteps(confirmedSteps);
  }

  function setSteps(steps: number | null) {
    // A snapshot with the same confirmed value (e.g. a claim) keeps a running count-up going.
    if (steps !== null && steps === confirmedSteps && cancelCount) return;
    const plan = stepsDisplay(confirmedSteps, steps);
    confirmedSteps = steps;
    cancelCount?.();
    cancelCount = undefined;
    if (plan.kind === "dash") { writeSteps(null); return; }
    if (plan.kind === "show" || !visible || document.visibilityState !== "visible" || shownSteps === null) { writeSteps(steps); return; }
    // B1 b: a new target restarts from the value on screen, never from the old start.
    const from = Math.min(shownSteps, plan.to);
    const to = plan.to;
    cancelCount = animateCount(from, to, (value) => writeSteps(value), () => { cancelCount = undefined; writeSteps(to); });
  }

  function apply(event: LocationEvent) {
    state = nextLocation(state, event);
    renderStatus();
    // FSD-08B B3: a position that may be outdated no longer drives the weather (forget it; a new fix fetches again).
    if (state.status === "stale") hooks.onLost?.();
    if (state.status === "denied" || state.status === "unsupported") {
      clearWatch();
      hooks.onLost?.();
      dot?.remove(); ring?.remove(); dot = null; ring = null; pending = null;
      map?.setView([DEFAULT_CENTER[0], DEFAULT_CENTER[1]], ZOOM, { animate: false });
    }
  }

  function clearWatch() {
    hooks.onPause?.();
    generation += 1;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  /** M7: start or stop the watch whenever any condition changes. */
  function sync() {
    const want = shouldWatch({ stepsPageShown: visible, documentVisible: document.visibilityState === "visible", stopped,
      stale: hooks.isStale(), requested, status: state.status });
    if (!want) { clearWatch(); return; }
    if (watchId !== null) return;
    if (!("geolocation" in navigator) || !window.isSecureContext) { apply({ type: "unsupported" }); return; }
    const mine = ++generation;
    apply({ type: "request" });
    watchId = navigator.geolocation.watchPosition((pos) => {
      if (mine !== generation) return;
      apply({ type: "fix", accuracy: pos.coords.accuracy });
      placePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      // FSD-08B (Architect B3): from the watch callback, whether or not the map exists yet.
      if (state.status === "located") hooks.onFix?.(pos.coords.latitude, pos.coords.longitude);
    }, (error) => {
      if (mine !== generation) return;
      // Only the error code is used; the error object is never logged (it may carry details).
      apply({ type: "error", code: error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.TIMEOUT ? "timeout" : "unavailable" });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  }

  const onVisibility = () => { if (document.visibilityState !== "visible") finishCount(); sync(); };
  document.addEventListener("visibilitychange", onVisibility);
  actions.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("#map-locate")) return;
    requested = true;
    if (state.status === "unavailable") { clearWatch(); state = { ...state, status: "idle" }; }
    sync();
  });

  // A permission granted on an earlier visit locates automatically (no prompt is shown in that case).
  void navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p) => {
    if (p.state === "granted" && !stopped) { requested = true; sync(); }
  }, () => undefined);

  renderStatus();
  return {
    setVisible(next) {
      visible = next;
      if (!visible) finishCount();
      if (visible) { void ensureMap().then(() => map?.invalidateSize()); }
      sync();
    },
    setSteps,
    stop() {
      stopped = true;
      finishCount();
      clearWatch();
      document.removeEventListener("visibilitychange", onVisibility);
      map?.remove(); map = null;
    },
  };
}
