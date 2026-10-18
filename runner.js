/**
 * Manim IMC Artifacts (MIA) — Motor de Ejecución WebGPU Puro
 * Ejecuta escenas ManimGL directamente en el canvas mediante Pyodide y WebGPU nativo,
 * con soporte completo para LaTeX (Tex/TexText) mediante MiTeX/Typst.
 */

import { initializeBrowserWasm } from "./browser_wasm/browser_wasm.js";

// Configuración de bucle de animación para ManimGL WebGPU
window.__manimNextFrame = () => new Promise((resolve) => {
  let done = false;
  let timerId = null;
  const finish = (ts) => {
    if (!done) {
      done = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      const now = typeof ts === "number" ? ts : performance.now();
      window.__totalFrames = (window.__totalFrames || 0) + 1;
      resolve(now);
    }
  };
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
  if (raf) raf(finish);
  timerId = setTimeout(finish, 250);
});

export class ManimRunner {
  constructor() {
    this.pyodide = null;
    this.isInitializing = false;
    this.isInitialized = false;
    this.statusCallback = null;
    this.canvas = null;
    this.running = false;
    this.runToken = 0;
  }

  setStatus(msg, isError = false) {
    if (this.statusCallback) {
      this.statusCallback(msg, isError);
    }
    console.info(`[MIA WebGPU] ${msg}`);
  }

  async init() {
    if (this.isInitialized) return this.pyodide;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return this.pyodide;
    }

    this.isInitializing = true;
    try {
      this.setStatus("Inicializando WebAssembly y Typst/PathKit (para soporte LaTeX)...");
      await initializeBrowserWasm();

      // Cargar Pango si está disponible
      try {
        const pango = await import("./browser_wasm/dist/pango_text_loader.js");
        if (pango && pango.initializePangoText) {
          await pango.initializePangoText();
        }
      } catch (pangoErr) {
        console.warn("[MIA] Pango loader opcional:", pangoErr);
      }

      // Cargar fuentes matemáticas básicas para Typst / MiTeX (Tex y TexText)
      try {
        const fontManifestUrl = new URL("./fonts/fonts.json", document.baseURI);
        const fontRes = await fetch(fontManifestUrl, { cache: "force-cache" });
        if (fontRes.ok) {
          const fontList = await fontRes.json();
          const basicFontNames = new Set(["NewCM10-Regular.otf", "NewCM10-Bold.otf", "NewCMMath-Regular.otf"]);
          const basicFonts = fontList.filter((f) => basicFontNames.has(f.name || f.file));
          const compiler = window.manimTypstCompiler;
          if (compiler && typeof compiler.addFonts === "function") {
            for (const font of basicFonts) {
              try {
                const url = new URL(font.file, fontManifestUrl).href;
                const bytes = await fetch(url).then((r) => r.arrayBuffer());
                await compiler.addFonts(new Uint8Array(bytes));
              } catch (fErr) {
                console.warn("[MIA] Fuente básica omitida:", font.name, fErr);
              }
            }
          }
        }
      } catch (fontsErr) {
        console.warn("[MIA] Catálogo de fuentes opcional:", fontsErr);
      }

      this.setStatus("Cargando Pyodide WebAssembly...");
      const pyodideUrl = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";
      const { loadPyodide } = await import(pyodideUrl);
      this.pyodide = await loadPyodide();

      this.setStatus("Instalando dependencias científicas de Python (NumPy, SciPy, SymPy)...");
      await this.pyodide.loadPackage([
        "micropip", "numpy", "scipy", "pillow", "sympy",
        "matplotlib", "pygments", "pyyaml", "fonttools",
      ]);

      this.setStatus("Instalando ruedas ManimGL y WGPU compiladas...");
      const manifestUrl = new URL("./browser_wasm/dist/wheels/wheels.json", document.baseURI);
      const manifest = await fetch(manifestUrl, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar wheels.json: " + r.status);
        return r.json();
      });
      const wheelBase = new URL(".", manifestUrl).href;

      await this.pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(new URL(manifest.wgpu, wheelBase).href)})
await micropip.install(${JSON.stringify(new URL(manifest.manimgl, wheelBase).href)})
`);

      // Sincronizar módulos locales adaptados para el navegador
      try {
        const transformUrl = new URL("../manimlib/utils/browser_code_transform.py", document.baseURI);
        const transformCode = await fetch(transformUrl, { cache: "no-store" }).then((r) => r.ok ? r.text() : null);
        if (transformCode) {
          await this.pyodide.runPythonAsync(`
import sys
from types import ModuleType
_mod = ModuleType("manimlib.utils.browser_code_transform")
exec(${JSON.stringify(transformCode)}, _mod.__dict__)
sys.modules["manimlib.utils.browser_code_transform"] = _mod
`);
        }
      } catch (e) {
        console.warn("[MIA] Transform code sync:", e);
      }

      try {
        const windowUrl = new URL("../manimlib/window.py", document.baseURI);
        const windowCode = await fetch(windowUrl, { cache: "no-store" }).then((r) => r.ok ? r.text() : null);
        if (windowCode) {
          await this.pyodide.runPythonAsync(`
import sys
_wmod = sys.modules.get("manimlib.window")
if _wmod:
    exec(${JSON.stringify(windowCode)}, _wmod.__dict__)
`);
        }
      } catch (e) {
        console.warn("[MIA] Window code sync:", e);
      }

      this.isInitialized = true;
      this.setStatus("Motor WebGPU de ManimGL listo.");
      return this.pyodide;
    } catch (err) {
      this.setStatus("Error al inicializar motor WebGPU: " + (err.message || err), true);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  resetCanvas() {
    const oldCanvas = document.getElementById("manim-canvas");
    if (!oldCanvas) return null;
    const newCanvas = document.createElement("canvas");
    newCanvas.id = "manim-canvas";
    newCanvas.width = oldCanvas.width || 1280;
    newCanvas.height = oldCanvas.height || 720;
    oldCanvas.replaceWith(newCanvas);
    this.canvas = newCanvas;
    window.__manimCanvasElement = newCanvas;
    return newCanvas;
  }

  async runScene(sourceCode, canvasElement, onStatus) {
    this.statusCallback = onStatus;
    if (this.running) {
      await this.stopSession();
    }

    const freshCanvas = this.resetCanvas() || canvasElement;
    this.canvas = freshCanvas;
    window.__manimCanvasElement = freshCanvas;

    this.running = true;
    const token = ++this.runToken;

    try {
      await this.init();

      this.setStatus("Transformando código Python para ejecución asíncrona WebGPU...");
      const transformed = await this.pyodide.runPythonAsync(`
from manimlib.utils.browser_code_transform import transform_browser_source
transform_browser_source(${JSON.stringify(sourceCode)})
`);

      this.setStatus("Iniciando renderizado WebGPU...");

      const isFullscreen = typeof document !== "undefined" && !!document.fullscreenElement;
      freshCanvas.width = isFullscreen ? 1920 : 1280;
      freshCanvas.height = isFullscreen ? 1080 : 720;
      freshCanvas.style.removeProperty("width");
      freshCanvas.style.removeProperty("height");
      freshCanvas.style.removeProperty("max-width");
      freshCanvas.style.removeProperty("max-height");
      freshCanvas.style.removeProperty("transform");
      freshCanvas.style.removeProperty("transform-origin");

      const runnerCode = `
import sys
import asyncio
import wgpu
from manimlib import *
from manimlib.config import manim_config
from manimlib.constants import BLACK
from manimlib.event_handler import EVENT_DISPATCHER
from js import window

manim_config.text.font = "Inter"
manim_config.camera.background_color = BLACK

if hasattr(EVENT_DISPATCHER, "clear"):
    EVENT_DISPATCHER.clear()
else:
    for _et in tuple(getattr(EVENT_DISPATCHER, "event_listners", {}).keys()):
        EVENT_DISPATCHER.event_listners[_et].clear()
    EVENT_DISPATCHER.draggable_object_listners.clear()
    EVENT_DISPATCHER.pressed_keys.clear()

# Compartir un único GPUDevice y GPUAdapter en todo el ciclo de vida de la página
_shared_adapter = getattr(sys, "_manim_shared_adapter", None)
_shared_device = getattr(sys, "_manim_shared_device", None)
if _shared_adapter is None or _shared_device is None:
    _shared_adapter = await wgpu.gpu.request_adapter_async(power_preference="high-performance")
    _shared_device = await _shared_adapter.request_device_async()
    sys._manim_shared_adapter = _shared_adapter
    sys._manim_shared_device = _shared_device

# Teardown de la escena anterior si existía
_previous_scene = globals().get("_mia_scene")
if _previous_scene is not None:
    try:
        _previous_scene.tear_down()
    except Exception:
        pass
    globals()["_mia_scene"] = None
await asyncio.sleep(0.01)

_exec_before = {
    id(v) for v in globals().values()
    if isinstance(v, type) and issubclass(v, Scene) and v is not Scene
}

exec(${JSON.stringify(String(transformed))}, globals(), globals())

_candidates = [
    v for v in globals().values()
    if isinstance(v, type) and issubclass(v, Scene) and v is not Scene and id(v) not in _exec_before
]

if not _candidates:
    raise RuntimeError("El archivo no define ninguna clase que herede de Scene.")

_scene_class = _candidates[-1]
_canvas_target = "manim-canvas"

_mia_window = await Window.create_for_pyodide(
    _canvas_target,
    size=(${freshCanvas.width}, ${freshCanvas.height}),
    adapter=_shared_adapter,
    device=_shared_device,
)
globals()["_mia_window"] = _mia_window

_mia_scene = _scene_class(window=_mia_window)
globals()["_mia_scene"] = _mia_scene

async def _runner_execute():
    try:
        await _mia_scene.build_async()
        if not _mia_scene.is_window_closing():
            await _mia_scene.update_frame_async(force_draw=True)
            _mia_scene._browser_interaction_task = asyncio.create_task(
                _mia_scene.browser_interaction_loop()
            )
            _mia_window._browser_interaction_task = _mia_scene._browser_interaction_task
    except (asyncio.CancelledError, EndScene):
        pass
    except Exception as _e:
        print(f"[MIA Scene Error]: {_e}", file=sys.stderr)

_build_task = asyncio.create_task(_runner_execute())
_mia_scene._build_task = _build_task
_mia_scene_token = ${token}
`;

      await this.pyodide.runPythonAsync(runnerCode);
      this.setStatus("Sesión interactiva en ejecución (WebGPU)");
      setTimeout(() => {
        const container = document.getElementById("rendercanvas-focus-element-container");
        const sessionContainer = document.getElementById("session-container");
        if (container && sessionContainer && !sessionContainer.contains(container)) {
          sessionContainer.appendChild(container);
        }
        const focusInput = container ? (container.lastElementChild || container.querySelector("input")) : null;
        if (focusInput) {
          focusInput.focus({ preventScroll: true });
        }
      }, 50);
    } catch (error) {
      this.running = false;
      this.setStatus("Error al ejecutar escena: " + (error.message || error), true);
      console.error("[MIA WebGPU Error]", error);
      throw error;
    }
  }

  async stopSession() {
    this.running = false;
    this.setStatus("Cerrando sesión interactiva...");

    if (this.pyodide) {
      try {
        await this.pyodide.runPythonAsync(`
import asyncio
from manimlib.config import manim_config
from manimlib.constants import BLACK
from manimlib.event_handler import EVENT_DISPATCHER

_s = globals().get("_mia_scene")
if _s is not None:
    try:
        _s.tear_down()
    except Exception:
        pass
    globals()["_mia_scene"] = None

_w = globals().get("_mia_window")
if _w is not None:
    globals()["_mia_window"] = None

manim_config.camera.background_color = BLACK
if hasattr(EVENT_DISPATCHER, "clear"):
    EVENT_DISPATCHER.clear()
else:
    for _et in tuple(getattr(EVENT_DISPATCHER, "event_listners", {}).keys()):
        EVENT_DISPATCHER.event_listners[_et].clear()
    EVENT_DISPATCHER.draggable_object_listners.clear()
    EVENT_DISPATCHER.pressed_keys.clear()

await asyncio.sleep(0.02)
`);
      } catch (e) {
        console.warn("[MIA] Teardown warning:", e);
      }
    }

    this.resetCanvas();
    this.setStatus("Sesión terminada.");
  }
}
