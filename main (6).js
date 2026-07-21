import nipplejs from "nipplejs";
import * as Blockly from "blockly";

const viewport = document.getElementById("viewport");
const ctx = viewport.getContext("2d");

const explorerList = document.getElementById("explorer-list");
const toolboxButtons = document.querySelectorAll(".toolbox-item");
const toolButtons = document.querySelectorAll(".tool-button");

/*
  Discover button: opens a dedicated Discover page in a new tab where other users' saved/shared games
  are shown with cover images and titles and can be played/viewed.
*/
const discoverBtn = document.getElementById("discover-btn");
if (discoverBtn) {
  discoverBtn.addEventListener("click", (e) => {
    e.preventDefault();
    try {
      // Open the local discover.html page which enumerates saved/shared games.
      window.open(new URL("discover.html", window.location.href).toString(), "_blank");
    } catch (err) {
      // fallback: attempt simple relative open
      window.open("discover.html", "_blank");
    }
  });
}

// Saved Games menu: show list of saved states (uses localStorage keys saved by the Save flow)
const savedGamesBtn = document.getElementById("saved-games-btn");

/*
  SITE_PAGES: pages on the same site that should be treated as "games".
  Each entry can have { id, title, url } and will appear in the Saved Games list.
  In a real site these could be generated server-side or discovered dynamically;
  here we provide a static placeholder that uses the Properties title when available.
*/
/*
  Discover pages on the same origin that are likely created by the studio.
  Priority order:
   1) anchors with data-studio-game (data attributes authoring authors can add)
   2) anchors whose href is same-origin and contains studio-like path segments
   3) fallback: empty list

  Each discovered page yields { id, title, url, site: true } where id is stable-ish.
*/
function discoverStudioPages() {
  const pages = [];
  try {
    const origin = window.location.origin;
    // 1) anchors with explicit marker
    const marked = Array.from(document.querySelectorAll('a[data-studio-game]'));
    marked.forEach((a) => {
      try {
        const href = a.href && a.href.startsWith(origin) ? a.href : null;
        if (!href) return;
        const title = (a.dataset.title || a.textContent || href).trim();
        const id = `site_${btoa(href).slice(0,12)}`;
        pages.push({ id, title: title || href, url: href, encoded: null, savedAt: 0, site: true });
      } catch (e) {}
    });

    // 2) scan anchors for same-origin links containing common studio path segments
    if (pages.length === 0) {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const keywords = ['/studio', '/devdex', '/games', '/game', '/play'];
      anchors.forEach((a) => {
        try {
          const href = a.href;
          if (!href || !href.startsWith(origin)) return;
          // ignore same-page anchors
          if (href === window.location.href) return;
          // look for keywords in path portion
          const path = href.slice(origin.length).toLowerCase();
          if (keywords.some((k) => path.includes(k))) {
            const title = (a.dataset.title || a.textContent || href).trim();
            const id = `site_${btoa(href).slice(0,12)}`;
            // avoid duplicates
            if (!pages.find((p) => p.url === href)) {
              pages.push({ id, title: title || href, url: href, encoded: null, savedAt: 0, site: true });
            }
          }
        } catch (e) {}
      });
    }
  } catch (e) {
    // ignore DOM access errors
  }
  return pages;
}

// Fallback static entry kept minimal (only used if discovery finds nothing)
const SITE_PAGES = [
  // intentionally empty by default; discoverStudioPages will yield local site pages when present
];

function getSavedProjects() {
  try {
    const raw = localStorage.getItem("ministudio_saved_list");
    let list = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed.slice();
      } catch (e) {
        // malformed saved list: ignore
      }
    }

    // Discover studio pages on the same origin dynamically
    const discovered = discoverStudioPages();

    // Map discovered pages to the same record shape we expect
    const siteRecords = discovered.map((p) => ({
      id: p.id || `site_${Math.floor(Math.random() * 1000000)}`,
      title: p.title || p.url,
      url: p.url,
      encoded: null,
      savedAt: 0,
      site: true,
    }));

    // Merge: user-saved list first, discovered site pages after so local saves show first
    return [...list, ...siteRecords];
  } catch (e) {
    // On failure, fall back to any static SITE_PAGES entries
    return SITE_PAGES.map((p) => ({
      id: `site_${p.id}`,
      title: p.title || p.id,
      url: p.url,
      encoded: null,
      savedAt: 0,
      site: true,
    }));
  }
}

function saveProjectRecord(encoded, title = "Untitled") {
  try {
    const list = getSavedProjects();
    list.unshift({
      id: `${Date.now()}_${Math.floor(Math.random()*10000)}`,
      title: title || "Untitled",
      encoded,
      savedAt: Date.now(),
    });
    // keep reasonable maximum
    if (list.length > 25) list.length = 25;
    localStorage.setItem("ministudio_saved_list", JSON.stringify(list));
  } catch (e) {
    console.warn("Failed to record saved project:", e);
  }
}

function showSavedGamesPopup() {
  if (document.getElementById("saved-games-popup")) return;
  const popup = document.createElement("div");
  popup.id = "saved-games-popup";
  popup.className = "info-popup";
  popup.style.minWidth = "320px";
  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div class="title">Saved Games</div>
      <button class="close-btn" type="button">Close</button>
    </div>
    <div id="saved-games-list" style="display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto;padding-top:8px;"></div>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button id="saved-games-refresh" class="toolbox-item" style="flex:1">Refresh</button>
      <button id="saved-games-clear" class="toolbox-item" style="flex:1">Clear All</button>
    </div>
  `;
  document.body.appendChild(popup);

  const closeBtn = popup.querySelector(".close-btn");
  closeBtn.addEventListener("click", () => popup.remove());

  const listEl = document.getElementById("saved-games-list");
  function render() {
    listEl.innerHTML = "";
    const list = getSavedProjects();
    if (list.length === 0) {
      const none = document.createElement("div");
      none.style.color = "#cfeee6";
      none.textContent = "No saved games found.";
      listEl.appendChild(none);
      return;
    }
    list.forEach((rec) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "6px";
      row.style.borderRadius = "6px";
      row.style.background = "#0f0f0f";
      row.style.border = "1px solid rgba(255,255,255,0.03)";
      const left = document.createElement("div");
      left.style.flex = "1";
      left.style.overflow = "hidden";
      left.style.textOverflow = "ellipsis";
      left.style.whiteSpace = "nowrap";
      left.textContent = `${rec.title} · ${new Date(rec.savedAt).toLocaleString()}`;
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "6px";
      const loadBtn = document.createElement("button");
      loadBtn.className = "toolbox-item";
      loadBtn.textContent = "Load";
      loadBtn.style.padding = "6px 8px";
      loadBtn.addEventListener("click", () => {
        try {
          // If this record represents a site page, open it in a new tab (playable)
          if (rec && rec.url) {
            try {
              window.open(rec.url, "_blank");
            } catch (err) {
              window.location.href = rec.url;
            }
            popup.remove();
            return;
          }

          // Otherwise treat as an encoded project state and open it in PLAY/EMBED mode (new tab),
          // so users see the saved game directly, not the editor/studio.
          if (!rec.encoded) {
            alert("No playable data available for this entry.");
            return;
          }

          // Build an embed URL that will open the saved state directly in play/embed mode
          try {
            const urlObj = new URL(window.location.pathname, window.location.origin);
            urlObj.searchParams.set("state", rec.encoded);
            urlObj.searchParams.set("embed", "1");
            // Prefer opening in a new tab so the studio remains available in the current page
            try {
              window.open(urlObj.toString(), "_blank");
            } catch (err) {
              window.location.href = urlObj.toString();
            }
            popup.remove();
            return;
          } catch (err) {
            console.error("Failed to open saved project in play mode:", err);
            alert("Failed to open saved project in play mode.");
            return;
          }
        } catch (e) {
          console.error(e);
          alert("Failed to load saved project.");
        }
      });
      const copyBtn = document.createElement("button");
      copyBtn.className = "toolbox-item";
      copyBtn.textContent = "Copy URL";
      copyBtn.style.padding = "6px 8px";
      copyBtn.addEventListener("click", async () => {
        try {
          // Build permalink URL same as save flow
          const urlObj = new URL(window.location.pathname, window.location.origin);
          urlObj.searchParams.set("state", rec.encoded);
          const final = urlObj.toString();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(final);
            copyBtn.textContent = "Copied";
            setTimeout(()=> (copyBtn.textContent = "Copy URL"), 1400);
          } else {
            const ta = document.createElement("textarea");
            ta.value = final;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            copyBtn.textContent = "Copied";
            setTimeout(()=> (copyBtn.textContent = "Copy URL"), 1400);
          }
        } catch (e) {
          console.error(e);
        }
      });

      actions.appendChild(loadBtn);
      actions.appendChild(copyBtn);
      row.appendChild(left);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }

  const refreshBtn = document.getElementById("saved-games-refresh");
  const clearBtn = document.getElementById("saved-games-clear");
  refreshBtn.addEventListener("click", render);
  clearBtn.addEventListener("click", () => {
    if (!confirm("Clear all saved projects?")) return;
    localStorage.removeItem("ministudio_saved_list");
    render();
  });

  render();

  // allow ESC to close
  function onKey(e) {
    if (e.key === "Escape") popup.remove();
  }
  window.addEventListener("keydown", onKey);
  popup.addEventListener("remove", () => window.removeEventListener("keydown", onKey));
}

if (savedGamesBtn) {
  savedGamesBtn.addEventListener("click", (e) => {
    e.preventDefault();
    showSavedGamesPopup();
  });
}

const playBtn = document.getElementById("play-btn");
const stopBtn = document.getElementById("stop-btn");
const embedBtn = document.getElementById("embed-btn");
const saveBtn = document.getElementById("save-btn");

const propName = document.getElementById("prop-name");
const propX = document.getElementById("prop-x");
const propY = document.getElementById("prop-y");
const propW = document.getElementById("prop-w");
const propH = document.getElementById("prop-h");
const propRotation = document.getElementById("prop-rotation");
const propColor = document.getElementById("prop-color");
const propAction = document.getElementById("prop-action");
const charImageUrlInput = document.getElementById("char-image-url");
const bgMusicFileInput = document.getElementById("bg-music-file");
const bgMusicUrlInput = document.getElementById("bg-music-url");
const bgImageUrlInput = document.getElementById("bg-image-url");
const npcActionSelect = document.getElementById("npc-action");
const npcTextInput = document.getElementById("npc-text");
const npcRangeInput = document.getElementById("npc-range");
const npcRespawnSelect = document.getElementById("npc-respawn");
const joystickContainer = document.getElementById("joystick-container");

const isTouchDevice =
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0 ||
  navigator.msMaxTouchPoints > 0;

let joystickManager = null;

let objects = [];
let selectedId = null;
let currentTool = "select";
let playMode = false;

let player = null;
let lastFrameTime = 0;
let charImage = null;
let charImageReady = false;
let checkpoint = null;

/* Image cache for element images so multiple objects can reuse same Image instance.
   Each cache entry includes a ref count so object-URL blobs are not revoked while
   still in use by other objects. Entry shape: { img, ready, refs, blobUrl? } */
const elementImageCache = new Map(); // url -> { img, ready, refs }

// Terrain material selection & pattern cache
let selectedTerrainMaterial = "grass";
const terrainPatternCache = new Map(); // material -> CanvasPattern or color fallback

// Wire the UI selector (exists in index.html)
// This selector controls the global brush material, and when a terrain object is selected it will reflect/edit that object's material.
const terrainMaterialSelect = document.getElementById("terrain-material-select");
if (terrainMaterialSelect) {
  selectedTerrainMaterial = terrainMaterialSelect.value || "grass";
  terrainMaterialSelect.addEventListener("change", () => {
    const newMat = terrainMaterialSelect.value || "grass";
    selectedTerrainMaterial = newMat;

    // If a terrain object is currently selected, apply the material to that terrain object (and ensure its pattern is refreshed)
    const sel = getSelected ? getSelected() : null;
    if (sel && sel.type === "terrain") {
      sel.material = newMat;
      sel._pattern = createMaterialPattern(newMat);
      // update terrain color fallback for visual consistency
      sel.color = (newMat === "grass" && "#6B8E23") || (newMat === "dirt" && "#7a5230") || (newMat === "rock" && "#6e6e6e") || (newMat === "sand" && "#dcb98a") || sel.color;
      refreshExplorer();
      draw();
      // keep property panel in sync
      syncPropertiesPanel();
    }
  });
}

// Create simple procedural pattern for a material (returns CanvasPattern or color string fallback)
function createMaterialPattern(material) {
  if (terrainPatternCache.has(material)) return terrainPatternCache.get(material);

  // We'll create a small 32x32 tile canvas and attempt to fill it either with a dedicated
  // grass asset (for 'grass') or with procedural fill for other materials.
  const tile = document.createElement("canvas");
  tile.width = 32;
  tile.height = 32;
  const tctx = tile.getContext("2d");

  // Helper to finalize pattern (or color fallback) and cache it
  function finalizePattern(fallbackColor) {
    let pattern = null;
    try {
      pattern = ctx.createPattern(tile, "repeat");
    } catch (e) {
      pattern = null;
    }
    const store = pattern || fallbackColor;
    terrainPatternCache.set(material, store);
    return store;
  }

  if (material === "grass") {
    // Use the supplied grass image asset as the repeating tile when possible.
    // Asset provided by project: /eac53a40e60c4e9c11e1f8e3bd3395509a4d787a.jpeg
    const assetPath = "/eac53a40e60c4e9c11e1f8e3bd3395509a4d787a.jpeg";

    // Fill placeholder so the editor isn't blank while the image loads.
    tctx.fillStyle = "#6B8E23";
    tctx.fillRect(0, 0, tile.width, tile.height);

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          // Draw the image scaled/centered into the 32x32 tile to make a repeating tile.
          // We draw with a 1px bleed (oversize by 2px) so adjacent tiles don't reveal transparent or antialiased edges.
          tctx.clearRect(0, 0, tile.width, tile.height);
          // Maintain aspect by fitting image into tile
          const ar = img.width / img.height;
          let dw = tile.width, dh = tile.height;
          if (ar > 1) {
            // wide image
            dh = Math.round(tile.width / ar);
            dw = tile.width;
          } else {
            // tall image
            dw = Math.round(tile.height * ar);
            dh = tile.height;
          }
          const dx = Math.round((tile.width - dw) / 2);
          const dy = Math.round((tile.height - dh) / 2);
          // enable smoothing for scaled draws and draw slightly larger to bleed edges into neighboring tiles
          tctx.imageSmoothingEnabled = true;
          tctx.drawImage(img, dx - 1, dy - 1, dw + 2, dh + 2);
        } catch (e) {
          // if drawing fails, keep the placeholder fill
          tctx.fillStyle = "#6B8E23";
          tctx.fillRect(0, 0, tile.width, tile.height);
        }
        // Create pattern now that the tile contains the image
        try {
          const p = ctx.createPattern(tile, "repeat");
          terrainPatternCache.set(material, p || "#6B8E23");
        } catch (e) {
          terrainPatternCache.set(material, "#6B8E23");
        }
        // trigger a redraw so terrains update visually
        try { draw(); } catch (e) {}
      };
      img.onerror = () => {
        // keep placeholder color if image fails
        terrainPatternCache.set(material, "#6B8E23");
      };
      img.src = assetPath;
    } catch (e) {
      // If anything goes wrong, fall back to color
      terrainPatternCache.set(material, "#6B8E23");
    }

    // Return placeholder/fallback immediately; pattern will update when image loads
    return finalizePattern("#6B8E23");
  } else if (material === "dirt") {
    tctx.fillStyle = "#7a5230";
    tctx.fillRect(0, 0, 32, 32);
    tctx.fillStyle = "#6a4526";
    for (let x = 0; x < 32; x += 8) {
      for (let y = 0; y < 32; y += 8) {
        tctx.fillRect(x + ((x+y)%16===0?1:3), y + ((x+y)%8===0?1:3), 2, 2);
      }
    }
    return finalizePattern("#7a5230");
  } else if (material === "rock") {
    // Use provided basalt image asset as repeating rock tile when possible.
    const assetPath = "/Material-Basalt.jpg.webp";

    // Fill placeholder so the editor isn't blank while the image loads.
    tctx.fillStyle = "#6e6e6e";
    tctx.fillRect(0, 0, tile.width, tile.height);

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          // Draw the image scaled/centered into the 32x32 tile to make a repeating tile.
          // We draw with a 1px bleed (oversize by 2px) so adjacent tiles don't reveal transparent or antialiased edges.
          tctx.clearRect(0, 0, tile.width, tile.height);
          // Maintain aspect by fitting image into tile
          const ar = img.width / img.height;
          let dw = tile.width, dh = tile.height;
          if (ar > 1) {
            dh = Math.round(tile.width / ar);
            dw = tile.width;
          } else {
            dw = Math.round(tile.height * ar);
            dh = tile.height;
          }
          const dx = Math.round((tile.width - dw) / 2);
          const dy = Math.round((tile.height - dh) / 2);
          // enable smoothing for scaled draws and draw slightly larger to bleed edges into neighboring tiles
          tctx.imageSmoothingEnabled = true;
          tctx.drawImage(img, dx - 1, dy - 1, dw + 2, dh + 2);
        } catch (e) {
          // if drawing fails, keep the placeholder fill
          tctx.fillStyle = "#6e6e6e";
          tctx.fillRect(0, 0, tile.width, tile.height);
        }
        // Create pattern now that the tile contains the image
        try {
          const p = ctx.createPattern(tile, "repeat");
          terrainPatternCache.set(material, p || "#6e6e6e");
        } catch (e) {
          terrainPatternCache.set(material, "#6e6e6e");
        }
        // trigger a redraw so terrains update visually
        try { draw(); } catch (e) {}
      };
      img.onerror = () => {
        // keep placeholder color if image fails
        terrainPatternCache.set(material, "#6e6e6e");
      };
      img.src = assetPath;
    } catch (e) {
      // If anything goes wrong, fall back to color
      terrainPatternCache.set(material, "#6e6e6e");
    }

    // Return placeholder/fallback immediately; pattern will update when image loads
    return finalizePattern("#6e6e6e");
  } else if (material === "sand") {
    // Use provided sand image asset as repeating sand tile when possible.
    const assetPath = "/Material-Sand.jpg.webp";

    // Fill placeholder so the editor isn't blank while the image loads.
    tctx.fillStyle = "#dcb98a";
    tctx.fillRect(0, 0, tile.width, tile.height);

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          tctx.clearRect(0, 0, tile.width, tile.height);
          // Maintain aspect by fitting image into tile
          const ar = img.width / img.height;
          let dw = tile.width, dh = tile.height;
          if (ar > 1) {
            dh = Math.round(tile.width / ar);
            dw = tile.width;
          } else {
            dw = Math.round(tile.height * ar);
            dh = tile.height;
          }
          const dx = Math.round((tile.width - dw) / 2);
          const dy = Math.round((tile.height - dh) / 2);
          tctx.imageSmoothingEnabled = true;
          // draw slightly larger to bleed edges into neighboring tiles
          tctx.drawImage(img, dx - 1, dy - 1, dw + 2, dh + 2);
        } catch (e) {
          tctx.fillStyle = "#dcb98a";
          tctx.fillRect(0, 0, tile.width, tile.height);
        }
        try {
          const p = ctx.createPattern(tile, "repeat");
          terrainPatternCache.set(material, p || "#dcb98a");
        } catch (e) {
          terrainPatternCache.set(material, "#dcb98a");
        }
        try { draw(); } catch (e) {}
      };
      img.onerror = () => {
        terrainPatternCache.set(material, "#dcb98a");
      };
      img.src = assetPath;
    } catch (e) {
      terrainPatternCache.set(material, "#dcb98a");
    }

    return finalizePattern("#dcb98a");
  } else {
    tctx.fillStyle = "#6B8E23";
    tctx.fillRect(0, 0, 32, 32);
    return finalizePattern("#6B8E23");
  }
}

// Only allow persistent localStorage / blob-key saving when we are running top-level
// and same-origin (prevents embedded copies on other sites from storing into the host's localStorage).
const CAN_PERSIST = (() => {
  try {
    // If we're inside an iframe on a different origin, accessing window.top/location may throw.
    // Also avoid persisting when we're embedded (window.top !== window) to be conservative.
    return window.top === window && window.location && window.parent && window.location.origin === window.parent.location.origin;
  } catch (e) {
    return false;
  }
})();

let backgroundMusic = null;
let backgroundMusicUrl = null;

let bgImage = null;
let bgImageReady = false;
let bgImageUrl = null;

let cameraX = 0;
let cameraY = 0;

// map/world logical size (editable via Properties)
let worldWidth = 800;
let worldHeight = 600;

// Lighting state
let lightingMode = "normal"; // "normal" | "dark"
let globalBrightness = 1.0; // 0.0 .. 1.0

let projectiles = [];
let playerFacing = 1; // 1 = right, -1 = left

// TriggerPart assignment state: when true, next explorer selection assigns that object as the action block for the selected TriggerPart
let awaitingTriggerAssign = false;
let triggerAssignForId = null;

const deathSound = new Audio("oof.mp3");
deathSound.volume = 0.6;

function playDeathSound() {
  try {
    deathSound.currentTime = 0;
    deathSound.play();
  } catch (e) {
    // ignore play errors (e.g., autoplay restrictions)
  }
}

const keys = {
  left: false,
  right: false,
  up: false,
};

let pointerState = {
  active: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  mode: null, // 'move' | 'resize'
  targetId: null,
};

let nextId = 1;

/* Glue (stick) UI: when two colliding blocks touch and the pointer is near their contact region
   show a small '+' button to allow the user to glue them together (make them stay attached). */
const glueBtn = (function createGlueButton() {
  const btn = document.createElement("button");
  btn.id = "glue-btn";
  btn.textContent = "+";
  btn.title = "Glue blocks";
  btn.style.position = "absolute";
  btn.style.width = "36px";
  btn.style.height = "36px";
  btn.style.borderRadius = "18px";
  btn.style.border = "none";
  btn.style.background = "#0e5c9f";
  btn.style.color = "#fff";
  btn.style.fontSize = "20px";
  btn.style.display = "none";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.cursor = "pointer";
  btn.style.zIndex = 60;
  btn.style.pointerEvents = "auto";
  // attach to viewport parent so positioning can use getBoundingClientRect easily
  (viewport.parentElement || document.body).appendChild(btn);
  return btn;
})();

/* Current glue hint state */
let currentGlueHint = {
  visible: false,
  aId: null,
  bId: null,
  worldX: 0,
  worldY: 0,
};

/* Determine if two objects are touching (conservative with AABB overlap)
   Seats are considered "colliding-like" for the purposes of glue UI (so seats can be glued to colliding blocks). */
function objectsTouching(a, b) {
  if (!a || !b) return false;
  const collidingLike = (t) => t === "colliding" || t === "seat";
  // Only consider colliding-like pairs for this glue/attachment feature
  if (!collidingLike(a.type) || !collidingLike(b.type)) return false;
  const A = getAABBForObject(a);
  const B = getAABBForObject(b);
  // Consider them touching if AABB overlap by at least 1px (or edges adjacent)
  return !(A.x > B.x + B.w || A.x + A.w < B.x || A.y > B.y + B.h || A.y + A.h < B.y);
}

/* Find nearest contact point (world coords) between two AABBs */
function computeContactPointForAABBs(a, b) {
  const A = getAABBForObject(a);
  const B = getAABBForObject(b);
  // compute overlap rectangle center as approximate contact
  const ox = Math.max(A.x, B.x);
  const oy = Math.max(A.y, B.y);
  const ow = Math.max(0, Math.min(A.x + A.w, B.x + B.w) - ox);
  const oh = Math.max(0, Math.min(A.y + A.h, B.y + B.h) - oy);
  if (ow > 0 && oh > 0) {
    return { x: ox + ow / 2, y: oy + oh / 2 };
  }
  // if only edge-adjacent, pick midpoint between nearest edges
  const cx = (Math.max(A.x, B.x) + Math.min(A.x + A.w, B.x + B.w)) / 2;
  const cy = (Math.max(A.y, B.y) + Math.min(A.y + A.h, B.y + B.h)) / 2;
  return { x: cx, y: cy };
}

/* Show/hide glue button based on pointer world position and touching colliding group (up to 9) */
function updateGlueHintForPointer(worldX, worldY) {
  // Only in editor select mode and when not playing
  if (playMode || currentTool !== "select") {
    currentGlueHint.visible = false;
    glueBtn.style.display = "none";
    return;
  }

  // Find a cluster of touching colliding-like objects whose contact region is near the pointer.
  // We'll gather up to MAX_GROUP objects that are mutually touching (via AABB overlap graph).
  const THRESH = 24; // pixels in world space
  const MAX_GROUP = 9;

  // helper: treat both colliding blocks and seats as glue-candidates
  const isGlueCandidate = (o) => o && (o.type === "colliding" || o.type === "seat");

  // Collect candidate colliding-like objects that are touching any other colliding-like object
  const candidates = [];
  for (let i = objects.length - 1; i >= 0; i--) {
    const a = objects[i];
    if (!isGlueCandidate(a)) continue;
    for (let j = objects.length - 1; j >= 0; j--) {
      if (i === j) continue;
      const b = objects[j];
      if (!isGlueCandidate(b)) continue;
      if (objectsTouching(a, b)) {
        // compute approximate contact point for this pair and keep if pointer is nearby
        const pt = computeContactPointForAABBs(a, b);
        const dist = Math.hypot(worldX - pt.x, worldY - pt.y);
        if (dist <= THRESH) {
          candidates.push({ a, b, pt, dist });
        }
      }
    }
  }

  if (candidates.length === 0) {
    currentGlueHint.visible = false;
    glueBtn.style.display = "none";
    currentGlueHint.aId = currentGlueHint.bId = null;
    currentGlueHint.ids = [];
    return;
  }

  // Build a unique set of object ids from nearby candidate pairs, preserving draw-order priority.
  const idsSet = new Set();
  // iterate candidates in order of proximity (closer contact prioritized), but also prefer topmost draw order by sorting by dist then by max index
  candidates.sort((p, q) => p.dist - q.dist);
  for (const c of candidates) {
    // add both endpoints
    idsSet.add(c.a.id);
    idsSet.add(c.b.id);
    if (idsSet.size >= MAX_GROUP) break;
  }

  const ids = Array.from(idsSet).slice(0, MAX_GROUP);
  if (ids.length === 0) {
    currentGlueHint.visible = false;
    glueBtn.style.display = "none";
    currentGlueHint.ids = [];
    return;
  }

  // Compute an approximate contact centroid from the included pairs to position the + button
  let cx = 0, cy = 0, count = 0;
  for (const c of candidates) {
    if (idsSet.has(c.a.id) && idsSet.has(c.b.id)) {
      cx += c.pt.x;
      cy += c.pt.y;
      count++;
    }
  }
  if (count === 0) {
    // fallback: use first object's center
    const o = objects.find(o => o.id === ids[0]);
    cx = o ? o.x + o.w / 2 : worldX;
    cy = o ? o.y + o.h / 2 : worldY;
  } else {
    cx /= count;
    cy /= count;
  }

  // Position + button in screen space near the centroid
  const rect = viewport.getBoundingClientRect();
  const scaleX = rect.width / viewport.width;
  const scaleY = rect.height / viewport.height;
  const screenX = Math.round((cx - (cameraX || 0)) * scaleX + rect.left);
  const screenY = Math.round((cy - (cameraY || 0)) * scaleY + rect.top);

  glueBtn.style.left = (screenX - 18) + "px";
  glueBtn.style.top = (screenY - 18) + "px";
  glueBtn.style.display = "flex";
  currentGlueHint.visible = true;
  // store the group ids for the glue action
  currentGlueHint.ids = ids;
  currentGlueHint.worldX = cx;
  currentGlueHint.worldY = cy;
}

/* Perform glue action: make two objects stick together by marking a gluedTo property and disabling dynamic on both.
   Also zero their runtime velocities and keep them colocated relative to one another (editor mode). */
function performGlue(aId, bId) {
  const a = objects.find((o) => o.id === aId);
  const b = objects.find((o) => o.id === bId);
  if (!a || !b) return;
  // mark glue relation both ways
  a.gluedTo = a.gluedTo || [];
  b.gluedTo = b.gluedTo || [];
  if (!a.gluedTo.includes(b.id)) a.gluedTo.push(b.id);
  if (!b.gluedTo.includes(a.id)) b.gluedTo.push(a.id);

  // Keep both objects dynamic so the physics system still affects them during play.
  // Zero small runtime velocities to avoid sudden pops on glue action in editor.
  if (a.type === "colliding") {
    a.vx = a.vx || 0;
    a.vy = a.vy || 0;
    a.angularVelocity = a.angularVelocity || 0;
  }
  if (b.type === "colliding") {
    b.vx = b.vx || 0;
    b.vy = b.vy || 0;
    b.angularVelocity = b.angularVelocity || 0;
  }

  // Snap b to a's current relative position now and store the rest offset so the constraint can be enforced at runtime.
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const offset = { x: bx - ax, y: by - ay };

  // store offset on both sides for robust lookup
  if (!a._glueOffsets) a._glueOffsets = {};
  if (!b._glueOffsets) b._glueOffsets = {};
  a._glueOffsets[b.id] = offset;
  b._glueOffsets[a.id] = { x: -offset.x, y: -offset.y };

  // Mark a lightweight constraint record so runtime enforcement can iterate efficiently
  if (!a._glueRecords) a._glueRecords = new Set();
  if (!b._glueRecords) b._glueRecords = new Set();
  a._glueRecords.add(b.id);
  b._glueRecords.add(a.id);

  // Update UI
  refreshExplorer();
  draw();
}

/* Wire glue button click (supports gluing up to 9 objects together) */
glueBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (!currentGlueHint.visible || !Array.isArray(currentGlueHint.ids) || currentGlueHint.ids.length === 0) return;

  const ids = currentGlueHint.ids.slice();
  // If only one id (edge-case), nothing to glue.
  if (ids.length < 2) {
    currentGlueHint.visible = false;
    glueBtn.style.display = "none";
    return;
  }

  // Glue all members to the first one (create pairwise glue relations)
  const masterId = ids[0];
  for (let i = 1; i < ids.length; i++) {
    performGlue(masterId, ids[i]);
  }

  // hide button after glue
  currentGlueHint.visible = false;
  glueBtn.style.display = "none";
  currentGlueHint.ids = [];
});

/* Helpers */

function createObject(type) {
  const baseSize = 70;
  const x = viewport.width / 2 - baseSize / 2;
  const y = viewport.height / 2 - baseSize / 2;

  let w = baseSize;
  let h = baseSize;
  let color = "#f44336";

  if (type === "platform") {
    w = baseSize * 1.8;
    h = baseSize * 0.5;
    color = "#c0c0c0";
  } else if (type === "spawn") {
    color = "#4caf50";
  } else if (type === "sword") {
    w = baseSize * 0.3;
    h = baseSize * 1.4;
    color = "#ffc107";
  } else if (type === "blaster") {
    w = baseSize * 0.6;
    h = baseSize * 0.4;
    color = "#03a9f4";
  } else if (type === "npc") {
    w = baseSize * 0.9;
    h = baseSize * 1.2;
    color = "#9c27b0";
  } else if (type === "light") {
    // light block is small by default
    w = baseSize * 0.6;
    h = baseSize * 0.6;
    color = "#ffd54f";
  } else if (type === "iframe") {
    // iframe block: represents an embeddable HTML region; visually larger by default
    w = baseSize * 1.6;
    h = baseSize * 1.0;
    color = "#6A5ACD";
  }

  const obj = {
    id: nextId++,
    type,
    name: `${type[0].toUpperCase()}${type.slice(1)}_${nextId - 1}`,
    x,
    y,
    w,
    h,
    color,
    action: "none",
    visible: true,
    // ensure every new object has explicit rotation state so Properties rotation works immediately
    angle: 0,
    angularVelocity: 0,
  };

  // For iframe blocks, initialize editable HTML content after obj exists
  if (type === "iframe") {
    obj.html = "<div>\n  <!-- paste HTML here -->\n</div>";
  }

  if (type === "light") {
    // intensity 0..1 controls brightness of the light, radius in px
    obj.intensity = 0.9;
    obj.radius = 140;
  }

  if (type === "colliding") {
    // Basic physics properties for colliding blocks
    obj.mass = 1.0; // kg-like unit
    obj.friction = 0.15; // simple linear friction applied to velocity each second
    obj.dynamic = true; // whether it responds to pushes
    // small restitution so objects get a little vertical bounce from impacts
    obj.restitution = 0.06;
    // runtime velocity for physics simulation
    obj.vx = 0;
    obj.vy = 0;
    // rotation state (angle in radians) and angular velocity for tipping
    obj.angle = 0;
    obj.angularVelocity = 0;
    // compute a simple rectangular moment of inertia approximation: I = mass * (w^2 + h^2) / 12
    // will be updated if w/h/mass change in properties
    obj._inertia = obj.mass * ((obj.w * obj.w + obj.h * obj.h) / 12) || 1;
  } else if (type === "terrain") {
    // terrain blocks: non-dynamic solid ground created by brush
    obj.color = "#6B8E23"; // olive/terrain color
    obj.w = baseSize * 0.5;
    obj.h = baseSize * 0.4;
    // terrain is static solid (not dynamic physics block)
    obj.dynamic = false;
    // assign current selected material so newly created terrain shows textured tiles
    obj.material = selectedTerrainMaterial || "grass";
    obj.stamps = []; // allow this terrain to collect brush stamps if user paints into it
    // prepare initial pattern (may update asynchronously if asset loads)
    obj._pattern = createMaterialPattern(obj.material);
  }

  if (type === "triggerpart") {
    // trigger part controls visibility/interactivity of other elements
    obj.triggerTarget = ""; // e.g., "player"
    obj.color = "#ff6f00";
    // trigger parts are non-solid by default
    obj.w = baseSize * 0.9;
    obj.h = baseSize * 0.3;
  } else if (type === "seat") {
    // Seats are small platform-like objects that can be glued to colliding blocks.
    // Provide lightweight runtime motion fields so glue constraints can move seats during play.
    w = baseSize * 0.9;
    h = baseSize * 0.4;
    color = "#795548";
    obj.vx = 0;
    obj.vy = 0;
    obj.dynamic = false; // seats are moved via glue constraints when attached
    // store friendly name
    obj.name = `Seat_${nextId - 1}`;
  }

  if (type === "npc") {
    obj.npcAction = "none";
    obj.npcText = "";
    obj.npcRange = 80;
    obj.npcRespawn = false;
    obj.playerNear = false;
    obj.vx = 0;
    obj.vy = 0;
    obj.onGround = false;
    obj.jumpTimer = 0;
    // store original spawn position for respawn behavior
    obj.spawnX = x;
    obj.spawnY = y;
  }

  objects.push(obj);
  // After adding a new object, apply trigger rules (in case a TriggerPart reveals things)
  applyTriggers();
  setSelected(obj.id);
  refreshExplorer();
  draw();
}

/* Create/merge terrain: build freeform terrain by recording brush stamps (polygons) into a single terrain object.
   Each terrain object keeps an array of stamp rects; rendering composes them into one filled path and selection
   uses the combined bounding box for hit-testing. */
function createTerrainAt(localX, localY) {
  // localX/Y are world coords passed in by callers (already camera-adjusted).
  // Use a brush that intentionally creates overlapping, slightly rounded stamps to avoid seams.
  const baseSize = 70;
  // make stamp a bit larger and slightly rectangular for better blending
  const stampW = Math.round(baseSize * 0.56);
  const stampH = Math.round(baseSize * 0.44);
  // offset so stamps interleave more (helps continuous strokes)
  const stampX = Math.round(localX - stampW / 2);
  const stampY = Math.round(localY - stampH / 2);

  // Find an existing terrain object with the same material to merge into.
  let terrain = objects.find((o) => o.type === "terrain" && o.material === selectedTerrainMaterial);

  // Expand each stamp slightly so adjacent stamps overlap (prevents 1px gaps)
  const overlap = 2; // pixels to expand each stamp on all sides
  const stamp = { x: stampX - overlap, y: stampY - overlap, w: stampW + overlap * 2, h: stampH + overlap * 2, r: Math.round(Math.min(stampW, stampH) * 0.28) };

  if (!terrain) {
    // Create a new terrain object that collects stamps for freeform shapes
    terrain = {
      id: nextId++,
      type: "terrain",
      name: `Terrain_${nextId - 1}`,
      x: stamp.x,
      y: stamp.y,
      w: stamp.w,
      h: stamp.h,
      color: "#6B8E23",
      action: "none",
      visible: true,
      dynamic: false,
      material: selectedTerrainMaterial,
      stamps: [stamp], // store individual brush stamps (with radius)
      _pattern: null,
    };
    objects.push(terrain);
  } else {
    // Append stamp and expand bounding box to include it
    terrain.stamps = terrain.stamps || [];
    terrain.stamps.push(stamp);

    const minX = Math.min(terrain.x, stamp.x);
    const minY = Math.min(terrain.y, stamp.y);
    const maxX = Math.max(terrain.x + terrain.w, stamp.x + stamp.w);
    const maxY = Math.max(terrain.y + terrain.h, stamp.y + stamp.h);
    terrain.x = Math.round(minX);
    terrain.y = Math.round(minY);
    terrain.w = Math.max(8, Math.round(maxX - minX));
    terrain.h = Math.max(8, Math.round(maxY - minY));
  }

  // Ensure the terrain object has its material pattern prepared
  terrain._pattern = createMaterialPattern(terrain.material || selectedTerrainMaterial);

  refreshExplorer();
  draw();
}

function refreshExplorer() {
  explorerList.innerHTML = "";
  // Only show objects in explorer if they are visible (allow TriggerParts to reveal/hide objects)
  objects.forEach((obj) => {
    if (obj.visible === false) return;
    const li = document.createElement("li");
    li.className = "explorer-item" + (obj.id === selectedId ? " selected" : "");
    li.dataset.id = obj.id;

    const span = document.createElement("span");
    span.textContent = obj.name;

    li.appendChild(span);
    explorerList.appendChild(li);
  });
}

function setSelected(id) {
  selectedId = id;
  refreshExplorer();
  syncPropertiesPanel();
  draw();
}

function getSelected() {
  return objects.find((o) => o.id === selectedId) || null;
}

/* Properties */

function syncPropertiesPanel() {
  const obj = getSelected();
  if (!obj) {
    propName.value = "";
    // element image URL
    const propImageUrl = document.getElementById("prop-image-url");
    if (propImageUrl) propImageUrl.value = "";
    propX.value = "";
    propY.value = "";
    propW.value = "";
    propH.value = "";
    propColor.value = "#000000";
    propAction.value = "none";
    const triggerSelect = document.getElementById("prop-trigger-target");
    if (triggerSelect) triggerSelect.value = "";
    if (npcActionSelect && npcTextInput && npcRangeInput && npcRespawnSelect) {
      npcActionSelect.value = "none";
      npcTextInput.value = "";
      npcRangeInput.value = "";
      npcRespawnSelect.value = "no";
    }
    // clear light-specific inputs if present
    const lightIntensity = document.getElementById("prop-light-intensity");
    const lightRadius = document.getElementById("prop-light-radius");
    if (lightIntensity) lightIntensity.value = "";
    if (lightRadius) lightRadius.value = "";
    // clear iframe html
    const iframeHtml = document.getElementById("prop-iframe-html");
    if (iframeHtml) iframeHtml.value = "";
    return;
  }
  propName.value = obj.name;
  // element image URL
  const propImageUrl = document.getElementById("prop-image-url");
  if (propImageUrl) propImageUrl.value = obj.imageUrl || "";
  propX.value = Math.round(obj.x);
  propY.value = Math.round(obj.y);
  propW.value = Math.round(obj.w);
  propH.value = Math.round(obj.h);
  // Rotation (degrees) shown in properties; objects store angle in radians (colliding uses obj.angle)
  const propRotation = document.getElementById("prop-rotation");
  if (propRotation) propRotation.value = typeof obj.angle === "number" ? Math.round((obj.angle * 180) / Math.PI) : 0;
  propColor.value = obj.color;
  propAction.value = obj.action || "none";
  // TriggerPart specific
  const triggerSelect = document.getElementById("prop-trigger-target");
  if (triggerSelect) triggerSelect.value = obj.triggerTarget || "";
  // Iframe-specific HTML editor
  const iframeHtml = document.getElementById("prop-iframe-html");
  if (iframeHtml) {
    iframeHtml.value = obj.type === "iframe" ? (obj.html || "") : "";
  }

  // If the selected object is terrain, show/sync the terrain material selector so user can edit that terrain's material directly.
  if (obj.type === "terrain") {
    // Ensure the global material selector reflects this terrain object
    try {
      if (terrainMaterialSelect) {
        terrainMaterialSelect.value = obj.material || selectedTerrainMaterial || "grass";
      }
    } catch (e) {}
  }

  if (obj.type === "light") {
    // populate light-specific controls if present
    const lightIntensity = document.getElementById("prop-light-intensity");
    const lightRadius = document.getElementById("prop-light-radius");
    if (lightIntensity) lightIntensity.value = typeof obj.intensity === "number" ? obj.intensity : 1;
    if (lightRadius) lightRadius.value = typeof obj.radius === "number" ? Math.round(obj.radius) : 120;
  }

  if (obj.type === "colliding") {
    const massInput = document.getElementById("prop-mass");
    const frictionInput = document.getElementById("prop-friction");
    const dynInput = document.getElementById("prop-dynamic");
    if (massInput) massInput.value = typeof obj.mass === "number" ? obj.mass : 1.0;
    if (frictionInput) frictionInput.value = typeof obj.friction === "number" ? obj.friction : 0.15;
    if (dynInput) dynInput.value = obj.dynamic ? "yes" : "no";
  } else {
    const massInput = document.getElementById("prop-mass");
    const frictionInput = document.getElementById("prop-friction");
    const dynInput = document.getElementById("prop-dynamic");
    if (massInput) massInput.value = "";
    if (frictionInput) frictionInput.value = "";
    if (dynInput) dynInput.value = "yes";
  }

  // If this object is a triggerpart, ensure trigger UI is shown and synced
  if (obj.type === "triggerpart") {
    const triggerSelect = document.getElementById("prop-trigger-target");
    if (triggerSelect) triggerSelect.value = obj.triggerTarget || "";
  }

  if (npcActionSelect && npcTextInput && npcRangeInput && npcRespawnSelect) {
    if (obj.type === "npc") {
      npcActionSelect.value = obj.npcAction || "none";
      npcTextInput.value = obj.npcText || "";
      npcRangeInput.value = Math.round(
        obj.npcRange != null ? obj.npcRange : 80
      );
      npcRespawnSelect.value = obj.npcRespawn ? "yes" : "no";
    } else {
      npcActionSelect.value = "none";
      npcTextInput.value = "";
      npcRangeInput.value = "";
      npcRespawnSelect.value = "no";
    }
  }
}

function applyPropertiesFromInputs() {
  const obj = getSelected();
  if (!obj) return;
  obj.name = propName.value || obj.name;
  // element image url support
  const propImageUrl = document.getElementById("prop-image-url");
  if (propImageUrl) {
    const url = (propImageUrl.value || "").trim() || null;
    if (url !== obj.imageUrl) {
      setElementImageFromUrl(obj, url);
    }
  }
  obj.x = Number(propX.value) || obj.x;
  obj.y = Number(propY.value) || obj.y;
  obj.w = Math.max(10, Number(propW.value) || obj.w);
  obj.h = Math.max(10, Number(propH.value) || obj.h);
  // Read rotation (degrees) from Properties UI and store as radians on the object.
  // Apply rotation for any object so visuals and collision AABB (for colliding blocks) reflect the property immediately.
  const propRotation = document.getElementById("prop-rotation");
  if (propRotation) {
    const deg = Number(propRotation.value);
    if (!Number.isNaN(deg)) {
      // store angle in radians on the object for drawing and collision math
      let rad = (deg * Math.PI) / 180;
      // Normalize angle to [-PI, PI] to avoid runaway values
      if (rad > Math.PI) rad = ((rad + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (rad < -Math.PI) rad = ((rad - Math.PI) % (Math.PI * 2)) + Math.PI;
      obj.angle = rad;

      // For colliding blocks, recompute approximate moment of inertia when size/mass/angle change
      if (obj.type === "colliding") {
        try {
          obj._inertia = (typeof obj.mass === "number" ? obj.mass : 1) * ((obj.w * obj.w + obj.h * obj.h) / 12) || 1;
        } catch (e) {
          obj._inertia = 1;
        }
        // Ensure any dependent cached AABB is consistent by forcing a recalculation on next usage.
        // Optionally compute AABB now to keep immediate hit-tests correct.
        try {
          const aabb = getAABBForObject(obj);
          // store a small hint (not required elsewhere but helpful for debugging)
          obj._lastAABB = aabb;
        } catch (e) {}
      }
    }
  }
  obj.color = propColor.value || obj.color;
  obj.action = propAction.value || obj.action || "none";

  // If the object is configured as a "Leg", ensure it has an anchor point (a rope pivot) stored.
  // Default anchor is above the block so it appears suspended.
  if (obj.action === "leg") {
    if (!obj.legAnchor) {
      obj.legAnchor = { x: Math.round(obj.x + obj.w / 2), y: Math.round(obj.y - Math.max(40, Math.round(obj.h * 0.9))) };
    }
  } else {
    // clear transient leg anchor in editor when action changed away from leg (keeps state tidy)
    // but preserve if present in case user toggles back quickly
    // (no-op for now to avoid unexpected deletion)
  }

  // Iframe HTML: store editable HTML content when editing an iframe block
  if (obj.type === "iframe") {
    const iframeHtml = document.getElementById("prop-iframe-html");
    if (iframeHtml) {
      obj.html = iframeHtml.value || obj.html || "";
    }
  }

  if (obj.type === "light") {
    const lightIntensity = document.getElementById("prop-light-intensity");
    const lightRadius = document.getElementById("prop-light-radius");
    if (lightIntensity) {
      const v = Number(lightIntensity.value);
      if (!Number.isNaN(v)) obj.intensity = Math.max(0, Math.min(1, v));
    }
    if (lightRadius) {
      const r = Number(lightRadius.value);
      if (!Number.isNaN(r)) obj.radius = Math.max(8, r);
    }
    // keep light spawn in sync when moved in editor (for potential respawn behavior)
    obj.spawnX = obj.x;
    obj.spawnY = obj.y;
  }

  if (obj.type === "npc" && npcActionSelect && npcTextInput) {
    obj.npcAction = npcActionSelect.value || "none";
    obj.npcText = npcTextInput.value || "";
    obj.npcRange = Number(npcRangeInput.value) || obj.npcRange || 80;
    if (npcRespawnSelect) {
      obj.npcRespawn = npcRespawnSelect.value === "yes";
    }
    // keep NPC spawn position in sync with editor changes
    obj.spawnX = obj.x;
    obj.spawnY = obj.y;
  }

  if (obj.type === "colliding") {
    const massInput = document.getElementById("prop-mass");
    const frictionInput = document.getElementById("prop-friction");
    const dynInput = document.getElementById("prop-dynamic");
    const m = Number(massInput && massInput.value);
    if (!Number.isNaN(m) && m > 0) obj.mass = m;
    const f = Number(frictionInput && frictionInput.value);
    if (!Number.isNaN(f)) obj.friction = Math.max(0, Math.min(1, f));
    if (dynInput) obj.dynamic = dynInput.value === "yes";
    // runtime velocity should remain if present
    if (typeof obj.vx !== "number") obj.vx = 0;
    if (typeof obj.vy !== "number") obj.vy = 0;
    // Recompute simple rectangular moment of inertia when mass/size change so rotation behaves correctly.
    try {
      obj._inertia = obj.mass * ((obj.w * obj.w + obj.h * obj.h) / 12) || 1;
    } catch (e) {
      obj._inertia = 1;
    }
  }

  // TriggerPart: apply trigger target and refresh trigger effects
  if (obj.type === "triggerpart") {
    const triggerSelect = document.getElementById("prop-trigger-target");
    if (triggerSelect) {
      obj.triggerTarget = triggerSelect.value || "";
    }
    // Ensure trigger-side effects are applied immediately
    applyTriggers();
  }

  refreshExplorer();
  draw();
}

/* Drawing */

function drawGrid() {
  const size = 20;
  ctx.save();
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;

  for (let x = 0; x < viewport.width; x += size) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, viewport.height);
    ctx.stroke();
  }

  for (let y = 0; y < viewport.height; y += size) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(viewport.width, y + 0.5);
    ctx.stroke();
  }

  // center crosshair
  ctx.strokeStyle = "#2e2e2e";
  ctx.beginPath();
  ctx.moveTo(viewport.width / 2, 0);
  ctx.lineTo(viewport.width / 2, viewport.height);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, viewport.height / 2);
  ctx.lineTo(viewport.width, viewport.height / 2);
  ctx.stroke();

  ctx.restore();
}

function drawBackground() {
  // Draw either the background image stretched to the viewport or a solid default background.
  if (bgImage && bgImageReady) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bgImage, 0, 0, viewport.width, viewport.height);
    ctx.restore();
  } else {
    ctx.fillStyle = "#151515";
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  }

  // Draw the configured world/map boundary so the designer can see the playable area.
  // The boundary is drawn in world space (respect camera translation), so callers of draw()
  // should have already applied ctx.translate(-cameraX, -cameraY) when rendering the world.
  try {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.fillStyle = "rgba(255,255,255,0.02)";

    // Ensure sensible numeric values
    const w = Math.max(100, typeof worldWidth === "number" ? Math.round(worldWidth) : viewport.width);
    const h = Math.max(100, typeof worldHeight === "number" ? Math.round(worldHeight) : viewport.height);

    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.fill();
    ctx.stroke();

    // Draw small size label in the top-left corner of the map boundary
    ctx.setLineDash([]);
    ctx.font = "12px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.textBaseline = "top";
    ctx.fillText(`${w}×${h}`, 6, 6);
    ctx.restore();
  } catch (e) {
    // don't break drawing if something goes wrong
    ctx.restore && ctx.restore();
  }
}

function drawProjectiles() {
  ctx.save();
  ctx.fillStyle = "#ffee58";
  projectiles.forEach((p) => {
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.fill();
  });
  ctx.restore();
}

function drawObjects() {
  objects.forEach((obj) => {
    // Skip invisible objects (may be hidden until a trigger reveals them)
    if (obj.visible === false) return;
    ctx.save();

    // Track whether this object was rendered with a rotation transform so we can avoid drawing
    // a secondary axis-aligned stroke/handles afterwards. Declare here so it's in scope for all cases.
    let rotatedRendered = false;

    // Terrain objects use their material pattern (stamp/brush visuals).
    if (obj.type === "terrain") {
      // prepare pattern if not present
      if (!obj._pattern) obj._pattern = createMaterialPattern(obj.material || "grass");
      try {
        // If terrain stores stamps, compose a single freeform path from them
        if (Array.isArray(obj.stamps) && obj.stamps.length > 0) {
          ctx.save();
          // Use pattern when available, otherwise fallback to color
          if (obj._pattern && typeof obj._pattern !== "string") {
            ctx.fillStyle = obj._pattern;
          } else {
            ctx.fillStyle = obj._pattern || obj.color || "#6B8E23";
          }

          // Draw each stamp as a rounded rect and fill each individually so overlaps blend without seams.
          // We intentionally draw each stamp separately (not a single large path) so the pattern/tile aligns per-stamp
          // and small floating gaps are covered by the overlap added when stamps were created.
          obj.stamps.forEach((s) => {
            const rx = Math.max(0, s.r || Math.round(Math.min(s.w, s.h) * 0.25));
            // build rounded rect path
            ctx.beginPath();
            const x0 = s.x, y0 = s.y, w0 = s.w, h0 = s.h, r0 = Math.min(rx, w0/2, h0/2);
            ctx.moveTo(x0 + r0, y0);
            ctx.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r0);
            ctx.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r0);
            ctx.arcTo(x0, y0 + h0, x0, y0, r0);
            ctx.arcTo(x0, y0, x0 + w0, y0, r0);
            ctx.closePath();
            // Fill each stamp; overlapping areas will simply repaint ensuring continuous surface
            ctx.fill();
          });

          ctx.restore();
        } else {
          // backward-compat: single-rect terrain (older saved state)
          if (obj._pattern && typeof obj._pattern !== "string") {
            ctx.fillStyle = obj._pattern;
            ctx.beginPath();
            const rx = Math.round(Math.min(obj.w, obj.h) * 0.18);
            const x0 = obj.x, y0 = obj.y, w0 = obj.w, h0 = obj.h, r0 = Math.min(rx, w0/2, h0/2);
            ctx.moveTo(x0 + r0, y0);
            ctx.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r0);
            ctx.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r0);
            ctx.arcTo(x0, y0 + h0, x0, y0, r0);
            ctx.arcTo(x0, y0, x0 + w0, y0, r0);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillStyle = obj._pattern || obj.color;
            // draw with a small corner radius to match stamped look
            const rx = Math.round(Math.min(obj.w, obj.h) * 0.18);
            const x0 = obj.x, y0 = obj.y, w0 = obj.w, h0 = obj.h, r0 = Math.min(rx, w0/2, h0/2);
            ctx.beginPath();
            ctx.moveTo(x0 + r0, y0);
            ctx.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r0);
            ctx.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r0);
            ctx.arcTo(x0, y0 + h0, x0, y0, r0);
            ctx.arcTo(x0, y0, x0 + w0, y0, r0);
            ctx.closePath();
            ctx.fill();
          }
        }
      } catch (e) {
        ctx.fillStyle = obj.color || "#6B8E23";
        ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      }
    } else {
          // Generic rotated rendering: if the object has a non-zero angle, render it rotated.
      rotatedRendered = false;
      const hasRotation = typeof obj.angle === "number" && Math.abs(obj.angle) > 1e-6;
      if (hasRotation) {
        ctx.save();
        // rotate around center
        const cx = obj.x + obj.w / 2;
        const cy = obj.y + obj.h / 2;
        ctx.translate(cx, cy);
        ctx.rotate(obj.angle || 0);
        ctx.translate(-cx, -cy);
        // draw either image or filled rect inside rotation transform
        if (obj._img && obj._imgReady) {
          try {
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(obj._img, obj.x, obj.y, obj.w, obj.h);
          } catch (e) {
            ctx.fillStyle = obj.color;
            ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
          }
        } else {
          ctx.fillStyle = obj.color;
          ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
        }
        // draw selection/stroke inside the rotated context if selected
        if (obj.id === selectedId) {
          ctx.strokeStyle = "#ffd54f";
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1;
        }
        ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
        // draw resize handle also inside rotated context if selected
        if (obj.id === selectedId) {
          const handleSize = 8;
          ctx.fillStyle = "#ffd54f";
          ctx.beginPath();
          ctx.rect(
            obj.x + obj.w - handleSize,
            obj.y + obj.h - handleSize,
            handleSize,
            handleSize
          );
          ctx.fill();
        }
        ctx.restore();
        rotatedRendered = true;
      } else {
        // If the object has a loaded image, draw it with image smoothing and preserve its color stroke.
        if (obj._img && obj._imgReady) {
          ctx.imageSmoothingEnabled = true;
          try {
            ctx.drawImage(obj._img, obj.x, obj.y, obj.w, obj.h);
          } catch (e) {
            // If drawing fails fall back to solid fill
            ctx.fillStyle = obj.color;
            ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
          }
        } else {
          ctx.fillStyle = obj.color;
          ctx.beginPath();
          ctx.rect(obj.x, obj.y, obj.w, obj.h);
          ctx.fill();
        }
      }
    }

    // If this colliding object was already rendered with rotation above, we've already drawn its stroke/handle
    // inside that rotated context. Skip the axis-aligned stroke in that case.
    if (!rotatedRendered) {
      ctx.strokeStyle = obj.id === selectedId ? "#ffd54f" : "#000000";
      ctx.lineWidth = obj.id === selectedId ? 2 : 1;
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);

      if (obj.id === selectedId) {
        // resize handle
        const handleSize = 8;
        ctx.fillStyle = "#ffd54f";
        ctx.beginPath();
        ctx.rect(
          obj.x + obj.w - handleSize,
          obj.y + obj.h - handleSize,
          handleSize,
          handleSize
        );
        ctx.fill();
      }
    }

    // NPC speech bubble when player is near and NPC talks
    if (
      playMode &&
      obj.type === "npc" &&
      obj.npcAction === "talk" &&
      obj.playerNear &&
      obj.npcText
    ) {
      const paddingX = 6;
      const paddingY = 4;
      const maxWidth = 160;
      ctx.font = "11px system-ui";
      ctx.textBaseline = "top";

      const text = obj.npcText;
      const metrics = ctx.measureText(text);
      const textWidth = Math.min(metrics.width, maxWidth);
      const bubbleWidth = textWidth + paddingX * 2;
      const bubbleHeight = 18 + paddingY * 2;

      const bx = obj.x + obj.w / 2 - bubbleWidth / 2;
      const by = obj.y - bubbleHeight - 6;

      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, bx + paddingX, by + paddingY);
    }

    ctx.restore();
  });

  // Draw rope-like connectors for glued objects (render between world-space centers)
  try {
    // Collect unique glue pairs so we don't draw duplicates
    const drawnPairs = new Set();
    objects.forEach((o) => {
      if (!Array.isArray(o.gluedTo) || o.gluedTo.length === 0) return;
      const aCenter = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
      o.gluedTo.forEach((pid) => {
        // ensure partner exists
        const p = objects.find((oo) => oo.id === pid);
        if (!p) return;
        // define a stable key to avoid double-drawing (min,max)
        const key = o.id < p.id ? `${o.id}_${p.id}` : `${p.id}_${o.id}`;
        if (drawnPairs.has(key)) return;
        drawnPairs.add(key);
        const bCenter = { x: p.x + p.w / 2, y: p.y + p.h / 2 };

        // draw a slightly curved rope-like path between centers
        ctx.save();
        // rope style: warm brown with slight shadow and textured dashed look
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(94,52,20,0.95)"; // dark rope color
        // subtle outer glow
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 6;

        // compute control point for gentle quadratic curve based on midpoint and perpendicular offset
        const mx = (aCenter.x + bCenter.x) / 2;
        const my = (aCenter.y + bCenter.y) / 2;
        const dx = bCenter.x - aCenter.x;
        const dy = bCenter.y - aCenter.y;
        const len = Math.hypot(dx, dy) || 1;
        // perpendicular offset scaled by distance (clamped) so longer ropes curve a bit more
        const offset = Math.min(36, len * 0.12);
        const nx = -dy / len;
        const ny = dx / len;
        const cx = mx + nx * offset;
        const cy = my + ny * offset;

        ctx.beginPath();
        ctx.moveTo(aCenter.x, aCenter.y);
        ctx.quadraticCurveTo(cx, cy, bCenter.x, bCenter.y);
        ctx.stroke();

        // Draw a lighter thin highlight on top to give rope depth
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,223,153,0.75)";
        ctx.beginPath();
        ctx.moveTo(aCenter.x, aCenter.y);
        ctx.quadraticCurveTo(cx, cy, bCenter.x, bCenter.y);
        // Stroke with globalCompositeOperation 'lighter' for subtle sheen without affecting others
        const prevComp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "lighter";
        ctx.stroke();
        ctx.globalCompositeOperation = prevComp;

        // Optional: draw small stitches/dashes along the curve to mimic rope twist
        try {
          // sample several points along the curve and draw tiny ticks
          const ticks = Math.max(3, Math.round(len / 48));
          for (let i = 1; i < ticks; i++) {
            const t = i / ticks;
            // quadratic Bezier point formula
            const qx = (1 - t) * (1 - t) * aCenter.x + 2 * (1 - t) * t * cx + t * t * bCenter.x;
            const qy = (1 - t) * (1 - t) * aCenter.y + 2 * (1 - t) * t * cy + t * t * bCenter.y;
            ctx.beginPath();
            ctx.fillStyle = "rgba(60,34,14,0.95)";
            ctx.arc(qx, qy, 0.9, 0, Math.PI * 2);
            ctx.fill();
          }
        } catch (e) {
          // ignore tick drawing failures
        }

        ctx.restore();
      });
    });
  } catch (e) {
    // ignore rope rendering errors to avoid breaking draw
  }

  // Draw player character in play mode
  if (playMode && player) {
    ctx.save();
    if (charImage && charImageReady) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(charImage, player.x, player.y, player.w, player.h);
      // subtle outline for visibility
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(player.x, player.y, player.w, player.h);
    } else {
      ctx.fillStyle = "#2196f3";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(player.x, player.y, player.w, player.h);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPlayOverlay() {
  if (!playMode) return;
  // In embed mode, hide instructional overlay for a cleaner game-only view
  if (document.body.classList.contains("embed-mode")) return;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.font = "11px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Play mode: use A/D or ←/→ to move, W or ↑ to jump", 8, 8);
  ctx.restore();
}

function updateCamera() {
  // Compute simple world bounds from objects and viewport
  const padding = 40;
  let worldMinX = 0;
  let worldMinY = 0;
  let worldMaxX = viewport.width;
  let worldMaxY = viewport.height;

  if (objects.length > 0) {
    worldMinX = Math.min(...objects.map((o) => o.x)) - padding;
    worldMinY = Math.min(...objects.map((o) => o.y)) - padding;
    worldMaxX = Math.max(...objects.map((o) => o.x + o.w)) + padding;
    worldMaxY = Math.max(...objects.map((o) => o.y + o.h)) + padding;
  }

  // If playing and player exists, center camera on player; otherwise preserve provided camera values
  if (playMode && player) {
    const targetX = Math.round(player.x + player.w / 2 - viewport.width / 2);
    const targetY = Math.round(player.y + player.h / 2 - viewport.height / 2);
    cameraX = targetX;
    cameraY = targetY;
  }

  // Clamp camera to world bounds (respect explicit map size from properties).
  // Treat world origin at 0,0 and ensure worldMax incorporates the configured worldWidth/height.
  worldMaxX = Math.max(worldMaxX, worldWidth);
  worldMaxY = Math.max(worldMaxY, worldHeight);
  const minCameraX = 0;
  const minCameraY = 0;
  const maxCameraX = Math.max(worldMaxX - viewport.width, 0);
  const maxCameraY = Math.max(worldMaxY - viewport.height, 0);

  if (typeof cameraX !== "number") cameraX = 0;
  if (typeof cameraY !== "number") cameraY = 0;

  cameraX = Math.max(minCameraX, Math.min(cameraX, maxCameraX));
  cameraY = Math.max(minCameraY, Math.min(cameraY, maxCameraY));
}

function applyLighting() {
  // Only apply dark lighting effect when mode is 'dark'
  if (lightingMode !== "dark") return;

  ctx.save();

  const brightness = Math.max(0, Math.min(1, globalBrightness));
  // base darkness behind lights (stronger when brightness is low)
  const baseAlpha = 0.85 - brightness * 0.6;
  ctx.fillStyle = `rgba(0,0,0,${baseAlpha})`;
  ctx.fillRect(cameraX, cameraY, viewport.width, viewport.height);

  // We'll subtract darkness where lights and player are using destination-out and colored gradients drawn on top.
  // Use destination-out first for subtle neutral reveals, then draw colored additive glows using 'lighter'.
  ctx.globalCompositeOperation = "destination-out";

  // Player light — soft, slightly warm transparent reveal that scales with brightness.
  if (player) {
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const playerRadius = 180 + Math.round(brightness * 80);
    const innerRadius = Math.max(8, playerRadius * 0.08);
    const g = ctx.createRadialGradient(px, py, innerRadius, px, py, playerRadius);
    g.addColorStop(0, "rgba(0,0,0,0.0)");
    g.addColorStop(0.6, `rgba(0,0,0,${0.18 * (1 - brightness)})`);
    g.addColorStop(1, "rgba(0,0,0,1.0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, playerRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Light objects — erase darkness where lights reach (destination-out) then paint a colored glow additively.
  objects.forEach((o) => {
    if (o.type !== "light") return;
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const r = typeof o.radius === "number" ? Math.max(32, o.radius) : 120;
    const intensity = typeof o.intensity === "number" ? Math.max(0, Math.min(1, o.intensity)) : 1;

    // First: remove darkness with a soft radial (destination-out)
    const inner = Math.max(4, r * 0.06);
    const midStop = Math.min(0.85, 0.35 + 0.5 * intensity);
    const innerAlpha = Math.max(0, 0.05 * (1 - intensity));
    const midAlpha = Math.max(0.12, 0.4 * (1 - intensity));

    const eraseGrad = ctx.createRadialGradient(cx, cy, inner, cx, cy, r);
    eraseGrad.addColorStop(0, `rgba(0,0,0,${innerAlpha})`);
    eraseGrad.addColorStop(midStop, `rgba(0,0,0,${midAlpha})`);
    eraseGrad.addColorStop(1, "rgba(0,0,0,1.0)");
    ctx.fillStyle = eraseGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Second: paint colored glow using additive blending for warmth and realistic falloff
    ctx.globalCompositeOperation = "lighter";

    // derive a semi-bright RGBA from the block's color
    let rgba = "255,200,150"; // fallback warm
    try {
      // convert hex or named color to RGB by drawing to an offscreen canvas
      const temp = document.createElement("canvas");
      temp.width = temp.height = 1;
      const tctx = temp.getContext("2d");
      tctx.clearRect(0, 0, 1, 1);
      tctx.fillStyle = o.color || "#ffd54f";
      tctx.fillRect(0, 0, 1, 1);
      const d = tctx.getImageData(0, 0, 1, 1).data;
      rgba = `${d[0]},${d[1]},${d[2]}`;
    } catch (e) {
      // ignore and keep fallback
    }

    // stronger inner color stop scaled by intensity and global brightness
    const colorInnerAlpha = Math.max(0.14, 0.45 * intensity * brightness);
    const colorMidAlpha = Math.max(0.06, 0.25 * intensity * brightness);
    const colorOuterAlpha = Math.max(0.01, 0.04 * intensity * brightness);

    const colorGrad = ctx.createRadialGradient(cx, cy, inner, cx, cy, r);
    colorGrad.addColorStop(0, `rgba(${rgba},${colorInnerAlpha})`);
    colorGrad.addColorStop(Math.min(0.7, 0.3 + 0.4 * intensity), `rgba(${rgba},${colorMidAlpha})`);
    colorGrad.addColorStop(1, `rgba(${rgba},${colorOuterAlpha})`);

    ctx.fillStyle = colorGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // restore destination-out to keep erasing other lights consistently
    ctx.globalCompositeOperation = "destination-out";
  });

  // Restore composite and state
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  // Ensure camera is meaningful before drawing (keeps embed/saved camera or live follow)
  updateCamera();

  // Apply camera translation for embed/centered views.
  ctx.save();
  const cx = Math.round(cameraX || 0);
  const cy = Math.round(cameraY || 0);
  ctx.translate(-cx, -cy);

  drawBackground();
  drawGrid();
  drawObjects();

  // Apply lighting overlay (dark mode) in world space so light reveals are aligned with world objects
  applyLighting();

  if (playMode) {
    drawProjectiles();
  }

  ctx.restore();

  // Update runtime iframe positions so iframe DOM follows camera/player during play
  if (playMode) {
    try { updatePlayIframesPositions(); } catch (e) { /* ignore */ }
  }

  // HUD / overlays should be drawn in screen space (after restoring)
  drawPlayOverlay();
}

/* Hit testing */

/* Helper: test AABB overlap */
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Return axis-aligned bounding box for an object, accounting for rotation if it's a 'colliding' block.
// For non-rotated objects this returns the simple x,y,w,h box; for rotated colliding blocks we compute
// the rotated rectangle corners and return their min/max as the AABB used for collision checks.
function getAABBForObject(o) {
  if (!o || typeof o.x !== "number") return { x: 0, y: 0, w: 0, h: 0 };
  // Only compute rotated corners for colliding blocks (which store o.angle)
  // If any object has a rotation, compute its rotated AABB so hit tests and collisions match visual rotation.
  if (typeof o.angle === "number" && Math.abs(o.angle) > 1e-6) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const cos = Math.cos(o.angle);
    const sin = Math.sin(o.angle);

    // rectangle local corners relative to center
    const hx = o.w / 2;
    const hy = o.h / 2;
    const corners = [
      { x: -hx, y: -hy },
      { x: hx, y: -hy },
      { x: hx, y: hy },
      { x: -hx, y: hy },
    ];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of corners) {
      const rx = cx + c.x * cos - c.y * sin;
      const ry = cy + c.x * sin + c.y * cos;
      if (rx < minX) minX = rx;
      if (ry < minY) minY = ry;
      if (rx > maxX) maxX = rx;
      if (ry > maxY) maxY = ry;
    }

    return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
  }

  // default axis-aligned box
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

/* Helper: determine whether a given rect (x,y,w,h) actually intersects any stamp of a terrain object.
   This ensures terrain collisions only occur when the player's bbox overlaps a painted stamp, not the terrain's bounding box. */
function terrainIntersects(terrainObj, rx, ry, rw, rh) {
  if (!terrainObj || terrainObj.type !== "terrain") return false;
  // If terrain uses stamps, test each stamp rect; otherwise fall back to bounding-box test for compatibility.
  if (Array.isArray(terrainObj.stamps) && terrainObj.stamps.length > 0) {
    for (const s of terrainObj.stamps) {
      if (rectsOverlap(rx, ry, rw, rh, s.x, s.y, s.w, s.h)) return true;
    }
    return false;
  } else {
    return rectsOverlap(rx, ry, rw, rh, terrainObj.x, terrainObj.y, terrainObj.w, terrainObj.h);
  }
}

// Return the first stamp that intersects the provided rect (world coords), or null if none.
// This helper allows collisions to be resolved against the exact painted stamp instead of the terrain bounding box.
function getOverlappingTerrainStamp(terrainObj, rx, ry, rw, rh) {
  if (!terrainObj || terrainObj.type !== "terrain") return null;
  if (Array.isArray(terrainObj.stamps) && terrainObj.stamps.length > 0) {
    for (const s of terrainObj.stamps) {
      if (rectsOverlap(rx, ry, rw, rh, s.x, s.y, s.w, s.h)) return s;
    }
    return null;
  }
  // fallback: treat the whole terrain rect as a single "stamp" for compatibility
  if (rectsOverlap(rx, ry, rw, rh, terrainObj.x, terrainObj.y, terrainObj.w, terrainObj.h)) {
    return { x: terrainObj.x, y: terrainObj.y, w: terrainObj.w, h: terrainObj.h };
  }
  return null;
}

function hitTest(x, y) {
  // rotated-point helper: given an object with center cx,cy and angle (radians),
  // compute the point coordinates in the object's local (unrotated) space by applying
  // the inverse rotation around the center.
  function toLocalPoint(px, py, cx, cy, angle) {
    const dx = px - cx;
    const dy = py - cy;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return {
      x: cx + (dx * cos - dy * sin),
      y: cy + (dx * sin + dy * cos),
    };
  }

  // check resize handle first (handle should follow the rotated rectangle)
  const handleSize = 12;
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    // For colliding blocks that are rotated, compute handle position in screen/world space by
    // transforming the local handle corner into world coords, but easier: inverse-rotate pointer into local space
    // and test against axis-aligned handle rect in local coordinates.
    if (o.type === "colliding" && o.angle && Math.abs(o.angle) > 1e-6) {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const local = toLocalPoint(x, y, cx, cy, o.angle);
      const localHandleX = o.x + o.w - handleSize;
      const localHandleY = o.y + o.h - handleSize;
      if (
        local.x >= localHandleX &&
        local.x <= localHandleX + handleSize &&
        local.y >= localHandleY &&
        local.y <= localHandleY + handleSize
      ) {
        return { obj: o, part: "handle" };
      }
    } else {
      // non-rotated or other types: axis-aligned handle test as before
      const hx = o.x + o.w - handleSize;
      const hy = o.y + o.h - handleSize;
      if (x >= hx && x <= hx + handleSize && y >= hy && y <= hy + handleSize) {
        return { obj: o, part: "handle" };
      }
    }
  }

  // check body (iterate top-most first)
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type === "terrain") {
      // for pointer hit testing treat terrain as hit only when pointer overlaps a stamp
      if (terrainIntersects(o, x, y, 1, 1)) return { obj: o, part: "body" };
    } else if (typeof o.angle === "number" && Math.abs(o.angle) > 1e-6) {
      // For rotated objects: inverse-rotate the point into object local space and test axis-aligned hit.
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const local = toLocalPoint(x, y, cx, cy, o.angle);
      if (local.x >= o.x && local.x <= o.x + o.w && local.y >= o.y && local.y <= o.y + o.h) {
        return { obj: o, part: "body" };
      }
    } else {
      // default axis-aligned test for non-rotated objects
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
        return { obj: o, part: "body" };
      }
    }
  }
  return null;
}

/* Tools */

function setTool(name) {
  currentTool = name;
  toolButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === name);
  });
}

/* Pointer handling */

function getCanvasPos(evt) {
  const rect = viewport.getBoundingClientRect();
  const touch = evt.touches ? evt.touches[0] : evt;
  const x = ((touch.clientX - rect.left) * viewport.width) / rect.width;
  const y = ((touch.clientY - rect.top) * viewport.height) / rect.height;
  // Convert canvas/screen coordinates into world coordinates by applying camera offset.
  // This ensures hit tests and dragging operate in world space even when the view is panned.
  return { x: x + (cameraX || 0), y: y + (cameraY || 0) };
}

function pointerDown(evt) {
  if (playMode) return;
  evt.preventDefault();

  const { x, y } = getCanvasPos(evt);
  pointerState.active = true;
  pointerState.startX = x;
  pointerState.startY = y;
  pointerState.lastX = x;
  pointerState.lastY = y;
  pointerState.mode = null;
  pointerState.targetId = null;

  // Terrain painting mode: begin brush stroke immediately and create initial terrain block
  if (currentTool === "terrain") {
    pointerState.mode = "paint";
    // create an initial terrain block at this world location (getCanvasPos already returns world coords)
    createTerrainAt(x, y);
    // store last painted position in world coords
    pointerState.lastPaintX = x;
    pointerState.lastPaintY = y;
    return;
  }

  const hit = hitTest(x, y);
  if (!hit) {
    // If user clicks empty space in editor, start a pan operation so they can move the camera.
    // We'll store the camera start so pointerMove can offset it.
    setSelected(null);
    pointerState.mode = "pan";
    pointerState.panStartCameraX = cameraX;
    pointerState.panStartCameraY = cameraY;
    return;
  }

  setSelected(hit.obj.id);
  pointerState.targetId = hit.obj.id;

  if (currentTool === "delete") {
    objects = objects.filter((o) => o.id !== hit.obj.id);
    selectedId = null;
    refreshExplorer();
    syncPropertiesPanel();
    draw();
    return;
  }

  // Prevent resizing terrain with the resize tool: terrain should be painted with the brush instead.
  if ((currentTool === "resize" || hit.part === "handle") && hit.obj.type !== "terrain") {
    pointerState.mode = "resize";
  } else {
    pointerState.mode = "move";
  }
}

function pointerMove(evt) {
  if (!pointerState.active || playMode) return;
  evt.preventDefault();

  const { x, y } = getCanvasPos(evt);
  const dx = x - pointerState.lastX;
  const dy = y - pointerState.lastY;

  if (pointerState.mode === "pan") {
    // move camera opposite to pointer movement (world coordinates)
    cameraX = Math.round((pointerState.panStartCameraX || 0) - (x - pointerState.startX));
    cameraY = Math.round((pointerState.panStartCameraY || 0) - (y - pointerState.startY));
    // clamp camera to world bounds defined by worldWidth/worldHeight
    const maxPanX = Math.max(0, worldWidth - viewport.width);
    const maxPanY = Math.max(0, worldHeight - viewport.height);
    cameraX = Math.min(Math.max(Math.round(cameraX), 0), maxPanX);
    cameraY = Math.min(Math.max(Math.round(cameraY), 0), maxPanY);
    // update camera inputs if present
    const camXInput = document.getElementById("cam-x");
    const camYInput = document.getElementById("cam-y");
    if (camXInput) camXInput.value = Math.round(cameraX);
    if (camYInput) camYInput.value = Math.round(cameraY);
    pointerState.lastX = x;
    pointerState.lastY = y;
    draw();
    return;
  }

  // Painting terrain while dragging: create evenly spaced terrain blocks along stroke
  if (pointerState.mode === "paint" && currentTool === "terrain") {
    // Use world coords (x,y are already world coords from getCanvasPos)
    const spacing = 18; // pixels between brush stamps
    const lastX = pointerState.lastPaintX != null ? pointerState.lastPaintX : x;
    const lastY = pointerState.lastPaintY != null ? pointerState.lastPaintY : y;
    const dx = x - lastX;
    const dy = y - lastY;
    const dist = Math.hypot(dx, dy);
    if (dist >= spacing) {
      const steps = Math.floor(dist / spacing);
      for (let i = 1; i <= steps; i++) {
        const ix = lastX + (dx * i) / steps;
        const iy = lastY + (dy * i) / steps;
        // create at world coordinates (getCanvasPos returns world coords already)
        createTerrainAt(ix, iy);
      }
      pointerState.lastPaintX = x;
      pointerState.lastPaintY = y;
      draw();
    }
    // still allow further processing to update last positions for other tools if needed
  }

  const obj = objects.find((o) => o.id === pointerState.targetId);
  if (!obj) return;

  if (pointerState.mode === "move" || currentTool === "move") {
    obj.x += dx;
    obj.y += dy;
  } else if (pointerState.mode === "resize" || currentTool === "resize") {
    obj.w = Math.max(10, obj.w + dx);
    obj.h = Math.max(10, obj.h + dy);
  }

  // keep NPC spawn in sync when moved in the editor
  if (!playMode && obj.type === "npc") {
    obj.spawnX = obj.x;
    obj.spawnY = obj.y;
  }

  pointerState.lastX = x;
  pointerState.lastY = y;

  syncPropertiesPanel();
  draw();

  // Update glue hint based on current pointer world position (show + when near touching colliding pair)
  try {
    updateGlueHintForPointer(x, y);
  } catch (e) {
    // ignore glue hint errors
  }
}

function pointerUp(evt) {
  if (!pointerState.active) return;
  evt.preventDefault();
  pointerState.active = false;
  pointerState.mode = null;
  pointerState.targetId = null;
}

/* Play / Stop */

function spawnPlayer() {
  // Find first spawn object; prefer visible spawn but fall back to any spawn (and restore visibility) so Play always spawns a player.
  let spawn = objects.find((o) => o.type === "spawn" && o.visible !== false);
  if (!spawn) {
    // fallback: accept a hidden spawn (some flows may hide spawn temporarily)
    spawn = objects.find((o) => o.type === "spawn");
    if (spawn) {
      // make sure spawn is available in play mode even if it was hidden in the editor
      spawn.visible = true;
    }
  }

  const w = 26;
  const h = 36;
  let x = viewport.width / 2 - w / 2;
  let y = viewport.height / 2 - h / 2;

  if (spawn) {
    x = spawn.x + spawn.w / 2 - w / 2;
    // place player just above spawn block; if that location intersects terrain stamps, nudge upward until clear
    y = spawn.y - h;
  }

  player = {
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    onGround: false,
    hasBlaster: false,
  };

  // If the spawn position intersects any terrain stamp, nudge the player upward up to a limit so they don't get stuck inside terrain.
  try {
    const maxNudges = 12;
    let nudges = 0;
    // If any terrain intersects the player's bbox, move player up by 8px until free or limit reached.
    while (
      objects.some(
        (o) =>
          o.type === "terrain" &&
          terrainIntersects(o, Math.round(player.x), Math.round(player.y), Math.round(player.w), Math.round(player.h))
      ) &&
      nudges < maxNudges
    ) {
      player.y -= 8;
      nudges++;
    }
  } catch (e) {
    // ignore any errors and keep the computed spawn
  }

  // initial checkpoint is the spawn position
  checkpoint = { x: player.x, y: player.y };
}

function respawnPlayer() {
  // Play death sound and respawn at the Spawn block (or center if no spawn exists)
  playDeathSound();
  spawnPlayer();
  projectiles = [];
}

function updatePlayer(dt) {
  if (!player) return;

  const moveSpeed = 200; // px/s
  const jumpSpeed = -380;
  const gravity = 900;

  // Horizontal input
  let dir = 0;
  if (keys.left) dir -= 1;
  if (keys.right) dir += 1;
  player.vx = dir * moveSpeed;

  // Jump
  if (keys.up && player.onGround) {
    player.vy = jumpSpeed;
    player.onGround = false;
  }

  // Gravity
  player.vy += gravity * dt;

  // Apply movement with simple collision
  const solids = objects; // all objects solid

  // Track facing
  if (player.vx > 0) playerFacing = 1;
  else if (player.vx < 0) playerFacing = -1;

  // Horizontal move
  let newX = player.x + player.vx * dt;
  let resolvedX = newX;

  // small-step climb threshold (px) -- allow stepping up this amount when running into low obstacles
  const MAX_STEP_UP = 14; // tuned: small stairs allowed, tall walls blocked

  for (const o of solids) {
    // Compute vertical overlap (same for terrain and other objects)
    const overlapsVertically =
      player.y < o.y + o.h && player.y + player.h > o.y;

    // For terrain, horizontal overlap must use terrainIntersects (stamp-aware).
    // For other objects, prefer rotated-aware test for colliding blocks: inverse-rotate player's bbox into the block's local space.
    const obb = o.type === "terrain" ? null : getAABBForObject(o);

    let overlapsHorizontally = false;
    if (o.type === "terrain") {
      overlapsHorizontally = terrainIntersects(o, newX, player.y, player.w, player.h);
    } else if (o.type === "colliding" && o.angle && Math.abs(o.angle) > 1e-6) {
      // inverse-rotate player's left/top and right/bottom corners into block local space and test axis-aligned overlap
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const cos = Math.cos(-o.angle);
      const sin = Math.sin(-o.angle);

      // helper to transform a world point into local (unrotated) coordinates
      function worldToLocal(px, py) {
        const dx = px - cx;
        const dy = py - cy;
        return {
          x: cx + (dx * cos - dy * sin),
          y: cy + (dx * sin + dy * cos),
        };
      }

      // compute player's AABB corners at proposed newX
      const px0 = newX, py0 = player.y;
      const px1 = newX + player.w, py1 = player.y + player.h;

      const tl = worldToLocal(px0, py0);
      const br = worldToLocal(px1, py1);

      // Build local AABB for player's transformed box
      const localMinX = Math.min(tl.x, br.x);
      const localMaxX = Math.max(tl.x, br.x);
      // Compare against block's local axis-aligned rect (o.x..o.x+o.w)
      overlapsHorizontally = localMaxX > o.x && localMinX < o.x + o.w;
    } else {
      overlapsHorizontally = newX < obb.x + obb.w && newX + player.w > obb.x;
    }

    if (overlapsHorizontally && overlapsVertically) {
      // Per-object action handling on touch
      if (o.action === "kill" || (o.type === "npc" && o.npcRespawn)) {
        respawnPlayer();
        return;
      } else if (o.action === "checkpoint") {
        checkpoint = {
          x: player.x,
          y: player.y,
        };
      } else if (o.action === "revive") {
        // treat revive as a safe restore point
        checkpoint = {
          x: player.x,
          y: player.y,
        };
      }
      // Pick up blaster
      if (o.type === "blaster") {
        player.hasBlaster = true;
        // mark blaster as picked up for play-mode (hide it but keep it in project so its location is preserved)
        o.picked = true;
        // remember original editor position so we can restore after play
        if (typeof o._savedX !== "number") o._savedX = o.x;
        if (typeof o._savedY !== "number") o._savedY = o.y;
        o.visible = false;
        refreshExplorer();
        syncPropertiesPanel();
      }

      // If the object is a dynamic colliding block, transfer momentum and allow the block to be pushed
      if (o.type === "colliding" && o.dynamic) {
        if (typeof o.vx !== "number") o.vx = 0;
        // Transfer a fraction of player's horizontal velocity to the block.
        const pushFactor = 0.6;
        o.vx += (player.vx || 0) * pushFactor;
        // Impart a small angular impulse based on where the player contacts the block horizontally.
        try {
          // When computing contact position, use the object's rotated AABB center for lever calculation.
          const targetAABB = getAABBForObject(o);
          const contactX = Math.max(targetAABB.x, Math.min(player.x + player.w / 2, targetAABB.x + targetAABB.w));
          const lever = (contactX - (targetAABB.x + targetAABB.w / 2)) / (Math.max(1, targetAABB.w) / 2); // -1 .. 1
          const torque = (player.vx || 0) * 0.02 * lever;
          if (typeof o.angularVelocity !== "number") o.angularVelocity = 0;
          const invInertia = 1 / Math.max(0.0001, o._inertia || 1);
          o.angularVelocity += torque * invInertia;
        } catch (e) {}
        // Nudge the block to avoid deep penetration and give immediate feedback (use AABB for conservative push)
        if (player.vx > 0) {
          o.x = Math.max(o.x, player.x + player.w + 0.5);
        } else if (player.vx < 0) {
          o.x = Math.min(o.x, player.x - o.w - 0.5);
        }
        // Let the player continue moving into the space (player is pushing), so don't zero player's vx or hard-resolve
        resolvedX = newX;
      } else {
        // Non-dynamic or regular solids: attempt small step-up before hard-blocking
        let stepped = false;

        // Only try stepping when player is roughly on ground (prevents stepping while mid-air)
        if (player.onGround && Math.abs(player.vx) > 0) {
          // try incremental step heights up to MAX_STEP_UP (sample top position)
          for (let step = 1; step <= MAX_STEP_UP; step += 4) {
            const testY = Math.round(player.y - step);
            // Check whether at the proposed newX and lifted by 'step' the player would be free of collision
            const collisionAtStep = solids.some((other) => {
              if (other === o) {
                // For the obstacle we're trying to step onto, use stamp-aware test if terrain.
                if (other.type === "terrain") {
                  return terrainIntersects(other, newX, testY, player.w, player.h);
                }
                const otherAABB = getAABBForObject(other);
                return newX < otherAABB.x + otherAABB.w && newX + player.w > otherAABB.x && testY < otherAABB.y + otherAABB.h && testY + player.h > otherAABB.y;
              } else {
                // For other solids, standard AABB test at the lifted position (use rotated AABB where applicable)
                if (other.type === "terrain") {
                  return terrainIntersects(other, newX, testY, player.w, player.h);
                }
                const otherAABB = getAABBForObject(other);
                return newX < otherAABB.x + otherAABB.w && newX + player.w > otherAABB.x && testY < otherAABB.y + otherAABB.h && testY + player.h > otherAABB.y;
              }
            });

            // If no collision at this stepped position, accept the step and place player there
            if (!collisionAtStep) {
              player.y = testY;
              // mark as stepped so later vertical collision handling treats player as onGround if appropriate
              stepped = true;
              break;
            }
          }
        }

        if (stepped) {
          // allow horizontal movement into resolved position after stepping
          resolvedX = newX;
        } else {
          // Hard resolution as before when stepping fails
          if (o.type === "terrain") {
            const stamp = getOverlappingTerrainStamp(o, newX, player.y, player.w, player.h);
            if (stamp) {
              if (player.vx > 0) {
                resolvedX = stamp.x - player.w;
              } else if (player.vx < 0) {
                resolvedX = stamp.x + stamp.w;
              }
            } else {
              const otherAABB = getAABBForObject(o);
              if (player.vx > 0) {
                resolvedX = otherAABB.x - player.w;
              } else if (player.vx < 0) {
                resolvedX = otherAABB.x + otherAABB.w;
              }
            }
          } else {
            const otherAABB = getAABBForObject(o);
            if (player.vx > 0) {
              resolvedX = otherAABB.x - player.w;
            } else if (player.vx < 0) {
              resolvedX = otherAABB.x + otherAABB.w;
            }
          }
          player.vx = 0;
        }
      }
    }
  }
  player.x = resolvedX;

  // Vertical move
  let newY = player.y + player.vy * dt;
  let resolvedY = newY;
  player.onGround = false;

  for (const o of solids) {
    // For terrain, only consider collision when the player's bbox at the proposed newY overlaps a stamp.
    let overlaps = false;
    if (o.type === "terrain") {
      overlaps = terrainIntersects(o, player.x, newY, player.w, player.h);
    } else if (o.type === "colliding" && o.angle && Math.abs(o.angle) > 1e-6) {
      // For rotated colliding blocks do rotated-aware test:
      // inverse-rotate the player's bbox corners into the block's local space and test axis-aligned overlap.
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const cos = Math.cos(-o.angle);
      const sin = Math.sin(-o.angle);

      function worldToLocal(px, py) {
        const dx = px - cx;
        const dy = py - cy;
        return {
          x: cx + (dx * cos - dy * sin),
          y: cy + (dx * sin + dy * cos),
        };
      }

      // player's bbox at newY
      const px0 = player.x, py0 = newY;
      const px1 = player.x + player.w, py1 = newY + player.h;

      const pTL = worldToLocal(px0, py0);
      const pBR = worldToLocal(px1, py1);
      const localMinX = Math.min(pTL.x, pBR.x);
      const localMaxX = Math.max(pTL.x, pBR.x);
      const localMinY = Math.min(pTL.y, pBR.y);
      const localMaxY = Math.max(pTL.y, pBR.y);

      const blockMinX = o.x;
      const blockMaxX = o.x + o.w;
      const blockMinY = o.y;
      const blockMaxY = o.y + o.h;

      overlaps = localMaxX > blockMinX && localMinX < blockMaxX && localMaxY > blockMinY && localMinY < blockMaxY;
    } else {
      const overlapsHorizontally =
        player.x < o.x + o.w && player.x + player.w > o.x;
      const overlapsVertically =
        newY < o.y + o.h && newY + player.h > o.y;
      overlaps = overlapsHorizontally && overlapsVertically;
    }

    if (overlaps) {
      // Per-object action handling on touch
      if (o.action === "kill" || (o.type === "npc" && o.npcRespawn)) {
        respawnPlayer();
        return;
      } else if (o.action === "checkpoint") {
        checkpoint = {
          x: player.x,
          y: player.y,
        };
      } else if (o.action === "revive") {
        checkpoint = {
          x: player.x,
          y: player.y,
        };
      }

      // TriggerPart activation: if touching a triggerpart configured for player and it has an assigned block id,
      // reveal (make visible) the assigned block when the player touches the TriggerPart.
      if (o.type === "triggerpart" && o.triggerTarget === "player" && typeof o.triggerAssignedId === "number") {
        const target = objects.find((t) => t.id === o.triggerAssignedId);
        if (target) {
          target.visible = true;
          // Update explorer/UI in case this was hidden previously
          refreshExplorer();
        }
      }

      if (player.vy > 0) {
        // falling down onto top
        if (o.type === "terrain") {
          // Resolve landing against the exact stamp hit so the player lands on the stamp surface
          // instead of being snapped to the terrain object's top (which may be higher).
          const stamp = getOverlappingTerrainStamp(o, player.x, newY, player.w, player.h);
          if (stamp) {
            resolvedY = stamp.y - player.h;
          } else {
            resolvedY = o.y - player.h;
          }
        } else {
          resolvedY = o.y - player.h;
        }

        // If landing on a dynamic colliding block, transfer some vertical impulse so block reacts
        if (o.type === "colliding" && o.dynamic) {
          if (typeof o.vy !== "number") o.vy = 0;
          const vertTransfer = 0.18; // small fraction of player's vertical speed transferred
          o.vy += (player.vy || 0) * vertTransfer;
          // slight upward nudge to avoid tunnelling
          o.y = Math.min(o.y, resolvedY + player.h + 0.5);
        }
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0) {
        // jumping into bottom
        if (o.type === "terrain") {
          // compute overlap stamp to resolve hitting a stamp's underside accurately
          const stamp = getOverlappingTerrainStamp(o, player.x, newY, player.w, player.h);
          if (stamp) {
            resolvedY = stamp.y + stamp.h;
          } else {
            resolvedY = o.y + o.h;
          }
        } else {
          resolvedY = o.y + o.h;
        }
        player.vy = 0;
        // if hitting the bottom of a dynamic block, impart slight downward velocity to it
        if (o.type === "colliding" && o.dynamic) {
          if (typeof o.vy !== "number") o.vy = 0;
          o.vy += 40;
        }
      }
      // Pick up blaster
      if (o.type === "blaster") {
        player.hasBlaster = true;
        // mark blaster picked for play-mode (hide, keep in state)
        o.picked = true;
        if (typeof o._savedX !== "number") o._savedX = o.x;
        if (typeof o._savedY !== "number") o._savedY = o.y;
        o.visible = false;
        refreshExplorer();
        syncPropertiesPanel();
      }
    }
  }
  player.y = resolvedY;

  // Simple seat-riding support and player-triggered sitting: if player overlaps a seat that is glued to a colliding block,
  // by default the seat will let the player "ride" it visually; additionally player can press 'E' to sit and then drive the attached block.
  try {
    // If player has explicitly sat on a seat (toggle via 'E'), drive the attached master block instead of normal player movement.
    if (player._riding && typeof player._riding.seatId === "number") {
      const seat = objects.find(s => s.id === player._riding.seatId && s.type === "seat");
      const masterId = player._riding.masterId;
      const master = typeof masterId === "number" ? objects.find(o => o.id === masterId) : null;

      if (seat) {
        // position player sitting on the seat visually
        player.x = seat.x + seat.w / 2 - player.w / 2;
        player.y = seat.y - player.h + 2;
        player.vx = 0;
        player.vy = 0;
        player.onGround = true;
        // If there is an attached master colliding block, control it using keys while sitting
        if (master && master.type === "colliding") {
          const driveSpeed = 160; // horizontal driving speed applied to block
          const lift =  -220; // upward impulse for 'up' to simulate small jump/thrust
          // Horizontal control using left/right keys
          if (keys.left) master.vx = -driveSpeed;
          else if (keys.right) master.vx = driveSpeed;
          else master.vx *= 0.92; // gentle damping when no input

          // Vertical thrust (single-frame impulse) if up is pressed - apply small impulse only while key is newly pressed
          if (player._riding._wantJump && master) {
            // apply upward impulse to master if it's dynamic
            if (typeof master.vy === "number") master.vy = Math.min(master.vy, lift);
            // Ensure the master block remains visible when driven by a sitting player (prevent accidental hide)
            try { master.visible = true; } catch (e) {}
            player._riding._wantJump = false;
          }
          // allow W/S for slight vertical control (S pushes down a bit)
          if (keys.up) {
            // mark desire to jump once (consumed here)
            // set flag to apply impulse once; handled above where _wantJump consumed
            if (!player._riding._wantJump) player._riding._wantJump = true;
          }
          if (keys.down) {
            master.vy += 40 * (1/60); // small downward nudge
          }
        }
      } else {
        // seat no longer exists; clear riding state
        delete player._riding;
      }
    } else {
      // Passive seat-following (player simply overlaps seat) for non-sitting behavior (keeps previous semantics)
      for (const s of objects) {
        if (s.type !== "seat") continue;
        if (s.visible === false) continue;
        // test overlap in world space
        if (player.x < s.x + s.w && player.x + player.w > s.x && player.y < s.y + s.h && player.y + player.h > s.y) {
          // if the seat is glued to any colliding block, try to follow that block's velocity/position visually
          if (Array.isArray(s.gluedTo) && s.gluedTo.length > 0) {
            const master = objects.find(o => o.id === s.gluedTo[0]);
            if (master) {
              // move player with the master block's linear motion so they ride together visually
              player.x = s.x + s.w/2 - player.w/2;
              player.y = s.y - player.h + 2;
              if (typeof master.vx === "number") player.x += master.vx * dt;
              if (typeof master.vy === "number") player.y += master.vy * dt;
              player.vx = master.vx || 0;
              player.vy = master.vy || 0;
              s._riderId = -1; // visual rider marker
            }
          } else {
            // seat not glued - still position player on seat visually but do not control any block
            player.x = s.x + s.w/2 - player.w/2;
            player.y = s.y - player.h + 2;
            player.vx = 0;
            player.vy = 0;
            s._riderId = -1;
          }
          player.onGround = true;
          break; // only handle first matching seat
        }
      }
    }
  } catch (e) {
    // ignore seat ride errors
  }

  // Keep inside world bounds (use configured worldWidth/worldHeight rather than viewport size)
  if (player.x < 0) player.x = 0;
  if (player.x + player.w > worldWidth) player.x = worldWidth - player.w;
  if (player.y + player.h > worldHeight) {
    player.y = worldHeight - player.h;
    player.vy = 0;
    player.onGround = true;
  }
}

function updateProjectiles(dt) {
  // Only run while playing, but run regardless of whether projectiles exist so
  // dynamic colliding blocks receive gravity/friction each frame.
  if (!playMode) return;

  const maxLifetime = 2; // seconds

  // Move projectiles (if any)
  if (projectiles.length > 0) {
    projectiles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      p.dead = p.dead || false;
    });

    // Handle collision with NPCs
    objects.forEach((o) => {
      if (o.type !== "npc") return;

      // Ensure spawn position exists for respawn
      if (typeof o.spawnX !== "number") o.spawnX = o.x;
      if (typeof o.spawnY !== "number") o.spawnY = o.y;

      projectiles.forEach((p) => {
        if (p.dead) return;
        const hit =
          p.x < o.x + o.w &&
          p.x + p.w > o.x &&
          p.y < o.y + o.h &&
          p.y + p.h > o.y;

        if (!hit) return;

        // Mark projectile as consumed
        p.dead = true;

        // Default projectile damage (can be extended later)
        const dmg = typeof p.damage === "number" ? p.damage : 1;

        if (o.type === "npc") {
          // Ensure hp property exists
          if (typeof o.hp !== "number") o.hp = 5;
          o.hp = Math.max(0, o.hp - dmg);

          // If NPC set to auto-respawn, treat kill as respawn; otherwise hide on death
          if (o.hp <= 0) {
            if (o.npcRespawn) {
              // Respawn NPC at its saved spawn position and restore HP to default
              o.x = o.spawnX;
              o.y = o.spawnY;
              o.vx = 0;
              o.vy = 0;
              o.onGround = false;
              o.hp = 5;
            } else {
              // Hide NPC during play but remember its runtime/editor location so it can be restored when play stops.
              if (typeof o._savedX !== "number") o._savedX = o.x;
              if (typeof o._savedY !== "number") o._savedY = o.y;
              o.visible = false;
              o._hitDead = true;
            }
          } else {
            // NPC took damage but is still alive (optional visual feedback could be added)
            // keep NPC in scene
          }
        } else {
          // Non-NPC collisions: keep prior behavior for special cases
          if (o.npcRespawn) {
            o.x = o.spawnX;
            o.y = o.spawnY;
            o.vx = 0;
            o.vy = 0;
            o.onGround = false;
          } else {
            if (typeof o._savedX !== "number") o._savedX = o.x;
            if (typeof o._savedY !== "number") o._savedY = o.y;
            o.visible = false;
            o._hitDead = true;
          }
        }
      });
    });

    // Remove off-screen, expired, or consumed projectiles
    projectiles = projectiles.filter(
      (p) =>
        !p.dead &&
        p.life < maxLifetime &&
        p.x + p.w > 0 &&
        p.x < viewport.width &&
        p.y + p.h > 0 &&
        p.y < viewport.height
    );
  }

  // (Previously we removed NPCs from the project here when killed by projectiles.
  // NPCs are now preserved in the project and only hidden during play; no filtering is needed.)

  // Update simple physics for dynamic colliding blocks here (basic integrator, gravity, friction and simple collisions).
  objects.forEach((o) => {
    if (o.type !== "colliding" || !o.dynamic) return;

    // ensure runtime velocity fields exist
    if (typeof o.vx !== "number") o.vx = 0;
    if (typeof o.vy !== "number") o.vy = 0;

    // If this colliding block is configured as a "leg", apply a walking-like motion relative to its anchor
    // while in play mode so it behaves like a tethered leg that steps left/right. This creates a simple
    // gait: the block alternates target offsets around the anchor and moves toward them, with slight vertical
    // bobbing to mimic stepping while still participating in physics.
    if (o.action === "leg" && playMode) {
      // Ensure an anchor exists (fallback above block)
      if (!o.legAnchor) {
        o.legAnchor = { x: o.x + o.w / 2, y: o.y - Math.max(40, Math.round(o.h * 0.9)) };
      }
      // Initialize walking state if missing
      if (typeof o._legPhase !== "number") o._legPhase = 0;
      if (typeof o._legDir !== "number") o._legDir = (Math.random() > 0.5 ? 1 : -1); // phase sign seed
      if (typeof o._legStepTimer !== "number") o._legStepTimer = 0;
      if (typeof o._legStepDuration !== "number") o._legStepDuration = 0.9 + ((o.id % 5) * 0.12); // slightly varied
      if (typeof o._legStride !== "number") o._legStride = Math.min(72, Math.max(20, (o.w + o.h) * 0.10)); // horizontal stride (increased for more pronounced stepping)

      // Time & phase (use real dt when available; dt is in scope for outer loop)
      const t = performance.now() / 1000;
      // Create a smooth continuous phase so legs oscillate even between discrete steps.
      o._legPhase = (o._legPhase || 0) + (dt || 0.016) * 3.0; // base angular speed
      // Slight id-based offset so multiple legs are out-of-phase naturally
      const phase = o._legPhase + (o.id % 4) * 0.9;

      // Gait: use sinusoidal motion for X (forward/back) and Y (bob)
      // Horizontal stride modulated by a step envelope so foot lifts and returns
      const gaitStrength = 1.6; // stronger gait to make horizontal motion more visible
      const stride = o._legStride * gaitStrength;
      const swing = Math.cos(phase) * 0.98; // -1..1
      const lift = Math.max(0, Math.sin(phase)); // 0..1 to represent foot lift (used for vertical bob)

      // Determine directional bias: if attached to an NPC, legs should walk relative to NPC facing; fallback to stored dir
      let walkDir = o._legDir || 1;
      if (o._attachedTo) {
        const npc = objects.find(x => x.id === o._attachedTo);
        if (npc && typeof npc.vx === "number") {
          walkDir = npc.vx >= 0 ? 1 : -1;
        }
      }

      // Compute target offsets around the anchor.
      let targetOffsetX = walkDir * stride * swing * 1.0; // use full stride for a more pronounced forward/back motion
      let targetOffsetY = -Math.abs(lift) * Math.max(10, Math.round(o.h * 0.12)); // stronger vertical lift for clearer stepping

      // Separation: if another nearby leg target is too close, nudge this leg sideways to avoid overlap so walking continues.
      const MIN_SEPARATION = Math.max(12, Math.min( Math.round(o.w * 0.6), 28 ));
      for (const other of objects) {
        if (other === o) continue;
        if (other.type !== "colliding") continue;
        if (other.action !== "leg") continue;
        // If other is attached to same NPC or physically close, compute their expected center and separate targets
        const otherCenterX = other.x + other.w / 2;
        const otherCenterY = other.y + other.h / 2;
        const myCenterX = o.x + o.w / 2;
        const myCenterY = o.y + o.h / 2;
        const dist = Math.hypot(myCenterX - otherCenterX, myCenterY - otherCenterY);
        if (dist < MIN_SEPARATION * 1.1) {
          // push targets away from each other along the local X axis relative to leg anchor
          const sepDir = Math.sign((o.legAnchor.x || myCenterX) - (other.legAnchor ? other.legAnchor.x : otherCenterX)) || (o.id < other.id ? -1 : 1);
          // Nudge offset proportionally so overlap resolves quickly but gently
          targetOffsetX += sepDir * (MIN_SEPARATION * 0.45);
        }
      }

      // Target world coords for this leg foot
      const targetX = o.legAnchor.x - o.w / 2 + targetOffsetX;
      const targetY = o.legAnchor.y + targetOffsetY;

      // Spring-damper smoothing toward target for natural motion
      const SPRING_K = 18.0;
      const DAMP = 0.82;
      // integrate velocity toward target
      o.vx += (targetX - o.x) * SPRING_K * (dt || 0.016);
      o.vy += (targetY - o.y) * SPRING_K * (dt || 0.016);
      o.vx *= DAMP;
      o.vy *= DAMP;

      // Integrate a small portion immediately for visual responsiveness
      o.x += o.vx * Math.min(1/60, dt || 0.016);
      o.y += o.vy * Math.min(1/60, dt || 0.016);

      // Keep a very small angular wobble to match foot planting (reduced to limit rotation)
      o.angularVelocity += (Math.sin(phase) * 0.0008);

      // Advance a step timer so we can flip walk direction occasionally to adapt gait rhythm
      o._legStepTimer = (o._legStepTimer || 0) + (dt || 0.016);
      if (o._legStepTimer > o._legStepDuration) {
        o._legStepTimer = 0;
        // flip direction occasionally for variety (small chance)
        if (Math.random() < 0.35) o._legDir = -o._legDir || -walkDir;
        // slightly randomize duration and stride to avoid rigid sync
        o._legStepDuration = 0.7 + Math.random() * 0.6;
        o._legStride = Math.min(52, Math.max(16, o._legStride * (0.94 + (Math.random() * 0.12))));
      }
    }

    // Constants tuned for parity with player physics
    const gravity = 900; // px/s^2
    const friction = typeof o.friction === "number" ? o.friction : 0.15;

    // apply gravity
    o.vy += gravity * dt;

    // integrate velocity (predictive)
    o.x += o.vx * dt;
    o.y += o.vy * dt;

    // integrate angular motion with torque/inertia handling
    if (typeof o.angularVelocity !== "number") o.angularVelocity = 0;
    if (typeof o._inertia !== "number" || o._inertia <= 0) {
      // fallback moment of inertia approximation for a rectangle: I = m*(w^2+h^2)/12
      o._inertia = (typeof o.mass === "number" ? o.mass : 1) * ((o.w * o.w + o.h * o.h) / 12) || 1;
    }

    // Angular integration: apply accumulated angularVelocity then damp
    // Allow small clamping to avoid runaway rotation
    o.angle = (o.angle || 0) + o.angularVelocity * dt;
    // angular damping scaled by dt (exponential-ish)
    const ANG_DAMP = 3.0; // damping coefficient (higher -> faster stop)
    o.angularVelocity *= Math.max(0, 1 - ANG_DAMP * dt);

    // apply simple horizontal friction (damps vx over time)
    o.vx *= Math.max(0, 1 - friction * dt * 3);

    // Enforce glue constraints softly for any glued partners so glued objects remain attached during physics.
    // We apply a spring-like positional correction and couple a small share into velocity to keep motion natural.
    try {
      if (Array.isArray(o.gluedTo) && o.gluedTo.length > 0) {
        for (const partnerId of o.gluedTo) {
          const p = objects.find((xx) => xx.id === partnerId);
          if (!p) continue;
          // Determine stored offset: prefer o._glueOffsets[partnerId], otherwise compute from current centers
          const centerO = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
          let desiredOffset = null;
          if (o._glueOffsets && o._glueOffsets[partnerId]) {
            desiredOffset = o._glueOffsets[partnerId];
          } else if (p._glueOffsets && p._glueOffsets[o.id]) {
            const off = p._glueOffsets[o.id];
            desiredOffset = { x: -off.x, y: -off.y };
          } else {
            desiredOffset = { x: (p.x + p.w / 2) - centerO.x, y: (p.y + p.h / 2) - centerO.y };
            // store symmetric offsets for future iterations
            if (!o._glueOffsets) o._glueOffsets = {};
            if (!p._glueOffsets) p._glueOffsets = {};
            o._glueOffsets[partnerId] = desiredOffset;
            p._glueOffsets[o.id] = { x: -desiredOffset.x, y: -desiredOffset.y };
          }

          // Compute desired world center for this object based on partner center + stored offset
          const partnerCenter = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
          const targetCenter = { x: partnerCenter.x - desiredOffset.x, y: partnerCenter.y - desiredOffset.y };

          // Positional error vector
          const errX = targetCenter.x - centerO.x;
          const errY = targetCenter.y - centerO.y;
          const errLen = Math.hypot(errX, errY);

          // Soft spring correction: stronger when error larger, scale by dt so stable
          const SPRING_K = 8.0; // stiffness
          const DAMP_K = 0.25; // velocity coupling damping
          if (errLen > 0.5) {
            // apply position correction proportional to stiffness and dt
            const corrX = (errX * SPRING_K) * dt;
            const corrY = (errY * SPRING_K) * dt;

            // move object slightly towards target (limits to avoid tunneling)
            o.x += corrX;
            o.y += corrY;

            // couple a bit into velocity so momentum feels continuous
            o.vx += (corrX * DAMP_K) * 60;
            o.vy += (corrY * DAMP_K) * 60;

            // also damp angular mismatch gently if partner rotates differently
            const angDiff = (p.angle || 0) - (o.angle || 0);
            o.angularVelocity += angDiff * 0.02;
          }
        }
      }
    } catch (e) {
      // ignore glue enforcement errors
    }

    // Additionally enforce glue constraints for non-colliding objects (e.g., seats) so they follow glued masters during play.
    try {
      objects.forEach((o2) => {
        if (!Array.isArray(o2.gluedTo) || o2.gluedTo.length === 0) return;
        for (const partnerId of o2.gluedTo) {
          const p = objects.find((xx) => xx.id === partnerId);
          if (!p) continue;
          const centerO = { x: o2.x + o2.w / 2, y: o2.y + o2.h / 2 };
          let desiredOffset = null;
          if (o2._glueOffsets && o2._glueOffsets[partnerId]) {
            desiredOffset = o2._glueOffsets[partnerId];
          } else if (p._glueOffsets && p._glueOffsets[o2.id]) {
            const off = p._glueOffsets[o2.id];
            desiredOffset = { x: -off.x, y: -off.y };
          } else {
            desiredOffset = { x: (p.x + p.w / 2) - centerO.x, y: (p.y + p.h / 2) - centerO.y };
            if (!o2._glueOffsets) o2._glueOffsets = {};
            if (!p._glueOffsets) p._glueOffsets = {};
            o2._glueOffsets[partnerId] = desiredOffset;
            p._glueOffsets[o2.id] = { x: -desiredOffset.x, y: -desiredOffset.y };
          }

          const partnerCenter = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
          const targetCenter = { x: partnerCenter.x - desiredOffset.x, y: partnerCenter.y - desiredOffset.y };

          const errX = targetCenter.x - centerO.x;
          const errY = targetCenter.y - centerO.y;
          const errLen = Math.hypot(errX, errY);

          const SPRING_K = 8.0;
          const DAMP_K = 0.25;
          if (errLen > 0.5) {
            const corrX = (errX * SPRING_K) * dt;
            const corrY = (errY * SPRING_K) * dt;

            o2.x += corrX;
            o2.y += corrY;

            o2.vx = (o2.vx || 0) + (corrX * DAMP_K) * 60;
            o2.vy = (o2.vy || 0) + (corrY * DAMP_K) * 60;

            const angDiff = (p.angle || 0) - (o2.angle || 0);
            o2.angularVelocity = (o2.angularVelocity || 0) + angDiff * 0.02;
          }
        }
      });
    } catch (e) {
      // ignore
    }

    // Prevent penetrating the world floor
    if (o.y + o.h > worldHeight) {
      o.y = worldHeight - o.h;
      o.vy = 0;
      // small bounce into angular motion when hitting floor unevenly
      if (Math.abs(o.angularVelocity) < 0.0001 && Math.abs(o.vx) > 60) {
        o.angularVelocity += (o.vx / Math.max(0.1, o._inertia)) * 0.005;
      }
    }

    // Per-corner support test: detect whether left and right bottom corners are supported by other solids.
    // If one side is unsupported (e.g., only left supported), apply a stronger tipping torque so the block rotates toward the unsupported side.
    // Also couple angular motion into linear motion so a tipping block gains downward/sideways velocity and will "fall over" more realistically.
    try {
      const SUPPORT_CHECK_EPS = 2; // pixels below the corner to probe
      const probeW = Math.max(4, Math.min(8, Math.round(o.w * 0.08)));
      const probeH = 2;
      const leftProbeX = o.x + 2;
      const rightProbeX = o.x + o.w - probeW - 2;
      const probeY = Math.round(o.y + o.h + SUPPORT_CHECK_EPS);

      let supportLeft = false;
      let supportRight = false;

      for (const other of objects) {
        if (other === o) continue;
        // ignore non-solid (terrain is solid where stamps exist)
        if (other.type === "terrain") {
          // test against terrain stamps if present
          if (Array.isArray(other.stamps) && other.stamps.length > 0) {
            for (const s of other.stamps) {
              if (rectsOverlap(leftProbeX, probeY, probeW, probeH, s.x, s.y, s.w, s.h)) supportLeft = true;
              if (rectsOverlap(rightProbeX, probeY, probeW, probeH, s.x, s.y, s.w, s.h)) supportRight = true;
            }
          } else {
            if (rectsOverlap(leftProbeX, probeY, probeW, probeH, other.x, other.y, other.w, other.h)) supportLeft = true;
            if (rectsOverlap(rightProbeX, probeY, probeW, probeH, other.x, other.y, other.w, other.h)) supportRight = true;
          }
        } else {
          // normal AABB test for other rectangular solids
          if (rectsOverlap(leftProbeX, probeY, probeW, probeH, other.x, other.y, other.w, other.h)) supportLeft = true;
          if (rectsOverlap(rightProbeX, probeY, probeW, probeH, other.x, other.y, other.w, other.h)) supportRight = true;
        }
        // early out if both supported
        if (supportLeft && supportRight) break;
      }

      // If asymmetrically supported, apply tipping torque: push rotation toward the unsupported side.
      // Increase torque responsiveness and also convert part of angular velocity into linear acceleration so blocks fall.
      if (supportLeft && !supportRight) {
        // left supported only -> tip to the right (positive angularVelocity)
        const TIP_FACTOR = 0.030; // increased scalar for stronger tipping
        const lever = 1.0; // approximate lever arm factor
        const massFactor = Math.max(0.1, (o.mass || 1));
        const torque = gravity * TIP_FACTOR * lever / massFactor;
        o.angularVelocity += torque * dt;

        // Angular-to-linear coupling: when tipping, push the free edge downward and sideways a bit.
        const tipStrength = Math.min(1.0, Math.abs(o.angularVelocity) * 0.6 + 0.05);
        // nudge rightwards and downward proportionally (world coords)
        o.vx += Math.sign(o.angularVelocity || 1) * 8 * tipStrength * dt * 60;
        o.vy += 12 * tipStrength * dt * 60;
      } else if (supportRight && !supportLeft) {
        // right supported only -> tip to the left (negative angularVelocity)
        const TIP_FACTOR = 0.030;
        const lever = 1.0;
        const massFactor = Math.max(0.1, (o.mass || 1));
        const torque = gravity * TIP_FACTOR * lever / massFactor;
        o.angularVelocity -= torque * dt;

        const tipStrength = Math.min(1.0, Math.abs(o.angularVelocity) * 0.6 + 0.05);
        o.vx -= Math.sign(o.angularVelocity || -1) * 8 * tipStrength * dt * 60;
        o.vy += 12 * tipStrength * dt * 60;
      } else {
        // If fully supported, lightly damp any small angular drift to let blocks settle.
        const ANG_SETTLE = 0.98;
        o.angularVelocity *= Math.max(0, ANG_SETTLE - dt);
      }

      // If block has rotated beyond a threshold angle, encourage it to "fall over" faster:
      // when |angle| exceeds ~0.6 rad (~34deg) and one side is unsupported, apply an extra torque and convert angular energy to downward motion.
      const FALL_ANGLE = 0.6;
      if ((supportLeft && !supportRight) || (supportRight && !supportLeft)) {
        if (Math.abs(o.angle || 0) > FALL_ANGLE || Math.abs(o.angularVelocity) > 0.6) {
          // stronger damping of inertia to speed up toppling for small objects (simulating hinge slip)
          const extra = 0.6;
          o.angularVelocity *= 1 + extra * dt;
          // add downward impulse at center so block will detach/translate as it tips
          o.vy += 28 * dt * (1 + Math.min(1, Math.abs(o.angularVelocity)));
          // slight horizontal shift away from support (so block falls outward)
          o.vx += (supportLeft && !supportRight ? 18 : -18) * dt * Math.min(1, Math.abs(o.angularVelocity));
        }
      }
    } catch (e) {
      // if anything goes wrong in support probing, ignore and continue
    }

    // Prevent leaving left/right bounds (clamp and dissipate momentum)
    if (o.x < 0) {
      o.x = 0;
      o.vx = 0;
      o.angularVelocity *= 0.5;
    }
    if (o.x + o.w > worldWidth) {
      o.x = worldWidth - o.w;
      o.vx = 0;
      o.angularVelocity *= 0.5;
    }

    // Collide against other solid objects (simple AABB separation)
    // We'll test against all other solid objects and resolve penetration by axis with minimal translation.
    // Additionally compute a simple contact impulse to produce rotational torque when collisions occur.
    const solids = objects.filter((other) => other !== o);

    for (const other of solids) {
      // perform AABB overlap test using rotated-aware AABBs
      const a = getAABBForObject(o);
      const b = getAABBForObject(other);

      const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

      if (overlapX > 0 && overlapY > 0) {
        // Compute contact center (approx) for lever arm calculation (use AABB centers)
        const contactX = Math.max(a.x, Math.min((b.x + b.w / 2), a.x + a.w));
        const contactY = Math.max(a.y, Math.min((b.y + b.h / 2), a.y + a.h));

        // Determine the smaller penetration axis and separate along it.
        if (overlapX < overlapY) {
          // Separate horizontally
          const push = overlapX + 0.01;
          if (o.x < other.x) {
            o.x -= push;
            if (o.vx > 0) o.vx *= 0.2;
          } else {
            o.x += push;
            if (o.vx < 0) o.vx *= 0.2;
          }

          // Apply a rotational impulse based on relative horizontal velocity and contact lever arm
          try {
            const relVel = (o.vx || 0) - (other.vx || 0);
            const lever = (contactY - (o.y + o.h / 2)) / (o.h / 2 || 1); // -1..1
            const impulse = relVel * 0.02; // small scalar to convert linear vel -> angular impulse
            const torque = impulse * lever;
            o.angularVelocity += torque / Math.max(0.0001, o._inertia);
          } catch (e) {}
        } else {
          // Separate vertically
          const push = overlapY + 0.01;
          if (o.y < other.y) {
            o.y -= push;
            // land: transfer energy into small bounce using restitution
            o.vy = Math.min(o.vy * -o.restitution, 0);
          } else {
            o.y += push;
            if (o.vy < 0) o.vy = 0;
          }

          // Vertical impacts also create torque if off-center
          try {
            const relVel = (o.vy || 0) - (other.vy || 0);
            const lever = (contactX - (o.x + o.w / 2)) / (o.w / 2 || 1); // -1..1
            const impulse = relVel * 0.02;
            const torque = -impulse * lever;
            o.angularVelocity += torque / Math.max(0.0001, o._inertia);
          } catch (e) {}
        }

        // clamp position inside world bounds post resolution
        if (o.x < 0) o.x = 0;
        if (o.x + o.w > worldWidth) o.x = worldWidth - o.w;
        if (o.y + o.h > worldHeight) {
          o.y = worldHeight - o.h;
          o.vy = 0;
        }
      }
    }

    // Small numerical thresholds to settle the object
    if (Math.abs(o.vx) < 0.01) o.vx = 0;
    if (Math.abs(o.vy) < 0.01) o.vy = 0;
    if (Math.abs(o.angularVelocity) < 0.0005) o.angularVelocity = 0;

    // Stabilize angle to keep visuals reasonable (optional wrap)
    // Keep angles within -PI..PI to avoid floating growth over long runs
    if (typeof o.angle === "number") {
      if (o.angle > Math.PI) o.angle -= Math.PI * 2;
      else if (o.angle < -Math.PI) o.angle += Math.PI * 2;
    }
  });
}

/* Attach leg blocks to nearby NPCs when entering play mode so NPCs can "wear" legs and animate them.
   Attached leg blocks are recorded on the NPC as npc._legs = [blockId,...] and the block stores _attachedTo = npcId.
   Detach function cleans up these transient links and restores blocks to editor state on play stop. */
function attachLegsToNPCs() {
  // Clear any previous transient attachments
  objects.forEach(o => {
    if (o.type === "colliding" && o.action === "leg") {
      delete o._attachedTo;
      // ensure leg anchor will be recomputed from NPC when attached
      delete o._savedLegAnchor;
    }
  });
  // For each NPC, find nearby leg blocks and attach up to 2 legs (configurable)
  const MAX_LEGS_PER_NPC = 4;
  const ATTACH_RADIUS = 160;
  objects.forEach(npc => {
    if (npc.type !== "npc") return;
    npc._legs = npc._legs || [];
    // find candidate leg blocks not already attached
    const candidates = objects.filter(o => o.type === "colliding" && o.action === "leg" && !o._attachedTo);
    // sort by proximity to npc
    candidates.sort((a,b) => {
      const da = Math.hypot((a.x + a.w/2)-(npc.x + npc.w/2), (a.y + a.h/2)-(npc.y + npc.h/2));
      const db = Math.hypot((b.x + b.w/2)-(npc.x + npc.w/2), (b.y + b.h/2)-(npc.y + npc.h/2));
      return da - db;
    });
    for (let i = 0; i < candidates.length && npc._legs.length < MAX_LEGS_PER_NPC; i++) {
      const leg = candidates[i];
      const dist = Math.hypot((leg.x + leg.w/2)-(npc.x + npc.w/2), (leg.y + leg.h/2)-(npc.y + npc.h/2));
      if (dist <= ATTACH_RADIUS) {
        // attach
        leg._attachedTo = npc.id;
        npc._legs.push(leg.id);
        // record saved editor anchor to restore later if necessary
        leg._savedX = typeof leg._savedX === "number" ? leg._savedX : leg.x;
        leg._savedY = typeof leg._savedY === "number" ? leg._savedY : leg.y;
        // initial anchor positioned relative to NPC (above)
        leg.legAnchor = { x: Math.round(npc.x + npc.w/2), y: Math.round(npc.y - Math.max(40, Math.round(leg.h * 0.9))) };
        // initialize leg stepping state for smooth motion
        leg._legPhase = leg._legPhase || 0;
        leg._legDir = leg._legDir || (Math.random() > 0.5 ? 1 : -1);
        leg._legStepTimer = leg._legStepTimer || 0;
        leg._legStepDuration = leg._legStepDuration || (0.9 + ((leg.id % 5) * 0.12));
        leg._legStride = leg._legStride || Math.min(42, Math.max(18, (leg.w + leg.h) * 0.06));
      }
    }
  });
}

function detachLegsFromNPCs() {
  // Remove transient attachments and restore editor positions if saved
  objects.forEach(o => {
    if (o.type === "colliding" && o.action === "leg") {
      if (o._attachedTo) {
        delete o._attachedTo;
      }
      // restore saved editor coordinates if they were recorded when attaching
      if (typeof o._savedX === "number") {
        o.x = o._savedX;
        delete o._savedX;
      }
      if (typeof o._savedY === "number") {
        o.y = o._savedY;
        delete o._savedY;
      }
      // clear stepping transient fields
      delete o._legPhase;
      delete o._legDir;
      delete o._legStepTimer;
      delete o._legStepDuration;
      delete o._legStride;
      delete o.legAnchor;
    }
  });
  // Also clear NPC side lists
  objects.forEach(o => {
    if (o.type === "npc") {
      delete o._legs;
    }
  });
}

function updateNPCs(dt) {
  if (!player) {
    objects.forEach((o) => {
      if (o.type === "npc") o.playerNear = false;
    });
    return;
  }

  const npcMoveSpeed = 120;
  const npcJumpSpeed = -320;
  const npcGravity = 900;

  const playerCenterX = player.x + player.w / 2;
  const playerCenterY = player.y + player.h / 2;

  objects.forEach((npc) => {
    if (npc.type !== "npc") return;

    // Ensure runtime fields exist
    if (typeof npc.vx !== "number") npc.vx = 0;
    if (typeof npc.vy !== "number") npc.vy = 0;
    if (typeof npc.onGround !== "boolean") npc.onGround = false;
    if (typeof npc.jumpTimer !== "number") npc.jumpTimer = 0;

    const npcCenterX = npc.x + npc.w / 2;
    const npcCenterY = npc.y + npc.h / 2;
    const dx = playerCenterX - npcCenterX;
    const dy = playerCenterY - npcCenterY;
    const dist = Math.hypot(dx, dy);
    const threshold =
      typeof npc.npcRange === "number" && npc.npcRange > 0
        ? npc.npcRange
        : Math.max(npc.w, npc.h, 80);

    const isNear = dist < threshold;
    npc.playerNear = isNear;

    // Behavior based on action
    if (npc.npcAction === "attack" && playMode && isNear) {
      respawnPlayer();
      return;
    }

    if (npc.npcAction === "jump") {
      npc.jumpTimer += dt;
      if (npc.onGround && npc.jumpTimer > 1.5) {
        npc.vy = npcJumpSpeed;
        npc.onGround = false;
        npc.jumpTimer = 0;
      }
    } else if (npc.npcAction === "chase") {
      if (isNear) {
        const dir = dx === 0 ? 0 : dx / Math.abs(dx);
        npc.vx = dir * npcMoveSpeed;
      } else {
        npc.vx = 0;
      }
    } else {
      // default / talk / none: no movement
      npc.vx = 0;
    }

    // Gravity
    npc.vy += npcGravity * dt;

    const solids = objects.filter((o) => o !== npc);

    // Horizontal move with collision
    let newX = npc.x + npc.vx * dt;
    let resolvedX = newX;

    for (const o of solids) {
      const overlapsVertically =
        npc.y < o.y + o.h && npc.y + npc.h > o.y;
      const overlapsHorizontally =
        newX < o.x + o.w && newX + npc.w > o.x;

      if (overlapsHorizontally && overlapsVertically) {
        // If NPC hits a dynamic colliding block, transfer horizontal momentum so NPC can push it
        if (o.type === "colliding" && o.dynamic) {
          try {
            if (typeof o.vx !== "number") o.vx = 0;
            // transfer a fraction of NPC horizontal velocity to the block
            const pushFactor = 0.45;
            o.vx += (npc.vx || 0) * pushFactor;
            // impart a small angular impulse based on contact vertical offset
            const contactY = Math.max(o.y, Math.min(npc.y + npc.h / 2, o.y + o.h));
            const lever = (contactY - (o.y + o.h / 2)) / (o.h / 2 || 1); // -1..1
            const torque = (npc.vx || 0) * 0.015 * lever;
            if (typeof o.angularVelocity !== "number") o.angularVelocity = 0;
            const invInertia = 1 / Math.max(0.0001, o._inertia || 1);
            o.angularVelocity += torque * invInertia;
            // Nudge the block to avoid deep penetration
            if (npc.vx > 0) {
              o.x = Math.max(o.x, npc.x + npc.w + 0.5);
            } else if (npc.vx < 0) {
              o.x = Math.min(o.x, npc.x - o.w - 0.5);
            }
          } catch (e) {}
          // allow NPC to continue moving into space (push)
          resolvedX = newX;
        } else {
          if (npc.vx > 0) {
            resolvedX = o.x - npc.w;
          } else if (npc.vx < 0) {
            resolvedX = o.x + o.w;
          }
          npc.vx = 0;
        }
      }
    }
    npc.x = resolvedX;

    // Vertical move with collision
    let newY = npc.y + npc.vy * dt;
    let resolvedY = newY;
    npc.onGround = false;

    for (const o of solids) {
      const overlapsHorizontally =
        npc.x < o.x + o.w && npc.x + npc.w > o.x;
      const overlapsVertically =
        newY < o.y + o.h && newY + npc.h > o.y;

      if (overlapsHorizontally && overlapsVertically) {
        // If NPC collides vertically with a dynamic colliding block, transfer vertical impulse
        if (o.type === "colliding" && o.dynamic) {
          try {
            if (typeof o.vy !== "number") o.vy = 0;
            const vertTransfer = 0.22; // fraction of NPC vertical speed transferred
            o.vy += (npc.vy || 0) * vertTransfer;
            // small angular impulse based on horizontal contact offset
            const contactX = Math.max(o.x, Math.min(npc.x + npc.w / 2, o.x + o.w));
            const lever = (contactX - (o.x + o.w / 2)) / (o.w / 2 || 1); // -1..1
            const torque = -(npc.vy || 0) * 0.02 * lever;
            if (typeof o.angularVelocity !== "number") o.angularVelocity = 0;
            o.angularVelocity += torque / Math.max(0.0001, o._inertia || 1);
          } catch (e) {}
        }

        if (npc.vy > 0) {
          // falling down onto top
          resolvedY = o.y - npc.h;
          npc.vy = 0;
          npc.onGround = true;
        } else if (npc.vy < 0) {
          // jumping into bottom
          resolvedY = o.y + o.h;
          npc.vy = 0;
        }
      }
    }
    npc.y = resolvedY;

    // Keep inside world bounds (use configured worldWidth/worldHeight)
    if (npc.x < 0) npc.x = 0;
    if (npc.x + npc.w > worldWidth) npc.x = worldWidth - npc.w;
    if (npc.y + npc.h > worldHeight) {
      npc.y = worldHeight - npc.h;
      npc.vy = 0;
      npc.onGround = true;
    }
  });
}

function gameLoop(timestamp) {
  if (!playMode) return;
  if (!lastFrameTime) lastFrameTime = timestamp;
  const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
  lastFrameTime = timestamp;

  updatePlayer(dt);
  updateNPCs(dt);
  updateProjectiles(dt);
  // update camera to follow player (or honor provided camera) each frame
  updateCamera();
  draw();
  requestAnimationFrame(gameLoop);
}

function setupJoystick() {
  if (!isTouchDevice || !joystickContainer) return;
  joystickContainer.innerHTML = "";
  joystickContainer.style.display = "block";

  joystickManager = nipplejs.create({
    zone: joystickContainer,
    mode: "dynamic",
    size: 100,
    color: "white",
  });

  joystickManager.on("move", (_, data) => {
    const angle = data.angle && data.angle.degree;
    if (angle == null) return;

    keys.left = false;
    keys.right = false;
    keys.up = false;

    if (angle > 45 && angle < 135) {
      // up
      keys.up = true;
    } else if (angle >= 135 && angle <= 225) {
      // left
      keys.left = true;
    } else if (angle > 315 || angle < 45) {
      // right
      keys.right = true;
    }
  });

  joystickManager.on("end", () => {
    keys.left = false;
    keys.right = false;
    keys.up = false;
  });
}

function teardownJoystick() {
  keys.left = false;
  keys.right = false;
  keys.up = false;

  if (joystickManager) {
    joystickManager.destroy();
    joystickManager = null;
  }
  if (joystickContainer) {
    joystickContainer.innerHTML = "";
    joystickContainer.style.display = "none";
  }
}

/* Iframe play-mode helpers: create DOM iframes for iframe blocks on play start and remove them on stop.
   These are positioned over the canvas using the canvas bounding rect and world->screen transform.
*/
function _createPlayIframes() {
  // remove any existing first
  _removePlayIframes();

  // container to host iframes so they layer above the canvas
  let container = document.getElementById("iframe-play-layer");

  // Prefer attaching the layer to the viewport wrapper so iframe positions are calculated
  // relative to the viewport instead of the whole document. This keeps iframes visually
  // inside the iframe block and correctly aligned when the page is scrolled or resized.
  const parent = viewport.parentElement || document.body;

  if (!container) {
    container = document.createElement("div");
    container.id = "iframe-play-layer";
    // position absolute inside the viewport wrapper parent
    container.style.position = "absolute";
    container.style.pointerEvents = "none"; // default off; individual iframes will enable pointer-events if needed
    container.style.zIndex = 50;
    // We'll size and position the container to exactly overlay the canvas's bounding rect.
    parent.appendChild(container);
  } else {
    container.innerHTML = "";
  }

  // Get viewport bounding rect and compute scale between CSS display and canvas buffer
  const rect = viewport.getBoundingClientRect();
  const scaleX = rect.width / viewport.width;
  const scaleY = rect.height / viewport.height;

  // Ensure the chosen parent is positioned (so absolute children align to it).
  // Prefer attaching the layer to the viewport wrapper so iframe positions are calculated
  // relative to the viewport instead of the whole document.
  let parentRect = parent.getBoundingClientRect
    ? parent.getBoundingClientRect()
    : { left: 0, top: 0 };

  // If parent has a static position, force it to relative so our absolute container aligns correctly.
  try {
    const computed = parent.ownerDocument
      ? parent.ownerDocument.defaultView.getComputedStyle(parent)
      : window.getComputedStyle(parent);
    if (computed && computed.position === "static") {
      parent.style.position = "relative";
    }
  } catch (e) {
    // ignore any cross-origin or read-only failures
  }

  // Place and size container to the canvas area
  container.style.left = (rect.left - parentRect.left) + "px";
  container.style.top = (rect.top - parentRect.top) + "px";
  container.style.width = rect.width + "px";
  container.style.height = rect.height + "px";
  container.style.pointerEvents = "none";
  container.style.overflow = "visible";

  objects.forEach((o) => {
    if (o.type !== "iframe") return;
    // Only create if visible (same semantics as explorer/objects)
    if (o.visible === false) return;

    const ifr = document.createElement("iframe");
    // allow scripts/styles inside iframe to run
    // give runtime iframes permission to run scripts and behave as same-origin so srcdoc / injected content functions correctly
    ifr.sandbox = "allow-scripts allow-same-origin";
    ifr.style.position = "absolute";
    // enable pointer events for interactive content
    ifr.style.pointerEvents = "auto";
    ifr.style.border = "1px solid rgba(255,255,255,0.06)";
    ifr.style.borderRadius = "6px";
    ifr.style.overflow = "hidden";
    ifr.style.background = "transparent";

    // compute position relative to canvas top-left (container origin)
    const screenX = Math.round((o.x - (cameraX || 0)) * scaleX);
    const screenY = Math.round((o.y - (cameraY || 0)) * scaleY);
    const screenW = Math.max(8, Math.round(o.w * scaleX));
    const screenH = Math.max(8, Math.round(o.h * scaleY));

    ifr.style.left = screenX + "px";
    ifr.style.top = screenY + "px";
    ifr.style.width = screenW + "px";
    ifr.style.height = screenH + "px";

    // Use srcdoc so the provided HTML executes in the iframe
    // If obj.html is missing, fallback to an empty document.
    try {
      // Wrap user-provided HTML with a small protective shell so any "position:fixed"
      // or viewport-anchored styles inside the HTML cannot escape the iframe block.
      // The injected CSS resets margins, ensures 100% height, and forces fixed positioning
      // to behave as static so content stays confined to the iframe's box.
      const userHtml = o.html || "<!doctype html><html><body></body></html>";
      const protectiveSrcdoc = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
        html,body{height:100%;width:100%;margin:0;padding:0;overflow:hidden;background:transparent}
        /* Neutralize fixed/sticky elements so they don't stick to the host viewport */
        * { position: static !important; top: auto !important; left: auto !important; right: auto !important; bottom: auto !important; transform: none !important; }
        </style></head><body>${userHtml}</body></html>`;
      ifr.srcdoc = protectiveSrcdoc;
    } catch (e) {
      // older browsers might not support srcdoc assignment; fallback to writing after load
      ifr.src = "about:blank";
      ifr.addEventListener("load", () => {
        try {
          const doc = ifr.contentDocument || ifr.contentWindow.document;
          doc.open();
          // attempt the same protective wrapper when writing into the iframe
          const userHtml = o.html || "<!doctype html><html><body></body></html>";
          const protective = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
            html,body{height:100%;width:100%;margin:0;padding:0;overflow:hidden;background:transparent}
            * { position: static !important; top: auto !important; left: auto !important; right: auto !important; bottom: auto !important; transform: none !important; }
            </style></head><body>${userHtml}</body></html>`;
          doc.write(protective);
          doc.close();
        } catch (err) {
          // ignore cross-origin/write errors
        }
      }, { once: true });
    }

    // store reference for removal later and attach to container
    o._iframeEl = ifr;
    container.appendChild(ifr);
  });
}

function _removePlayIframes() {
  const container = document.getElementById("iframe-play-layer");
  // Remove stored iframe elements from objects and remove container from DOM.
  objects.forEach((o) => {
    if (o && o._iframeEl) {
      try { o._iframeEl.remove(); } catch (e) {}
      delete o._iframeEl;
    }
  });
  if (container && container.parentElement) {
    container.remove();
  }
}

/* Update positions/sizes of runtime iframes to match current camera and canvas scaling.
   Called each frame so iframe DOM elements remain aligned with moving world/camera. */
function updatePlayIframesPositions() {
  const container = document.getElementById("iframe-play-layer");
  if (!container || !viewport) return;

  // Compute canvas display rect and scale to map world->screen coordinates
  const rect = viewport.getBoundingClientRect();
  const scaleX = rect.width / viewport.width;
  const scaleY = rect.height / viewport.height;

  // Ensure container is positioned relative to the same parent as computed when created
  const parent = viewport.parentElement || document.body;
  const parentRect = parent.getBoundingClientRect ? parent.getBoundingClientRect() : { left: 0, top: 0 };

  container.style.left = (rect.left - parentRect.left) + "px";
  container.style.top = (rect.top - parentRect.top) + "px";
  container.style.width = rect.width + "px";
  container.style.height = rect.height + "px";

  // Update each iframe element for iframe blocks to track camera and scaling
  objects.forEach((o) => {
    if (o.type !== "iframe") return;
    if (!o._iframeEl) return;
    if (o.visible === false) {
      // hide if block is not visible
      o._iframeEl.style.display = "none";
      return;
    } else {
      o._iframeEl.style.display = "block";
    }

    const screenX = Math.round((o.x - (cameraX || 0)) * scaleX);
    const screenY = Math.round((o.y - (cameraY || 0)) * scaleY);
    const screenW = Math.max(8, Math.round(o.w * scaleX));
    const screenH = Math.max(8, Math.round(o.h * scaleY));

    // Apply transforms directly to iframe element
    try {
      o._iframeEl.style.left = screenX + "px";
      o._iframeEl.style.top = screenY + "px";
      o._iframeEl.style.width = screenW + "px";
      o._iframeEl.style.height = screenH + "px";
    } catch (e) {
      // ignore styling errors
    }
  });
}

function setPlayMode(on) {
  playMode = on;
  playBtn.disabled = on;
  stopBtn.disabled = !on;
  document.body.classList.toggle("play-mode", on);

  if (on) {
    spawnPlayer();
    projectiles = [];
    lastFrameTime = 0;

    // Save editor positions and rotation for colliding blocks so we can restore when play stops.
    objects.forEach((o) => {
      if (o.type === "colliding") {
        // store the editor (pre-play) placement and orientation
        o._savedX = o.x;
        o._savedY = o.y;
        o._savedAngle = typeof o.angle === "number" ? o.angle : 0;
        // persist leg anchor if this block is a leg so we can restore it after play
        if (o.action === "leg" && o.legAnchor && typeof o.legAnchor.x === "number") {
          o._savedLegAnchor = { x: o.legAnchor.x, y: o.legAnchor.y };
        }
        // ensure the dynamic flag is respected and runtime velocities/start angular velocity are zeroed
        o.dynamic = typeof o.dynamic === "boolean" ? o.dynamic : true;
        o.vx = typeof o.vx === "number" ? o.vx : 0;
        o.vy = typeof o.vy === "number" ? o.vy : 0;
        o.angularVelocity = typeof o.angularVelocity === "number" ? o.angularVelocity : 0;
      }

      // Also save seats' editor positions so seats return to their original spot after play stops.
      if (o.type === "seat") {
        if (typeof o._savedX !== "number") o._savedX = o.x;
        if (typeof o._savedY !== "number") o._savedY = o.y;
        // seats may be moved/dragged during play via glue constraints; zero runtime velocities for consistency
        o.vx = typeof o.vx === "number" ? o.vx : 0;
        o.vy = typeof o.vy === "number" ? o.vy : 0;
      }
    });

    // Save editor positions for colliding blocks so we can restore when play stops.
    objects.forEach((o) => {
      if (o.type === "colliding") {
        // store the editor (pre-play) placement
        o._savedX = o.x;
        o._savedY = o.y;
        // ensure the dynamic flag is respected and runtime velocities start at zero
        o.dynamic = typeof o.dynamic === "boolean" ? o.dynamic : true;
        o.vx = typeof o.vx === "number" ? o.vx : 0;
        o.vy = typeof o.vy === "number" ? o.vy : 0;
      }
    });

    // Freeze NPCs at their editor positions during play: save their action and position so we can restore later,
    // but DO NOT forcibly clear npcAction here — preserve configured behaviors so NPCs can act in play mode.
    objects.forEach((o) => {
      if (o.type === "npc") {
        // remember editor state so we can restore later
        if (typeof o._savedX !== "number") o._savedX = o.x;
        if (typeof o._savedY !== "number") o._savedY = o.y;
        if (typeof o._savedNpcAction === "undefined") o._savedNpcAction = o.npcAction || "none";
        // stop runtime movement velocities but keep npcAction so AI behaviors run during play
        o.vx = 0;
        o.vy = 0;
        o.onGround = false;
        // NOTE: do not override o.npcAction here; restore from _savedNpcAction when play stops
      }
    });

    // Create runtime iframes for any iframe blocks so their HTML executes in play mode
    try {
      _createPlayIframes();
    } catch (e) {
      console.warn("Failed to create play iframes:", e);
    }

    // Attach available leg blocks to NPCs so NPCs get legs that animate while playing
    try {
      attachLegsToNPCs();
    } catch (e) {
      console.warn("Failed to attach legs to NPCs:", e);
    }

    if (isTouchDevice) {
      setupJoystick();
    } else {
      teardownJoystick();
    }

    if (backgroundMusic) {
      try {
        backgroundMusic.currentTime = 0;
        backgroundMusic.loop = true;
        backgroundMusic.play();
      } catch (e) {
        // ignore autoplay errors
      }
    }

    requestAnimationFrame(gameLoop);
  } else {
    if (backgroundMusic) {
      backgroundMusic.pause();
    }
    teardownJoystick();

    // Remove runtime iframes created for play mode
    try {
      _removePlayIframes();
    } catch (e) {
      console.warn("Failed to remove play iframes:", e);
    }

    // Detach any leg blocks that were attached to NPCs during play and restore editor state
    try {
      detachLegsFromNPCs();
    } catch (e) {
      console.warn("Failed to detach legs from NPCs:", e);
    }

    // Restore colliding blocks to their saved editor positions and rotation so they don't remain pushed or rotated.
    objects.forEach((o) => {
      if (o.type === "colliding") {
        if (typeof o._savedX === "number" && typeof o._savedY === "number") {
          o.x = o._savedX;
          o.y = o._savedY;
          delete o._savedX;
          delete o._savedY;
        }
        // restore saved leg anchor if present
        if (o._savedLegAnchor) {
          o.legAnchor = { x: o._savedLegAnchor.x, y: o._savedLegAnchor.y };
          delete o._savedLegAnchor;
        }
        // restore saved angle if present
        if (typeof o._savedAngle === "number") {
          o.angle = o._savedAngle;
          delete o._savedAngle;
        }
        // clear runtime dynamics
        o.vx = 0;
        o.vy = 0;
        o.angularVelocity = 0;
      }
    });

    // Restore seats to their saved editor positions so they don't end up offset/negative after play.
    objects.forEach((o) => {
      if (o.type === "seat") {
        if (typeof o._savedX === "number" && typeof o._savedY === "number") {
          o.x = o._savedX;
          o.y = o._savedY;
          delete o._savedX;
          delete o._savedY;
        }
        // clear any transient runtime velocity/flags applied during play
        o.vx = 0;
        o.vy = 0;
      }
    });

    // Restore hidden/picked pickups (e.g., blasters) to their editor positions and visibility
    objects.forEach((o) => {
      if (o.type === "blaster" && o.picked) {
        // restore saved editor placement and make visible again
        if (typeof o._savedX === "number") o.x = o._savedX;
        if (typeof o._savedY === "number") o.y = o._savedY;
        o.visible = true;
        // clear runtime picked flag so future plays behave consistently
        delete o.picked;
        // keep _savedX/_savedY for persistence if desired; they no longer control runtime hiding
      }
    });

    // Restore NPCs that were "killed" during play by blaster projectiles:
    // NPCs hit by projectiles are hidden during play and have their runtime/editor coordinates saved
    // so they are restored to the editor state when play stops.
    objects.forEach((o) => {
      if (o.type === "npc" && o._hitDead) {
        if (typeof o._savedX === "number") o.x = o._savedX;
        if (typeof o._savedY === "number") o.y = o._savedY;
        o.visible = true;
        // clear transient runtime markers
        delete o._hitDead;
        delete o._savedX;
        delete o._savedY;
      }
    });

    // Restore NPC editor state saved before play: position and previous action, and clear runtime motion.
    objects.forEach((o) => {
      if (o.type === "npc") {
        if (typeof o._savedX === "number") {
          o.x = o._savedX;
          delete o._savedX;
        }
        if (typeof o._savedY === "number") {
          o.y = o._savedY;
          delete o._savedY;
        }
        if (typeof o._savedNpcAction !== "undefined") {
          o.npcAction = o._savedNpcAction;
          delete o._savedNpcAction;
        }
        // clear runtime velocities so editor shows stable state
        o.vx = 0;
        o.vy = 0;
        o.onGround = false;
      }
    });

    player = null;
    projectiles = [];
    lastFrameTime = 0;
    draw();
  }
}

/* Events */

toolboxButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    createObject(btn.dataset.type);
  });
});

toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setTool(btn.dataset.tool);
  });
});

explorerList.addEventListener("click", (e) => {
  const li = e.target.closest(".explorer-item");
  if (!li) return;
  const id = Number(li.dataset.id);

  // If we're awaiting a TriggerPart assignment, and a TriggerPart was selected to assign, perform assignment
  if (awaitingTriggerAssign && triggerAssignForId != null) {
    const triggerObj = objects.find((o) => o.id === triggerAssignForId);
    const targetObj = objects.find((o) => o.id === id);
    if (triggerObj && targetObj && triggerObj.type === "triggerpart") {
      // assign the block id to the trigger; hide the target initially
      triggerObj.triggerAssignedId = targetObj.id;
      targetObj.visible = false;
      // update the assigned-name input UI
      const assignedNameInput = document.getElementById("prop-trigger-assigned-name");
      if (assignedNameInput) assignedNameInput.value = targetObj.name || `(id ${targetObj.id})`;
      // clear assignment mode
      awaitingTriggerAssign = false;
      triggerAssignForId = null;
      // refresh UI
      refreshExplorer();
      draw();
    }
    return;
  }

  // Normal click: select object in editor
  setSelected(id);
});

// Properties
[propName, propX, propY, propW, propH, propRotation, propColor].forEach((input) => {
  input.addEventListener("input", () => {
    applyPropertiesFromInputs();
  });
});
// Wire iframe HTML textarea so edits apply immediately when present
const propIframeHtml = document.getElementById("prop-iframe-html");
if (propIframeHtml) {
  propIframeHtml.addEventListener("input", () => {
    applyPropertiesFromInputs();
  });
}
 // Wire element image URL input so changes apply immediately
const propImageUrlInput = document.getElementById("prop-image-url");
if (propImageUrlInput) {
  propImageUrlInput.addEventListener("input", () => {
    // clear asset selector if user types a custom URL
    const assetSelect = document.getElementById("prop-image-asset");
    if (assetSelect && assetSelect.value) {
      assetSelect.value = "";
    }
    applyPropertiesFromInputs();
  });
}

// Wire registered asset selector to fill the Image URL (supports asset:// shorthand)
const propImageAssetSelect = document.getElementById("prop-image-asset");
if (propImageAssetSelect) {
  propImageAssetSelect.addEventListener("change", () => {
    const v = propImageAssetSelect.value || "";
    // If an asset is chosen, set the image URL input to the asset shorthand and apply
    if (propImageUrlInput) {
      propImageUrlInput.value = v ? v : "";
      applyPropertiesFromInputs();
    }
  });
}

propAction.addEventListener("change", () => {
  const obj = getSelected();
  if (!obj) return;
  obj.action = propAction.value || "none";
  draw();
});

// Trigger target select: when editing a TriggerPart, update its triggerTarget and apply effects
const propTriggerSelect = document.getElementById("prop-trigger-target");
if (propTriggerSelect) {
  propTriggerSelect.addEventListener("change", () => {
    const obj = getSelected();
    if (!obj || obj.type !== "triggerpart") return;
    obj.triggerTarget = propTriggerSelect.value || "";
    // Apply trigger logic to reveal/hide elements accordingly
    applyTriggers();
    refreshExplorer();
    draw();
  });
}

// TriggerPart assignment button: enable selection mode so next Explorer click assigns that block to the TriggerPart
const propTriggerSelectBtn = document.getElementById("prop-trigger-select-action");
if (propTriggerSelectBtn) {
  propTriggerSelectBtn.addEventListener("click", () => {
    const obj = getSelected();
    if (!obj || obj.type !== "triggerpart") {
      // simple feedback: briefly flash button
      propTriggerSelectBtn.textContent = "Select a TriggerPart";
      setTimeout(() => (propTriggerSelectBtn.textContent = "Select Action"), 900);
      return;
    }
    awaitingTriggerAssign = true;
    triggerAssignForId = obj.id;
    propTriggerSelectBtn.textContent = "Click Explorer...";
    // Show current assigned name in input if present
    const assignedNameInput = document.getElementById("prop-trigger-assigned-name");
    if (assignedNameInput) {
      const target = objects.find((o) => o.id === obj.triggerAssignedId);
      assignedNameInput.value = target ? target.name : "(none)";
    }
    // return button to normal after a timeout in case user forgets
    setTimeout(() => {
      propTriggerSelectBtn.textContent = "Select Action";
      // if still awaiting, keep state but reset button text; user can click again
    }, 2400);
  });
}

// ApplyTriggers: reveal certain element types when a TriggerPart with triggerTarget === 'player' exists.
function applyTriggers() {
  // Legacy behavior: do not automatically reveal everything; keep current visibility.
  // This function can be used to apply broad rules in future; for now it ensures that
  // triggers without assignments do not retroactively change visibility.
  // (No-op to avoid surprising reveals.)
}

if (npcActionSelect) {
  npcActionSelect.addEventListener("change", () => {
    const obj = getSelected();
    if (!obj || obj.type !== "npc") return;
    obj.npcAction = npcActionSelect.value || "none";
    draw();
  });
}

if (npcTextInput) {
  npcTextInput.addEventListener("input", () => {
    const obj = getSelected();
    if (!obj || obj.type !== "npc") return;
    obj.npcText = npcTextInput.value || "";
    draw();
  });
}

if (npcRangeInput) {
  npcRangeInput.addEventListener("input", () => {
    const obj = getSelected();
    if (!obj || obj.type !== "npc") return;
    const v = Number(npcRangeInput.value);
    if (!Number.isNaN(v) && v > 0) {
      obj.npcRange = v;
      draw();
    }
  });
}

if (npcRespawnSelect) {
  npcRespawnSelect.addEventListener("change", () => {
    const obj = getSelected();
    if (!obj || obj.type !== "npc") return;
    obj.npcRespawn = npcRespawnSelect.value === "yes";
    draw();
  });
}

  // Keyboard controls for play mode (including 'E' to sit/stand)
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  // Sit/stand toggle
  if (key === "e") {
    // Only attempt sit toggling during play mode and when a player exists
    if (playMode && player) {
      tryToggleSeatForPlayer();
      // prevent default to avoid interfering with browser shortcuts
      e.preventDefault();
      return;
    }
  }

  if (key === "a" || key === "arrowleft") {
    keys.left = true;
  } else if (key === "d" || key === "arrowright") {
    keys.right = true;
  } else if (key === "w" || key === "arrowup" || key === " ") {
    keys.up = true;
  } else if (key === "s" || key === "arrowdown") {
    keys.down = true;
  } else if (key === "f") {
    // Fire using keyboard
    tryFireProjectile();
  } else if (key === "q") {
    // optional: quick dismount with Q
    if (playMode && player && player._riding) {
      // clear riding state
      delete player._riding;
    }
  }
});

window.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  if (key === "a" || key === "arrowleft") {
    keys.left = false;
  } else if (key === "d" || key === "arrowright") {
    keys.right = false;
  } else if (key === "w" || key === "arrowup" || key === " ") {
    keys.up = false;
  } else if (key === "s" || key === "arrowdown") {
    keys.down = false;
  }
});

/* Character image */

function loadCharacterImage(url) {
  if (!url) {
    charImage = null;
    charImageReady = false;
    draw();
    return;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    charImage = img;
    charImageReady = true;
    draw();
  };
  img.onerror = () => {
    charImage = null;
    charImageReady = false;
    draw();
  };
  img.src = url;
}

 // Attempt to toggle sitting on a nearby seat: if player is standing and overlaps a seat, sit; if already sitting, stand.
function tryToggleSeatForPlayer() {
  if (!player) return;
  // If already riding, dismount
  if (player._riding && player._riding.seatId) {
    delete player._riding;
    return;
  }

  // helper: strict overlap test
  function seatOverlapsPlayer(s) {
    return s.type === "seat" && s.visible !== false && player.x < s.x + s.w && player.x + player.w > s.x && player.y < s.y + s.h && player.y + player.h > s.y;
  }

  // find seat by strict overlap first
  let seat = objects.find(seatOverlapsPlayer);

  // If nothing overlaps, allow a proximity-based sit: nearest seat within a small radius (tolerance)
  if (!seat) {
    const MAX_NEARBY = 36; // world pixels tolerance for snapping to seat when near
    let best = null;
    let bestDist = Infinity;
    for (const s of objects) {
      if (s.type !== "seat" || s.visible === false) continue;
      // compute distance from player center to seat center
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      const sx = s.x + s.w / 2;
      const sy = s.y + s.h / 2;
      const d = Math.hypot(px - sx, py - sy);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    if (best && bestDist <= MAX_NEARBY) seat = best;
  }

  if (!seat) return;

  // Determine master block attached to the seat (prefer first gluedTo entry)
  let masterId = null;
  if (Array.isArray(seat.gluedTo) && seat.gluedTo.length > 0) {
    masterId = seat.gluedTo[0];
  }

  // Enter riding: record seatId and masterId; riding state may include a flag for one-frame jump intents
  player._riding = { seatId: seat.id, masterId: masterId, _wantJump: false };

  // Snap player to seat position immediately for clarity
  player.x = seat.x + seat.w / 2 - player.w / 2;
  player.y = seat.y - player.h + 2;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
}

charImageUrlInput.addEventListener("input", () => {
  const url = charImageUrlInput.value.trim();
  loadCharacterImage(url);
});

/* Embed code helpers */

function serializeState() {
  return {
    objects: objects.map((o) => ({
      id: o.id,
      type: o.type,
      name: o.name,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      color: o.color,
      action: o.action || "none",
      npcAction: o.npcAction || "none",
      npcText: o.npcText || "",
      npcRange: typeof o.npcRange === "number" ? o.npcRange : 80,
      npcRespawn: !!o.npcRespawn,
      hp: typeof o.hp === "number" ? o.hp : (o.type === "npc" ? 5 : undefined),
      // persist rotation so colliding blocks keep their orientation
      angle: typeof o.angle === "number" ? o.angle : 0,
      angularVelocity: typeof o.angularVelocity === "number" ? o.angularVelocity : 0,
      // element image url (if any)
      imageUrl: o.imageUrl || null,
      // persist spawn position so respawn is consistent across embeds
      npcSpawnX: typeof o.spawnX === "number" ? o.spawnX : o.x,
      npcSpawnY: typeof o.spawnY === "number" ? o.spawnY : o.y,
      // light-specific persistence: intensity and radius
      intensity: typeof o.intensity === "number" ? o.intensity : undefined,
      radius: typeof o.radius === "number" ? o.radius : undefined,
      // visibility and trigger-specific fields
      visible: typeof o.visible === "boolean" ? o.visible : true,
      triggerTarget: o.triggerTarget || null,
      // triggerAssignedId: when set, this is the object id that the TriggerPart will reveal when activated
      triggerAssignedId: typeof o.triggerAssignedId === "number" ? o.triggerAssignedId : null,
      // iframe-specific HTML content (preserve for saving/loading)
      html: typeof o.html === "string" ? o.html : null,
      // terrain-specific persistence: stamps (brush rectangles) and material name
      stamps: Array.isArray(o.stamps) ? o.stamps.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h, r: s.r })) : undefined,
      material: o.material || (o.type === "terrain" ? "grass" : undefined),
      // seat/glue persistence: save glued partners and any stored offsets so seats remain attached after load
      gluedTo: Array.isArray(o.gluedTo) && o.gluedTo.length ? o.gluedTo.slice() : undefined,
      // store glue offsets (map of partnerId -> {x,y}) for stable restoration
      glueOffsets: o._glueOffsets ? Object.fromEntries(Object.entries(o._glueOffsets).map(([k, v]) => [k, { x: v.x, y: v.y }])) : undefined,
    })),
    nextId,
    charImageUrl: charImageUrlInput.value || null,
    // persist background visual/audio so they travel with embeds
    bgImageUrl: bgImageUrl || null,
    backgroundMusicUrl: backgroundMusicUrl || null,
    // lighting settings
    lightingMode,
    globalBrightness,
    // world/map & camera
    worldWidth: worldWidth,
    worldHeight: worldHeight,
    cameraX: cameraX,
    cameraY: cameraY,
  };
}

function deserializeState(state) {
  if (!state || !Array.isArray(state.objects)) return;

  objects = state.objects.map((o) => {
    const base = {
      id: o.id,
      type: o.type,
      name: o.name,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      color: o.color,
      action: o.action || "none",
      npcAction: o.npcAction || "none",
      npcText: o.npcText || "",
      npcRange: typeof o.npcRange === "number" ? o.npcRange : 80,
      npcRespawn: !!o.npcRespawn,
      // light props
      intensity: typeof o.intensity === "number" ? o.intensity : typeof o.intensity === "undefined" && o.type === "light" ? 1 : o.intensity,
      radius: typeof o.radius === "number" ? o.radius : o.radius,
      playerNear: false,
      vx: 0,
      vy: 0,
      onGround: false,
      jumpTimer: 0,
      // restore rotation state (radians) so colliding blocks resume orientation
      angle: typeof o.angle === "number" ? o.angle : 0,
      angularVelocity: typeof o.angularVelocity === "number" ? o.angularVelocity : 0,
      // restore spawn position for respawning NPCs
      spawnX:
        typeof o.npcSpawnX === "number"
          ? o.npcSpawnX
          : typeof o.x === "number"
          ? o.x
          : 0,
      spawnY:
        typeof o.npcSpawnY === "number"
          ? o.npcSpawnY
          : typeof o.y === "number"
          ? o.y
          : 0,
      // persisted visibility / triggerTarget
      visible: typeof o.visible === "boolean" ? o.visible : true,
      triggerTarget: typeof o.triggerTarget === "string" ? o.triggerTarget : (o.triggerTarget == null ? "" : String(o.triggerTarget)),
      // persist assigned action block id for triggerparts
      triggerAssignedId: typeof o.triggerAssignedId === "number" ? o.triggerAssignedId : null,
      // restore terrain-specific data if present
      stamps: Array.isArray(o.stamps) ? o.stamps.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h, r: s.r })) : undefined,
      material: typeof o.material === "string" ? o.material : (o.type === "terrain" ? "grass" : undefined),
    };

    // colliding-specific persisted props
    if (o.type === "colliding") {
      base.mass = typeof o.mass === "number" ? o.mass : typeof o.mass === "undefined" ? 1.0 : o.mass;
      base.friction = typeof o.friction === "number" ? o.friction : 0.15;
      base.dynamic = typeof o.dynamic === "boolean" ? o.dynamic : true;
      base.vx = typeof o.vx === "number" ? o.vx : 0;
      base.vy = typeof o.vy === "number" ? o.vy : 0;
    }

    // restore element image url if available
    if (o.imageUrl) {
      base.imageUrl = o.imageUrl;
      // do not attempt to synchronously load here; setElementImageFromUrl will assign and load
      // but we need an object reference; we'll set after objects array is assigned
    } else {
      base.imageUrl = null;
    }

    // restore trigger-assigned id if present
    if (o.triggerAssignedId != null) {
      base.triggerAssignedId = typeof o.triggerAssignedId === "number" ? o.triggerAssignedId : null;
      // ensure an assigned block is hidden initially (if exists)
      // We'll hide after objects array is fully restored in deserializeState main body
    } else {
      base.triggerAssignedId = null;
    }

    // restore iframe/html content if present so runtime iframes will show the same content
    base.html = typeof o.html === "string" ? o.html : null;

    // Restore glue/seat persisted data (gluedTo array and glueOffsets)
    if (Array.isArray(o.gluedTo) && o.gluedTo.length) {
      base.gluedTo = o.gluedTo.slice();
    }

    if (o.glueOffsets && typeof o.glueOffsets === "object") {
      // convert to runtime _glueOffsets shape: { partnerId: {x,y} }
      base._glueOffsets = {};
      try {
        Object.keys(o.glueOffsets).forEach((k) => {
          const val = o.glueOffsets[k];
          if (val && typeof val.x === "number" && typeof val.y === "number") {
            base._glueOffsets[Number(k)] = { x: Number(val.x), y: Number(val.y) };
          }
        });
      } catch (e) {
        // ignore malformed offsets
      }
    }

    return base;
  });

  // After objects array created, attempt to load any element images referenced
  objects.forEach((o) => {
    if (o.imageUrl) {
      // attach runtime image placeholders and start loading/caching
      setElementImageFromUrl(o, o.imageUrl);
    }
    // If this object stored terrain stamps/material, ensure internal runtime fields exist
    if (o.type === "terrain") {
      if (Array.isArray(o.stamps) && o.stamps.length > 0) {
        // normalize stamp numeric fields
        o.stamps = o.stamps.map(s => ({ x: Number(s.x)||0, y: Number(s.y)||0, w: Number(s.w)||0, h: Number(s.h)||0, r: Number(s.r)||0 }));
      } else {
        o.stamps = Array.isArray(o.stamps) ? o.stamps : [];
      }
      o.material = typeof o.material === "string" ? o.material : "grass";
      // Prepare the pattern for drawing immediately (pattern may update when image loads)
      try { o._pattern = createMaterialPattern(o.material); } catch (e) { o._pattern = null; }
    }
  });

  // After restoring, ensure any trigger-assigned targets are hidden until a trigger activates them.
  objects.forEach((o) => {
    if (o.triggerAssignedId != null) {
      const target = objects.find((t) => t.id === o.triggerAssignedId);
      if (target) {
        target.visible = false;
      }
    }
  });

  // Recompute inertia for colliding blocks and ensure rotation runtime fields exist so saved angle/rotation works.
  objects.forEach((o) => {
    if (o.type === "colliding") {
      try {
        o._inertia = (typeof o.mass === "number" ? o.mass : 1) * ((o.w * o.w + o.h * o.h) / 12) || 1;
      } catch (e) {
        o._inertia = 1;
      }
      if (typeof o.angle !== "number") o.angle = 0;
      if (typeof o.angularVelocity !== "number") o.angularVelocity = 0;
    }
  });

  // Apply triggers hook (kept minimal)
  applyTriggers();

  nextId =
    typeof state.nextId === "number"
      ? state.nextId
      : (objects.reduce((m, o) => Math.max(m, o.id), 0) + 1) || 1;

  if (state.charImageUrl) {
    charImageUrlInput.value = state.charImageUrl;
    loadCharacterImage(state.charImageUrl);
  } else {
    charImageUrlInput.value = "";
    loadCharacterImage("");
  }

  // Restore background image and music if present in state
  if (state.bgImageUrl) {
    setBackgroundImageFromUrl(state.bgImageUrl);
  } else {
    bgImage = null;
    bgImageReady = false;
    bgImageUrl = null;
  }

  if (state.backgroundMusicUrl) {
    setBackgroundMusicFromUrl(state.backgroundMusicUrl);
  } else {
    if (backgroundMusic) {
      backgroundMusic.pause();
      backgroundMusic = null;
    }
    backgroundMusicUrl = null;
  }

  // restore lighting settings if present
  if (state.lightingMode) {
    lightingMode = state.lightingMode;
    const lm = document.getElementById("lighting-mode");
    if (lm) lm.value = lightingMode;
  }
  if (typeof state.globalBrightness === "number") {
    globalBrightness = Math.max(0, Math.min(1, state.globalBrightness));
    const gb = document.getElementById("lighting-brightness");
    if (gb) gb.value = globalBrightness;
  }

  // restore world/map size & camera if provided
  if (typeof state.worldWidth === "number" && state.worldWidth > 0) {
    worldWidth = Math.max(100, Math.round(state.worldWidth));
    const mw = document.getElementById("map-width");
    if (mw) mw.value = worldWidth;
  } else {
    // default to current canvas if missing
    worldWidth = Math.max(800, viewport.width);
  }
  if (typeof state.worldHeight === "number" && state.worldHeight > 0) {
    worldHeight = Math.max(100, Math.round(state.worldHeight));
    const mh = document.getElementById("map-height");
    if (mh) mh.value = worldHeight;
  } else {
    worldHeight = Math.max(600, viewport.height);
  }

  if (typeof state.cameraX === "number") {
    cameraX = Math.round(state.cameraX);
    const cx = document.getElementById("cam-x");
    if (cx) cx.value = cameraX;
  }
  if (typeof state.cameraY === "number") {
    cameraY = Math.round(state.cameraY);
    const cy = document.getElementById("cam-y");
    if (cy) cy.value = cameraY;
  }

  refreshExplorer();
  draw();
}

function encodeStateForUrl(state) {
  try {
    const json = JSON.stringify(state);
    const b64 = btoa(unescape(encodeURIComponent(json)));

    // If the encoded payload is very large, attempt to store it in localStorage under a short key
    // and return a small reference token instead to avoid extremely long URLs.
    // Try to persist when possible; if CAN_PERSIST is false we still attempt a safe fallback store
    // (some environments allow localStorage/sessionStorage even when the conservative CAN_PERSIST flag is false).
    const MAX_INLINE_LENGTH = 15000; // tuned threshold for safety (approx characters)
    if (b64.length > MAX_INLINE_LENGTH) {
      // Try storing to localStorage first (preferred)
      try {
        const key = `ministudio_blob_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        localStorage.setItem(key, b64);
        return `ref:${key}`;
      } catch (errLocal) {
        // If localStorage failed, attempt sessionStorage as a looser fallback
        try {
          const key = `ministudio_session_blob_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
          sessionStorage.setItem(key, b64);
          return `ref:session:${key}`;
        } catch (errSession) {
          // If persistence truly isn't allowed, log a warning and fall back to inline (still returns b64)
          console.warn("Large payload could not be stored in local/session storage; returning inline payload.", errLocal, errSession);
          return b64;
        }
      }
    }

    return b64;
  } catch (e) {
    return null;
  }
}

function decodeStateFromUrl(encoded) {
  try {
    if (!encoded) return null;

    // If encoded is a localStorage reference (ref:<key>), retrieve the stored payload.
    if (encoded.startsWith("ref:")) {
      const key = encoded.slice(4);
      try {
        const stored = localStorage.getItem(key);
        if (!stored) return null;
        const json = decodeURIComponent(escape(atob(stored)));
        return JSON.parse(json);
      } catch (err) {
        console.warn("Failed to decode referenced state from localStorage:", err);
        return null;
      }
    }

    // Otherwise assume it's an inline base64 payload.
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

// Reusable studio splash intro used by Save/Embed flows.
// Shows the packaged "Maded With Devdex" image on black, fades it in, waits durationMs, then fades out.
// Returns a promise that resolves when the splash finishes.
async function showStudioSplash(src = "https://2vtuk2m_nwhhcqiy0xg9.c.websim.com/studio.jpg?v=92&t=1778074714868", durationMs = 3000) {
  return new Promise((resolve) => {
    let splash = document.getElementById("studio-splash");
    if (!splash) {
      splash = document.createElement("div");
      splash.id = "studio-splash";
      splash.style.position = "fixed";
      splash.style.inset = "0";
      splash.style.zIndex = "10002";
      splash.style.background = "#000";
      splash.style.display = "flex";
      splash.style.alignItems = "center";
      splash.style.justifyContent = "center";
      splash.style.pointerEvents = "none";
      document.body.appendChild(splash);
    } else {
      splash.innerHTML = "";
      splash.style.display = "flex";
      splash.style.background = "#000";
    }

    const img = document.createElement("img");
    img.src = src;
    img.alt = "Studio";
    img.style.maxWidth = "80%";
    img.style.maxHeight = "80%";
    img.style.opacity = "0";
    img.style.transition = "opacity 700ms ease";
    img.style.display = "block";
    img.style.pointerEvents = "none";
    splash.appendChild(img);

    let done = false;
    function finish() {
      if (done) return;
      done = true;
      img.style.transition = "opacity 400ms ease";
      img.style.opacity = "0";
      setTimeout(() => {
        try {
          splash.style.display = "none";
          splash.remove();
        } catch (e) {}
        resolve();
      }, 420);
    }

    img.addEventListener(
      "load",
      () => {
        requestAnimationFrame(() => {
          img.style.opacity = "1";
        });
        setTimeout(finish, durationMs);
      },
      { once: true }
    );
    img.addEventListener(
      "error",
      () => {
        setTimeout(finish, durationMs);
      },
      { once: true }
    );
  });
}

function generateEmbedCode() {
  const state = serializeState();
  const encoded = encodeStateForUrl(state);
  if (!encoded) return null;

  // Build a clean URL without carrying over existing query params
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("state", encoded);
  url.searchParams.set("embed", "1");

  return `<iframe src="${url.toString()}" width="800" height="600" frameborder="0" allowfullscreen></iframe>`;
}

function loadStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("state");
  if (!encoded) {
    refreshExplorer();
    draw();
    return { params, hasState: false };
  }
  const state = decodeStateFromUrl(encoded);
  if (!state) {
    refreshExplorer();
    draw();
    return { params, hasState: false };
  }
  deserializeState(state);
  return { params, hasState: true };
}

/* Background music */

function setBackgroundImageFromFile(file) {
  if (!file) return;

  if (bgImageUrl) {
    URL.revokeObjectURL(bgImageUrl);
    bgImageUrl = null;
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (bgImageUrl && bgImageUrl !== url) {
      URL.revokeObjectURL(bgImageUrl);
    }
    bgImage = img;
    bgImageReady = true;
    bgImageUrl = url;
    draw();
  };
  img.onerror = () => {
    if (bgImageUrl && bgImageUrl === url) {
      URL.revokeObjectURL(bgImageUrl);
      bgImageUrl = null;
    }
    bgImage = null;
    bgImageReady = false;
    draw();
  };
  img.src = url;
}

/* Load background image from a URL (used when restoring from embed state) */
function setBackgroundImageFromUrl(url) {
  if (!url) {
    bgImage = null;
    bgImageReady = false;
    bgImageUrl = null;
    draw();
    return;
  }

  const img = new Image();
  img.onload = () => {
    bgImage = img;
    bgImageReady = true;
    bgImageUrl = url;
    draw();
  };
  img.onerror = () => {
    bgImage = null;
    bgImageReady = false;
    bgImageUrl = null;
    draw();
  };
  img.src = url;
}

/* Element image helpers: load & cache images used by individual objects */
function resolveAssetUrl(url) {
  if (!url) return url;
  if (typeof url !== "string") return url;
  // Support site-registered asset shorthand: asset://FILENAME
  if (url.startsWith("asset://")) {
    // Map to root-relative path. Trim leading slashes if provided.
    const rest = url.slice("asset://".length);
    // Basic sanitization: decodeURIComponent if encoded, otherwise use as-is
    try {
      const decoded = decodeURIComponent(rest);
      return "/" + decoded.replace(/^\/+/, "");
    } catch (e) {
      return "/" + rest.replace(/^\/+/, "");
    }
  }
  return url;
}

function setElementImageFromUrl(obj, url) {
  // Resolve asset:// shorthand to actual path
  if (url) {
    url = resolveAssetUrl(url);
  }

  if (!obj) return;

  // If this object previously referenced a different URL, decrement that cache entry's refcount.
  const prev = obj.imageUrl || null;
  if (prev) {
    const prevEntry = elementImageCache.get(prev);
    if (prevEntry && typeof prevEntry.refs === "number") {
      prevEntry.refs = Math.max(0, prevEntry.refs - 1);
      // If refcount drops to zero and the entry is not ready or is a blob URL, we can revoke/clean up safely.
      if (prevEntry.refs === 0) {
        // If this was a blob URL created elsewhere, revoke it if needed. We only revoke known blob: URLs.
        try {
          if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        } catch (e) {}
        // Keep the image element around if it's still useful, but remove the cache entry to avoid leaks.
        elementImageCache.delete(prev);
      } else {
        // leave the cached entry for other users
        elementImageCache.set(prev, prevEntry);
      }
    }
  }

  // Assign new association
  obj.imageUrl = url || null;
  obj._img = null;
  obj._imgReady = false;

  if (!url) {
    draw();
    return;
  }

  // If a cache entry exists, increment refs and reuse it
  if (elementImageCache.has(url)) {
    const cached = elementImageCache.get(url);
    cached.refs = (cached.refs || 0) + 1;
    obj._img = cached.img;
    obj._imgReady = Boolean(cached.ready);
    // If not yet loaded, ensure load handler updates all dependent objects when ready.
    if (!cached.ready) {
      cached.img.addEventListener(
        "load",
        () => {
          cached.ready = true;
          objects.forEach((o) => {
            if (o.imageUrl === url) {
              o._img = cached.img;
              o._imgReady = true;
            }
          });
          draw();
        },
        { once: true }
      );
    }
    draw();
    return;
  }

  // Create new cached image entry with refs = 1
  const img = new Image();
  img.crossOrigin = "anonymous";
  const entry = { img, ready: false, refs: 1 };
  elementImageCache.set(url, entry);

  img.onload = () => {
    const e = elementImageCache.get(url);
    if (e) e.ready = true;
    objects.forEach((o) => {
      if (o.imageUrl === url) {
        o._img = img;
        o._imgReady = true;
      }
    });
    draw();
  };
  img.onerror = () => {
    // Do not aggressively delete the cache entry if others still reference it; just mark not ready.
    const e = elementImageCache.get(url);
    if (e) {
      e.ready = false;
    } else {
      // fallback: ensure removal if something went unexpectedly wrong
      elementImageCache.delete(url);
    }
    objects.forEach((o) => {
      if (o.imageUrl === url) {
        o._img = null;
        o._imgReady = false;
      }
    });
    draw();
  };
  img.src = url;

  // immediate attach to this object so draw can show placeholder until ready
  obj._img = img;
  obj._imgReady = false;
  draw();
}

function setBackgroundMusicFromFile(file) {
  if (!file) return;

  if (backgroundMusic) {
    backgroundMusic.pause();
    backgroundMusic = null;
  }
  if (backgroundMusicUrl) {
    URL.revokeObjectURL(backgroundMusicUrl);
    backgroundMusicUrl = null;
  }

  backgroundMusicUrl = URL.createObjectURL(file);
  backgroundMusic = new Audio(backgroundMusicUrl);
  backgroundMusic.loop = true;

  if (playMode) {
    try {
      backgroundMusic.currentTime = 0;
      backgroundMusic.play();
    } catch (e) {
      // ignore autoplay errors
    }
  }
}

// Load background music from a URL (used when restoring from embed state)
function setBackgroundMusicFromUrl(url) {
  if (!url) {
    if (backgroundMusic) {
      backgroundMusic.pause();
      backgroundMusic = null;
    }
    backgroundMusicUrl = null;
    return;
  }

  if (backgroundMusic) {
    backgroundMusic.pause();
    backgroundMusic = null;
  }

  backgroundMusicUrl = url;
  backgroundMusic = new Audio(url);
  backgroundMusic.loop = true;

  if (playMode) {
    try {
      backgroundMusic.currentTime = 0;
      backgroundMusic.play();
    } catch (e) {
      // ignore autoplay errors
    }
  }
}

bgMusicFileInput.addEventListener("change", () => {
  const file = bgMusicFileInput.files && bgMusicFileInput.files[0];
  if (!file) return;
  setBackgroundMusicFromFile(file);
});

// URL-based background music (mirror background image URL system)
if (bgMusicUrlInput) {
  bgMusicUrlInput.addEventListener("input", () => {
    const url = (bgMusicUrlInput.value || "").trim();
    if (!url) {
      setBackgroundMusicFromUrl(null);
    } else {
      setBackgroundMusicFromUrl(url);
    }
  });
}

if (bgImageUrlInput) {
  bgImageUrlInput.addEventListener("input", () => {
    const url = (bgImageUrlInput.value || "").trim();
    // Use URL-based background images (or clear when empty)
    if (!url) {
      setBackgroundImageFromUrl(null);
    } else {
      setBackgroundImageFromUrl(url);
    }
  });
}

/* Map & Camera UI */
const mapWidthInput = document.getElementById("map-width");
const mapHeightInput = document.getElementById("map-height");
const camXInput = document.getElementById("cam-x");
const camYInput = document.getElementById("cam-y");

// Lighting controls
const lightingModeSelect = document.getElementById("lighting-mode");
const lightingBrightnessInput = document.getElementById("lighting-brightness");

// initialize property inputs with defaults
if (mapWidthInput) mapWidthInput.value = worldWidth;
if (mapHeightInput) mapHeightInput.value = worldHeight;
if (camXInput) camXInput.value = cameraX;
if (camYInput) camYInput.value = cameraY;

// Map sizing listeners
if (mapWidthInput) {
  mapWidthInput.addEventListener("input", () => {
    const v = Number(mapWidthInput.value);
    if (!Number.isNaN(v) && v >= 100) {
      worldWidth = Math.round(v);
      draw();
    }
  });
}
if (mapHeightInput) {
  mapHeightInput.addEventListener("input", () => {
    const v = Number(mapHeightInput.value);
    if (!Number.isNaN(v) && v >= 100) {
      worldHeight = Math.round(v);
      draw();
    }
  });
}
if (camXInput) {
  camXInput.addEventListener("input", () => {
    const v = Number(camXInput.value);
    if (!Number.isNaN(v)) {
      cameraX = Math.round(v);
      draw();
    }
  });
}
if (camYInput) {
  camYInput.addEventListener("input", () => {
    const v = Number(camYInput.value);
    if (!Number.isNaN(v)) {
      cameraY = Math.round(v);
      draw();
    }
  });
}

if (lightingModeSelect) {
  lightingModeSelect.addEventListener("change", () => {
    lightingMode = lightingModeSelect.value || "normal";
    document.body.classList.toggle("dark-mode", lightingMode === "dark");
    draw();
  });
}

if (lightingBrightnessInput) {
  lightingBrightnessInput.addEventListener("input", () => {
    const v = Number(lightingBrightnessInput.value);
    if (!Number.isNaN(v)) {
      globalBrightness = Math.max(0, Math.min(1, v));
      draw();
    }
  });
}

// Light-specific property inputs (dynamically exist in DOM but we can attach delegated listeners)
document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.id === "prop-light-intensity" || t.id === "prop-light-radius") {
    applyPropertiesFromInputs();
  }
});

/* Embed button */

embedBtn.addEventListener("click", async () => {
  const code = generateEmbedCode();
  if (!code) return;

  try {
    // Show the Devdex studio splash intro before copying the embed code so clipboard recipients see the same intro.
    await showStudioSplash("https://2vtuk2m_nwhhcqiy0xg9.c.websim.com/studio.jpg?v=92&t=1778074714868", 3000);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(code);
      // Lightweight feedback
      console.log("Embed code copied to clipboard.");
    } else {
      // Fallback: select + copy via a temporary textarea
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      console.log("Embed code copied to clipboard (fallback).");
    }
  } catch (e) {
    console.error("Failed to copy embed code:", e);
  }
});

saveBtn.addEventListener("click", async () => {
  // Build a permalink for the current project state
  const state = serializeState();
  const encoded = encodeStateForUrl(state);
  if (!encoded) return;

  // Build base project URL using URL/searchParams to ensure proper encoding of the state payload.
  const baseProjectUrlObj = new URL(window.location.pathname, window.location.origin);
  baseProjectUrlObj.searchParams.set("state", encoded);
  const baseProjectUrl = baseProjectUrlObj.toString();

  // Helper: compute world bounds from objects (mirrors updateCamera logic)
  const padding = 40;
  let worldMinX = 0;
  let worldMinY = 0;
  let worldMaxX = viewport.width;
  let worldMaxY = viewport.height;
  if (objects.length > 0) {
    worldMinX = Math.min(...objects.map((o) => o.x)) - padding;
    worldMinY = Math.min(...objects.map((o) => o.y)) - padding;
    worldMaxX = Math.max(...objects.map((o) => o.x + o.w)) + padding;
    worldMaxY = Math.max(...objects.map((o) => o.y + o.h)) + padding;
  }

  const minCameraX = Math.min(worldMinX, 0);
  const minCameraY = Math.min(worldMinY, 0);
  const maxCameraX = Math.max(worldMaxX - viewport.width, 0);
  const maxCameraY = Math.max(worldMaxY - viewport.height, 0);

  // Compute camera centered on current player (or spawn) so saved page focuses on the player's field of view.
  let camX = 0;
  let camY = 0;
  if (player) {
    camX = Math.round(player.x + player.w / 2 - viewport.width / 2);
    camY = Math.round(player.y + player.h / 2 - viewport.height / 2);
  } else {
    // fallback: center on first spawn or middle
    const spawn = objects.find((o) => o.type === "spawn");
    if (spawn) {
      camX = Math.round(spawn.x + spawn.w / 2 - viewport.width / 2);
      camY = Math.round(spawn.y + spawn.h / 2 - viewport.height / 2);
    } else {
      camX = 0;
      camY = 0;
    }
  }

  // Clamp camera to world bounds so the saved view doesn't show empty space
  if (typeof camX !== "number" || Number.isNaN(camX)) camX = 0;
  if (typeof camY !== "number" || Number.isNaN(camY)) camY = 0;
  camX = Math.max(minCameraX, Math.min(camX, maxCameraX));
  camY = Math.max(minCameraY, Math.min(camY, maxCameraY));

  // Build the final embed URL via URL/searchParams to avoid any unencoded characters breaking the link.
  const embedUrlObj = new URL(baseProjectUrl);
  embedUrlObj.searchParams.set("embed", "1");
  embedUrlObj.searchParams.set("camX", String(camX));
  embedUrlObj.searchParams.set("camY", String(camY));
  embedUrlObj.searchParams.set("camW", String(viewport.width));
  embedUrlObj.searchParams.set("camH", String(viewport.height));
  const embedUrl = embedUrlObj.toString();

  // Persist to localStorage so anonymous users can reload, but only when allowed (same-origin top-level).
  if (CAN_PERSIST) {
    try {
      localStorage.setItem("ministudio_last_state", encoded);
      // also record in the saved list for the Saved Games menu
      try {
        const gameTitleInput = document.getElementById("game-title");
        const title = (gameTitleInput && gameTitleInput.value) ? gameTitleInput.value.trim() : "Untitled";
        saveProjectRecord(encoded, title || "Untitled");
      } catch (errInner) {
        console.warn("Failed to add to saved list:", errInner);
      }
      console.log("Project state saved to localStorage.");
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  } else {
    console.log("Persistence disabled in this context; not saving to localStorage.");
  }

  // Use the shared showStudioSplash helper defined earlier to present the Devdex studio splash.

  // Show studio splash first (uses shipped asset path), then show loading overlay/progress and start play mode
  try {
    await showStudioSplash("https://2vtuk2m_nwhhcqiy0xg9.c.websim.com/studio.jpg?v=92&t=1778074714868", 3000);
  } catch (e) {
    // ignore splash errors and continue
  }

  // Provide lightweight user feedback: show loading screen with title and progress then start play mode
  const overlay = document.getElementById("loading-overlay");
  const bar = document.getElementById("loading-bar");
  const pct = document.getElementById("loading-percent");
  const titleEl = document.getElementById("loading-title");
  const gameTitleInput = document.getElementById("game-title");
  const gameTitle = (gameTitleInput && gameTitleInput.value) ? gameTitleInput.value.trim() : "Loading Game";

  if (overlay && bar && pct && titleEl) {
    titleEl.textContent = gameTitle;
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    bar.style.width = "0%";
    pct.textContent = "0%";

    // Smooth progress animation to 100% over ~1.2s, then start play mode.
    const totalMs = 1200;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / totalMs);
      const percent = Math.round(t * 100);
      bar.style.width = percent + "%";
      pct.textContent = percent + "%";
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Hide overlay and start play mode
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");
        // If we're already in embed mode, preserve that; otherwise enter play mode in the editor
        setPlayMode(true);
      }
    }
    requestAnimationFrame(step);
  }

  // Also create the embed preview in a new tab for convenience (non-blocking)
  try {
    const pageHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>Game Embed</title>
<style>
  html,body{height:100%;margin:0;background:#000;color:#fff;font-family:system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial; -webkit-font-smoothing:antialiased}
  .topbar{display:flex;gap:8px;align-items:center;padding:8px;background:#070707;border-bottom:1px solid rgba(255,255,255,0.05)}
  .url-input{flex:1;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:#0f0f0f;color:#fff;font-size:14px}
  .copy-btn{padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:#111;color:#fff;font-size:14px;cursor:pointer}
  .copy-btn:active{transform:translateY(1px)}
  .frame-wrap{position:fixed;inset:48px 0 0 0;height:calc(100% - 48px);width:100%;display:flex;align-items:stretch;justify-content:center;background:#000}
  iframe{width:100%;height:100%;border:0;display:block;opacity:0;transition:opacity 300ms ease}
  .splash{position:fixed;inset:48px 0 0 0;display:flex;align-items:center;justify-content:center;background:#000;z-index:10}
  .splash img{max-width:80%;max-height:80%;opacity:0;transition:opacity 700ms ease}
  @media (min-width:800px){
    .frame-wrap iframe{max-width:100%;max-height:100%}
  }
</style>
</head>
<body>
  <div class="topbar">
    <input id="embed-url" class="url-input" readonly value="${embedUrl}" />
    <button id="copy-btn" class="copy-btn">Copy URL</button>
    <button id="open-full-btn" class="copy-btn">Open Fullscreen</button>
  </div>

  <div class="splash" id="splash" style="display:none;">
    <img id="studioImg" src="https://2vtuk2m_nwhhcqiy0xg9.c.websim.com/studio.jpg?v=92&t=1778074714868" alt="Studio" />
  </div>

  <div class="frame-wrap" id="frameWrap">
    <iframe id="gameFrame" allowfullscreen frameborder="0"></iframe>
  </div>

<script>
  // Copy functionality for convenience
  const input = document.getElementById('embed-url');
  const btn = document.getElementById('copy-btn');
  const openBtn = document.getElementById('open-full-btn');

  // When the Copy button is clicked, show the studio intro splash briefly, then copy the URL.
  btn.addEventListener('click', async () => {
    try {
      const splash = document.getElementById('splash');
      const img = document.getElementById('studioImg');

      // Show splash and fade image in
      try {
        splash.style.display = 'flex';
        requestAnimationFrame(() => { img.style.opacity = '1'; });
      } catch (e) {}

      // Wait a short intro duration so users see the image (1200ms)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Perform copy after intro
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(input.value);
      } else {
        input.select();
        document.execCommand('copy');
      }
      btn.textContent = 'Copied!';

      // Fade out splash and hide after a short delay
      try {
        img.style.opacity = '0';
        setTimeout(() => { try { splash.style.display = 'none'; } catch(e){} }, 420);
      } catch (e) {}

      setTimeout(() => (btn.textContent = 'Copy URL'), 1500);
    } catch (e) {
      btn.textContent = 'Failed';
      setTimeout(() => (btn.textContent = 'Copy URL'), 1500);
    }
  });

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      try {
        window.open(input.value, '_blank');
      } catch (e) {
        // fallback: navigate current window
        window.location.href = input.value;
      }
    });
  }

  // Splash -> load iframe workflow: fade in studio image, wait ~3s, then load iframe and fade it in.
  (function() {
    const splash = document.getElementById('splash');
    const img = document.getElementById('studioImg');
    const iframe = document.getElementById('gameFrame');
    const targetSrc = ${JSON.stringify(embedUrl)};

    let finished = false;
    function finishSplash() {
      if (finished) return;
      finished = true;
      // hide splash
      img.style.opacity = '0';
      setTimeout(() => {
        try { splash.style.display = 'none'; } catch(e){}
      }, 420);
      // set iframe src and fade in
      iframe.src = targetSrc;
      // ensure a small delay so src assignment starts loading before fade-in
      setTimeout(() => { iframe.style.opacity = '1'; }, 120);
    }

    img.addEventListener('load', () => {
      requestAnimationFrame(() => {
        img.style.opacity = '1';
      });
      // wait 3s (including fade-in) then finish
      setTimeout(finishSplash, 3000);
    }, { once: true });

    img.addEventListener('error', () => {
      // if image fails, still wait then proceed
      setTimeout(finishSplash, 1200);
    }, { once: true });

    // Defensive: if image is cached and already complete
    if (img.complete) {
      requestAnimationFrame(() => { img.style.opacity = '1'; });
      setTimeout(finishSplash, 1200);
    }
  })();

  // Ensure the iframe wrapper resizes defensively (no-op placeholder)
  function resizeIframe() {
    const wrap = document.querySelector('.frame-wrap');
    if (!wrap) return;
  }
  window.addEventListener('resize', resizeIframe);
  window.addEventListener('load', resizeIframe);
</script>
</body>
</html>`;

    const blob = new Blob([pageHtml], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  } catch (e) {
    console.error("Failed to create/embed preview page:", e);
  }

  // Offer a download of a small .txt permalink file for users who prefer a local copy (non-blocking)
  try {
    const a = document.createElement("a");
    const dataBlob = new Blob([embedUrl], { type: "text/plain" });
    const dlUrl = URL.createObjectURL(dataBlob);
    a.href = dlUrl;
    a.download = "ministudio_permalink.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(dlUrl);
  } catch (e) {
    console.warn("Failed to create download:", e);
  }

  // Try copying to clipboard for convenience (non-blocking)
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(embedUrl);
      console.log("Embed URL copied to clipboard.");
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = embedUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      console.log("Embed URL copied to clipboard (fallback).");
    }
  } catch (e) {
    console.error("Failed to copy embed URL:", e);
  }
});

 // Play buttons
 playBtn.addEventListener("click", () => setPlayMode(true));
 stopBtn.addEventListener("click", () => setPlayMode(false));

// Canvas events (mouse + touch)
viewport.addEventListener("mousedown", (evt) => {
  if (playMode) {
    handleFireFromPointer(evt);
  } else {
    pointerDown(evt);
  }
});
viewport.addEventListener("mousemove", pointerMove);
window.addEventListener("mouseup", pointerUp);

viewport.addEventListener("touchstart", (evt) => {
  if (playMode) {
    handleFireFromPointer(evt);
  } else {
    pointerDown(evt);
  }
}, { passive: false });
viewport.addEventListener("touchmove", pointerMove, { passive: false });
window.addEventListener("touchend", pointerUp, { passive: false });

// Initial state
function tryFireProjectile(directionX) {
  if (!playMode || !player || !player.hasBlaster) return;

  const dir = directionX != null && directionX !== 0 ? Math.sign(directionX) : playerFacing;
  if (dir === 0) return;

  const speed = 420;
  const size = 8;
  const px = player.x + player.w / 2 - size / 2;
  const py = player.y + player.h / 2 - size / 2;

  projectiles.push({
    x: px,
    y: py,
    w: size,
    h: size,
    vx: dir * speed,
    vy: 0,
    life: 0,
  });
}

function handleFireFromPointer(evt) {
  if (!playMode || !player || !player.hasBlaster) return;
  const { x } = getCanvasPos(evt);
  const playerCenterX = player.x + player.w / 2;
  const dir = x >= playerCenterX ? 1 : -1;
  tryFireProjectile(dir);
}

/* Initialize Blockly workspace for block-based coding (Scratch-like blocks) */
function setupBlockly() {
  try {
    const toolboxXml = `
      <xml id="toolbox" style="display: none">
        <category name="Motion" colour="#4C97FF">
          <block type="motion_movesteps"></block>
          <block type="motion_turnright"></block>
          <block type="motion_turnleft"></block>
        </category>
        <category name="Looks" colour="#9966FF">
          <block type="looks_sayforsecs"></block>
          <block type="looks_say"></block>
        </category>
        <category name="Sound" colour="#D65CD6">
          <block type="sound_play"></block>
        </category>
        <category name="Events" colour="#FFD500">
          <block type="event_whenflagclicked"></block>
          <block type="event_whenkeypressed"></block>
        </category>
        <category name="Control" colour="#FFAB19">
          <block type="control_wait"></block>
          <block type="control_repeat"></block>
          <block type="control_if"></block>
        </category>
        <category name="Operators" colour="#40BF4A">
          <block type="operator_add"></block>
          <block type="operator_subtract"></block>
        </category>
        <category name="Variables" colour="#FF8C1A">
          <block type="variables_get"></block>
          <block type="variables_set"></block>
        </category>
        <category name="Embed" colour="#6A5ACD">
          <block type="iframe_html"></block>
        </category>
      </xml>`;

    const blocklyDiv = document.getElementById("blocklyDiv");
    if (!blocklyDiv) return;

    // Dispose existing workspace if present
    if (window._workspace) {
      window._workspace.dispose();
      window._workspace = null;
    }

    const toolbox = Blockly.utils.xml.textToDom(toolboxXml);
    const ws = Blockly.inject(blocklyDiv, {
      toolbox,
      grid: { spacing: 20, length: 2, colour: "#2b2b2b", snap: true },
      trashcan: true,
      zoom: { wheel: true, controls: true, startScale: 1 },
      renderer: "zelos",
      collapse: true,
      comments: true,
    });

    // Provide a tiny mapping of scratch-like block types to minimal blocks so blocks appear draggable.
    // These definitions are intentionally small: they create visual blocks that can be composed.
    const minimalBlocks = {
      // Events
      event_whenflagclicked: {
        init: function () {
          this.appendDummyInput().appendField("when flag clicked");
          this.setColour(60);
          this.setNextStatement(true);
        },
      },
      event_whenkeypressed: {
        init: function () {
          this.appendDummyInput().appendField("when key pressed").appendField(new Blockly.FieldDropdown([["space","SPACE"],["up","UP"],["down","DOWN"]]), "KEY");
          this.setColour(60);
          this.setNextStatement(true);
        },
      },
      // Motion
      motion_movesteps: {
        init: function () {
          this.appendDummyInput().appendField("move").appendField(new Blockly.FieldNumber(10, -9999, 9999), "STEPS").appendField("steps");
          this.setColour(120);
          this.setPreviousStatement(true);
          this.setNextStatement(true);
        },
      },
      motion_turnright: {
        init: function () {
          this.appendDummyInput().appendField("turn right").appendField(new Blockly.FieldNumber(15, -360, 360), "DEG").appendField("°");
          this.setColour(120);
          this.setPreviousStatement(true);
          this.setNextStatement(true);
        },
      },
      motion_turnleft: {
        init: function () {
          this.appendDummyInput().appendField("turn left").appendField(new Blockly.FieldNumber(15, -360, 360), "DEG").appendField("°");
          this.setColour(120);
          this.setPreviousStatement(true);
          this.setNextStatement(true);
        },
      },
      // Looks
      looks_sayforsecs: {
        init: function () {
          this.appendDummyInput().appendField("say").appendField(new Blockly.FieldTextInput("Hello"), "TEXT").appendField("for").appendField(new Blockly.FieldNumber(2, 0), "SECS").appendField("sec");
          this.setColour(260);
          this.setPreviousStatement(true);
          this.setNextStatement(true);
        },
      },
      looks_say: {
        init: function () {
          this.appendDummyInput().appendField("say").appendField(new Blockly.FieldTextInput("Hello"), "TEXT");
          this.setColour(260);
          this.setPreviousStatement(true);
          this.setNextStatement(true);
        },
      },
      // Sound
      sound_play: {
        init: function () {
          this.appendDummyInput().appendField("play sound").appendField(new Blockly.FieldTextInput("pop"), "SOUND");
          this.setColour(290);
          this.setPreviousStatement(true);
          this.setNextStatement(true);
        },
      },
      // Control
      control_wait: {
        init: function () {
          this.appendDummyInput().appendField("wait").appendField(new Blockly.FieldNumber(1, 0), "SECS").appendField("sec");
          this.setColour(30);
          this.setPreviousStatement(true);
          this.setNextStatement(true);
        },
      },
      control_repeat: {
        init: function () {
          this.appendDummyInput().appendField("repeat").appendField(new Blockly.FieldNumber(10, 0), "TIMES");
          this.appendStatementInput("DO").setCheck(null).appendField("do");
          this.setColour(30);
          this.setPreviousStatement(true);
        },
      },
      control_if: {
        init: function () {
          this.appendValueInput("COND").setCheck(null).appendField("if");
          this.appendStatementInput("THEN").setCheck(null).appendField("then");
          this.setColour(30);
          this.setPreviousStatement(true);
          this.setNextStatement(true);
        },
      },
      // Operators (simple)
      operator_add: {
        init: function () {
          this.appendValueInput("A").setCheck(null).appendField("");
          this.appendValueInput("B").setCheck(null).appendField("+");
          this.setOutput(true, null);
          this.setColour(210);
        },
      },
      operator_subtract: {
        init: function () {
          this.appendValueInput("A").setCheck(null).appendField("");
          this.appendValueInput("B").setCheck(null).appendField("-");
          this.setOutput(true, null);
          this.setColour(210);
        },
      },
      // Variables (basic)
      variables_get: {
        init: function () {
          this.appendDummyInput().appendField("get").appendField(new Blockly.FieldVariable("item"), "VAR");
          this.setOutput(true, null);
          this.setColour(330);
        },
      },
      variables_set: {
        init: function () {
          this.appendValueInput("VALUE").setCheck(null).appendField("set").appendField(new Blockly.FieldVariable("item"), "VAR").appendField("to");
          this.setPreviousStatement(true);
          this.setNextStatement(true);
          this.setColour(330);
        },
      },
    };

    // Register minimal blocks if not already defined
    Object.keys(minimalBlocks).forEach((type) => {
      if (!Blockly.Blocks[type]) {
        Blockly.Blocks[type] = minimalBlocks[type];
      }
    });

    // Register iframe HTML block that holds editable HTML source (multi-line via a long text field)
    if (!Blockly.Blocks["iframe_html"]) {
      Blockly.Blocks["iframe_html"] = {
        init: function () {
          // Use a larger text field by storing the HTML in a field and allowing edits via a prompt on double-click.
          // Blockly's native FieldTextInput is single-line; to allow multi-line editing we'll open a modal prompt
          // when the block is double-clicked to set the HTML content, while showing a short preview on the block.
          this.appendDummyInput()
            .appendField("Iframe HTML")
            .appendField(new Blockly.FieldLabelSerializable("<edit HTML>"), "PREVIEW");
          this.setColour(270);
          this.setPreviousStatement(true);
          this.setNextStatement(true);

          // Provide a helper to get/set the full HTML content as a block field value stored on the XML.
          this.htmlContent_ = "<div>\\n  <!-- paste HTML here -->\\n</div>";

          // Ensure the block saves its htmlContent_ into XML
          this.mutationToDom = function() {
            const container = document.createElement("mutation");
            container.setAttribute("html", this.htmlContent_);
            return container;
          };
          this.domToMutation = function(xmlElement) {
            const v = xmlElement.getAttribute("html");
            this.htmlContent_ = v != null ? v : this.htmlContent_;
            // update preview label
            const preview = this.getField("PREVIEW");
            if (preview) preview.setValue(this.htmlContent_.split("\\n")[0].slice(0, 60) || "<edit HTML>");
          };

          // When the block is double-clicked, open a prompt to edit the multi-line HTML.
          this.setOnChange((ev) => {
            // noop for now; keep block responsive to future integrations
          });

          // Expose a method to open the editor (used by UI interactions)
          this.openHtmlEditor = function() {
            const newHtml = prompt("Edit iframe HTML:", this.htmlContent_);
            if (newHtml != null) {
              this.htmlContent_ = newHtml;
              const preview = this.getField("PREVIEW");
              if (preview) preview.setValue(this.htmlContent_.split("\\n")[0].slice(0,60) || "<edit HTML>");
            }
          };
        },
      };
    }

    // Store on window for debugging and reuse
    window._workspace = ws;

    // Simple run: generate JS and execute in sandboxed function with minimal API
    const runBtn = document.getElementById("run-blocks");
    const exportBtn = document.getElementById("export-blocks");
    const editIframeBtn = document.getElementById("edit-iframe");

    if (runBtn) {
      runBtn.onclick = () => {
        try {
          const code = Blockly.JavaScript.workspaceToCode(ws);
          // Provide a sandboxed API for blocks to interact with the game minimally
          const api = {
            moveSteps: (n) => {
              // move player visually when in edit mode
              if (!player) {
                player = { x: viewport.width / 2, y: viewport.height / 2, w: 26, h: 36, vx: 0, vy: 0, onGround: false };
              }
              player.x += Number(n) || 0;
              draw();
            },
            say: (text) => {
              console.log("say:", text);
            },
            playSound: (name) => {
              console.log("sound:", name);
            },
          };
          // Create function with api in scope
          const fn = new Function("api", code);
          fn(api);
        } catch (err) {
          console.error("Block run error:", err);
        }
      };
    }

    if (exportBtn) {
      exportBtn.onclick = () => {
        try {
          const xml = Blockly.Xml.workspaceToDom(ws);
          const xmlText = Blockly.Xml.domToPrettyText(xml);
          const blob = new Blob([xmlText], { type: "text/xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "blocks.xml";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error("Export failed", e);
        }
      };
    }

    // Wire 'Edit Iframe HTML' button: when an iframe_html block is selected, open its editor
    if (editIframeBtn) {
      editIframeBtn.addEventListener("click", () => {
        const selected = Blockly.selected || null;
        if (selected && selected.type === "iframe_html" && typeof selected.openHtmlEditor === "function") {
          try {
            selected.openHtmlEditor();
          } catch (e) {
            console.error("Failed to open iframe HTML editor:", e);
            // fallback: prompt with stored content if available
            const current = selected.htmlContent_ || "";
            const newHtml = prompt("Edit iframe HTML:", current);
            if (newHtml != null) {
              selected.htmlContent_ = newHtml;
              const preview = selected.getField && selected.getField("PREVIEW");
              if (preview) preview.setValue(selected.htmlContent_.split("\n")[0].slice(0,60) || "<edit HTML>");
            }
          }
        } else {
          // simple feedback: flash button text briefly to guide user
          const orig = editIframeBtn.textContent;
          editIframeBtn.textContent = "Select an iframe block";
          setTimeout(() => (editIframeBtn.textContent = orig), 1200);
        }
      });
    }
  } catch (e) {
    console.warn("Blockly init failed:", e);
  }
}

const urlInit = loadStateFromUrl() || {};
let params = urlInit.params || new URLSearchParams(window.location.search);
let isEmbed = params.get("embed") === "1";

// If no state provided via URL, attempt to restore anonymous save from localStorage
if (!urlInit.hasState) {
  try {
    const encoded = localStorage.getItem("ministudio_last_state");
    if (encoded) {
      const restored = decodeStateFromUrl(encoded);
      if (restored) {
        deserializeState(restored);
        // Update params to reflect restored state for embedding/sizing logic
        const tmp = new URLSearchParams(window.location.search);
        tmp.set("state", encoded);
        params = tmp;
        isEmbed = params.get("embed") === "1";
      }
    }
  } catch (e) {
    console.warn("Failed to restore local save:", e);
  }
}

  // AI-driven generation: wire up UI and handler to request a serialized project state from websim AI
const aiPromptInput = document.getElementById("ai-prompt");
const aiGenerateBtn = document.getElementById("ai-generate");
const aiCancelBtn = document.getElementById("ai-cancel");

let aiGenerationAbort = null;

async function generateGameFromAI() {
  const prompt = (aiPromptInput && aiPromptInput.value || "").trim();
  if (!prompt) return;

  aiGenerateBtn.disabled = true;
  aiGenerateBtn.textContent = "Generating...";
  if (aiCancelBtn) {
    aiCancelBtn.style.display = "inline-block";
  }

  // Provide a basic system and user instruction to output a serialized state matching the editor schema.
  // We ask the model to respond directly with JSON and only the JSON (websim.json:true enforces this).
  const systemMsg = {
    role: "system",
    content: `You are an assistant that outputs a JSON object representing a MiniStudio project state. Respond only with a JSON object that matches the editor's serializeState schema: keys include objects (array of objects with id,type,name,x,y,w,h,color,action,npcAction,npcText,npcRange,npcRespawn,npcSpawnX,npcSpawnY,intensity,radius), nextId (number), charImageUrl (string|null), bgImageUrl (string|null), backgroundMusicUrl (string|null), lightingMode (\"normal\"|\"dark\"), globalBrightness (number 0..1), worldWidth (number), worldHeight (number), cameraX (number), cameraY (number). Keep values reasonable for a playable level.`
  };

  const userMsg = {
    role: "user",
    content: [
      { type: "text", text: `Create a game state: ${prompt}` }
    ],
    json: false
  };

  try {
    // Use websim.chat.completions.create with json:true to request direct JSON output
    const conv = [
      systemMsg,
      { role: "user", content: `Create a valid project state JSON as described. Keep output strictly parseable JSON.` }
    ];
    // websim.chat supports providing messages array; include the user's prompt as content
    conv.push({ role: "user", content: prompt });

    // call websim; if unavailable this will throw and be handled
    const completion = await websim.chat.completions.create({
      messages: conv,
      json: true,
      // optional: set a modest timeout via abort signal if supported
    });

    // completion.content should be the JSON string (since json:true)
    const content = completion.content;
    let state = null;
    try {
      state = typeof content === "string" ? JSON.parse(content) : content;
    } catch (err) {
      console.error("Failed to parse AI response as JSON:", err, content);
      throw new Error("AI returned invalid JSON");
    }

    // Validate minimally
    if (!state || !Array.isArray(state.objects)) {
      throw new Error("AI response missing objects array");
    }

    // Show loading overlay and animate briefly like Save flow
    const overlay = document.getElementById("loading-overlay");
    const bar = document.getElementById("loading-bar");
    const pct = document.getElementById("loading-percent");
    const titleEl = document.getElementById("loading-title");
    const gameTitleInput = document.getElementById("game-title");
    const gameTitle = (gameTitleInput && gameTitleInput.value) ? gameTitleInput.value.trim() : "Loading AI Game";

    if (overlay && bar && pct && titleEl) {
      titleEl.textContent = gameTitle;
      overlay.style.display = "flex";
      overlay.setAttribute("aria-hidden", "false");
      bar.style.width = "0%";
      pct.textContent = "0%";

      const totalMs = 900;
      const start = performance.now();
      await new Promise((resolve) => {
        function step(now) {
          const t = Math.min(1, (now - start) / totalMs);
          const percent = Math.round(t * 100);
          bar.style.width = percent + "%";
          pct.textContent = percent + "%";
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            overlay.style.display = "none";
            overlay.setAttribute("aria-hidden", "true");
            resolve();
          }
        }
        requestAnimationFrame(step);
      });
    }

    // Load state into editor and persist
    deserializeState(state);
    try {
      const encoded = encodeStateForUrl(state);
      // Only persist AI-generated state when allowed
      if (encoded && CAN_PERSIST) {
        try {
          localStorage.setItem("ministudio_last_state", encoded);
        } catch (e) {
          console.warn("Failed saving AI state:", e);
        }
      } else if (encoded) {
        console.log("AI state generated but not persisted due to context (embedded/foreign site).");
      }
    } catch (e) {
      console.warn("Failed preparing AI state for save:", e);
    }

  } catch (err) {
    console.error("AI generation failed:", err);
    // minimal user feedback via console; re-enable buttons
  } finally {
    aiGenerateBtn.disabled = false;
    aiGenerateBtn.textContent = "Generate Game";
    if (aiCancelBtn) {
      aiCancelBtn.style.display = "none";
    }
    draw();
  }
}

if (aiGenerateBtn) {
  aiGenerateBtn.addEventListener("click", () => {
    generateGameFromAI();
  });
}
if (aiCancelBtn) {
  aiCancelBtn.addEventListener("click", () => {
    // currently just re-enable UI; a real abort would signal the websim call
    if (aiGenerationAbort) {
      try { aiGenerationAbort.abort(); } catch (e) {}
      aiGenerationAbort = null;
    }
    aiCancelBtn.style.display = "none";
    aiGenerateBtn.disabled = false;
    aiGenerateBtn.textContent = "Generate Game";
  });
}

// If an embed provides camera coordinates, apply them so the view is centered where saved
const providedCamX = params.has("camX") ? Number(params.get("camX")) : null;
const providedCamY = params.has("camY") ? Number(params.get("camY")) : null;
const providedCamW = params.has("camW") ? Number(params.get("camW")) : null;
const providedCamH = params.has("camH") ? Number(params.get("camH")) : null;

// If an embed provides canvas size, apply it so the embedded page's canvas
// resolution matches the saved field-of-view around the player.
if (providedCamW != null && !Number.isNaN(providedCamW) && providedCamW > 0) {
  viewport.width = Math.round(providedCamW);
}
if (providedCamH != null && !Number.isNaN(providedCamH) && providedCamH > 0) {
  viewport.height = Math.round(providedCamH);
}

// Apply provided camera coords after potentially adjusting canvas size
if (providedCamX != null && !Number.isNaN(providedCamX)) cameraX = providedCamX;
if (providedCamY != null && !Number.isNaN(providedCamY)) cameraY = providedCamY;

 // Preloader wiring: mirror the Game Title into the preloader and hide it after initialization.
const preloader = document.getElementById("preloader");
const preloaderTitle = document.getElementById("preloader-title");
const preloaderLogo = document.getElementById("preloader-logo");
const gameTitleInput = document.getElementById("game-title");

// Keep preloader title and logo in sync with the properties Title field
function updatePreloaderTitle() {
  if (!preloaderTitle || !gameTitleInput) return;
  const v = (gameTitleInput.value || "").trim();
  preloaderTitle.textContent = v ? v : "Loading Game...";
  if (preloaderLogo) preloaderLogo.textContent = v ? v : "Title";
}
if (gameTitleInput) {
  gameTitleInput.addEventListener("input", updatePreloaderTitle);
  // initialize from any existing value
  updatePreloaderTitle();
}

// Hide preloader once editor/scene is ready; call hidePreloader() later after setup
function hidePreloader() {
  if (!preloader) return;
  preloader.style.display = "none";
  preloader.setAttribute("aria-hidden", "true");
}

// If something fails to initialize quickly, forcibly hide preloader after 2.5s to avoid blocking UI.
setTimeout(hidePreloader, 2500);

if (isEmbed) {
  document.body.classList.add("embed-mode");

  // Make the canvas fill the viewport in embed mode while preserving the saved FOV.
  // If saved camW/camH were provided we keep the internal resolution to match that
  // and scale the canvas to fit the window while maintaining aspect ratio.
  function applyEmbedSizing() {
    const winW = Math.max(1, window.innerWidth);
    const winH = Math.max(1, window.innerHeight);

    // If a saved resolution exists, use it as the internal drawing buffer size.
    // Otherwise default to the window size.
    const internalW =
      providedCamW != null && !Number.isNaN(providedCamW) && providedCamW > 0
        ? Math.round(providedCamW)
        : winW;
    const internalH =
      providedCamH != null && !Number.isNaN(providedCamH) && providedCamH > 0
        ? Math.round(providedCamH)
        : winH;

    // Set canvas drawing buffer to the saved/internal resolution.
    viewport.width = internalW;
    viewport.height = internalH;

    // Scale the displayed canvas to fill the window while preserving aspect ratio.
    // Compute CSS size to fit inside the window.
    const internalAspect = internalW / internalH;
    const winAspect = winW / winH;

    let cssW = winW;
    let cssH = winH;
    if (internalAspect > winAspect) {
      // internal is wider -> fit width
      cssW = winW;
      cssH = Math.round(winW / internalAspect);
    } else {
      // internal is taller -> fit height
      cssH = winH;
      cssW = Math.round(winH * internalAspect);
    }

    // Apply CSS size and remove margins so canvas truly fills the embed.
    viewport.style.width = cssW + "px";
    viewport.style.height = cssH + "px";
    viewport.style.display = "block";
    viewport.style.margin = "0 auto";
    // Ensure parent wrapper occupies full window to avoid scrollbars
    document.documentElement.style.height = "100%";
    document.body.style.height = "100%";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
  }

  // Apply initial sizing and reapply on resize to remain centered and fill the screen.
  applyEmbedSizing();
  window.addEventListener("resize", () => {
    applyEmbedSizing();
    // re-draw immediately to avoid a blank frame during resize
    draw();
  });

  // If the embed provided explicit camera coords, keep them; otherwise camera follows player.
  if (providedCamX != null && !Number.isNaN(providedCamX)) cameraX = providedCamX;
  if (providedCamY != null && !Number.isNaN(providedCamY)) cameraY = providedCamY;

  // Start play mode now that sizing is ready.
  setPlayMode(true);
} else {
  if (joystickContainer) {
    joystickContainer.style.display = "none";
  }
  // Initialize Blockly workspace for the coding panel and then render
  setupBlockly();
  draw();

  // Editor is initialized; hide the preloader now
  try { hidePreloader(); } catch (e) {}
}