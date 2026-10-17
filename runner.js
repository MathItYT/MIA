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

  async runScene(sourceCode, canvasElement, onStatus) {
    this.statusCallback = onStatus;
    this.canvas = canvasElement;
    if (this.running) {
      await this.stopSession();
    }

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

      // Las dimensiones del canvas se configuran estrictamente mediante sus atributos width y height (sin CSS)
      window.__manimCanvasElement = canvasElement;
      canvasElement.width = 1920;
      canvasElement.height = 1080;
      canvasElement.style.removeProperty("width");
      canvasElement.style.removeProperty("height");
      canvasElement.style.removeProperty("transform");
      canvasElement.style.removeProperty("transform-origin");

      const runnerCode = `
import sys
from manimlib import *
from manimlib.config import manim_config
from js import window

manim_config.text.font = "Inter"

# Teardown de escena anterior para reutilizar la ventana
_previous_scene = globals().get("_mia_scene")
_reusable_window = (
    getattr(_previous_scene, "window", None)
    if _previous_scene is not None
    else None
)
if _previous_scene is not None:
    try:
        _previous_scene.tear_down()
    except Exception:
        pass
    globals()["_mia_scene"] = None

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

_mia_scene = await run_scene_from_class(
    _scene_class,
    _canvas_target,
    size=(${canvasElement.width}, ${canvasElement.height}),
    window=_reusable_window,
)
_mia_scene_token = ${token}
`;

      await this.pyodide.runPythonAsync(runnerCode);
      this.setStatus("Sesión interactiva en ejecución (WebGPU)");
      setTimeout(() => {
        const container = document.getElementById("rendercanvas-focus-element-container");
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
try:
    _s = globals().get("_mia_scene")
    if _s is not None:
        _s.tear_down()
        globals()["_mia_scene"] = None
except Exception:
    pass
`);
      } catch (e) {
        console.warn("[MIA] Teardown warning:", e);
      }
    }

    if (this.canvas) {
      try {
        // Limpiar el canvas
        const ctx = this.canvas.getContext("webgpu");
        // WebGPU canvas se limpia automáticamente en el siguiente ciclo o reconexión
      } catch (e) {
        // ignore
      }
    }

    this.setStatus("Sesión terminada.");
  }
}
