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

      const basePackages = [
        "micropip", "numpy", "scipy", "pillow", "sympy",
        "matplotlib", "pygments", "pyyaml", "fonttools",
      ];

      // Determinar dinámicamente la ruta de site-packages en Pyodide
      const sitePackages = this.pyodide.runPython("import site; site.getsitepackages()[0]");
      const cacheMetaFile = `${sitePackages}/.mia_cache_meta.json`;

      // Montar IDBFS para persistir paquetes instalados en el almacenamiento del navegador
      let idbfsReady = false;
      try {
        this.pyodide.FS.mkdirTree(sitePackages);
        this.pyodide.FS.mount(this.pyodide.FS.filesystems.IDBFS, {}, sitePackages);
        idbfsReady = true;
      } catch (mountErr) {
        console.warn("[MIA Cache] Montaje IDBFS en site-packages omitido o ya montado:", mountErr);
      }

      // Sincronizar datos existentes desde IndexedDB hacia la memoria virtual
      if (idbfsReady) {
        try {
          this.setStatus("Sincronizando paquetes de Python desde IDBFS...");
          await this.syncFS(true);
        } catch (syncErr) {
          console.warn("[MIA Cache] Error al sincronizar desde IDBFS:", syncErr);
        }
      }

      // Leer metadatos de la caché existente si están disponibles
      let cachedMeta = null;
      try {
        if (this.checkPathExists(cacheMetaFile)) {
          const raw = this.pyodide.FS.readFile(cacheMetaFile, { encoding: "utf8" });
          cachedMeta = JSON.parse(raw);
        }
      } catch (readErr) {
        console.warn("[MIA Cache] Error al leer metadata de caché previa:", readErr);
      }

      // Verificar si las dependencias científicas base están completas en la caché persistente
      const basePackagesValid = Boolean(
        cachedMeta &&
        cachedMeta.pyodideVersion === pyodideUrl &&
        Array.isArray(cachedMeta.basePackages) &&
        basePackages.every((pkg) => cachedMeta.basePackages.includes(pkg)) &&
        this.checkPathExists(`${sitePackages}/numpy`) &&
        this.checkPathExists(`${sitePackages}/scipy`) &&
        this.checkPathExists(`${sitePackages}/sympy`) &&
        this.checkPathExists(`${sitePackages}/matplotlib`)
      );

      if (!basePackagesValid) {
        this.setStatus("Instalando dependencias científicas de Python (NumPy, SciPy, SymPy)...");
        await this.pyodide.loadPackage(basePackages);
      } else {
        this.setStatus("Dependencias científicas cargadas desde la caché IDBFS.");
      }

      // Obtener el manifiesto actual de ruedas compiladas (sin caché HTTP para detectar actualizaciones)
      const manifestUrl = new URL("./browser_wasm/dist/wheels/wheels.json", document.baseURI);
      const manifest = await fetch(manifestUrl, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar wheels.json: " + r.status);
        return r.json();
      });
      const wheelBase = new URL(".", manifestUrl).href;

      const manimglUrl = new URL(manifest.manimgl, wheelBase).href;
      const wgpuUrl = new URL(manifest.wgpu, wheelBase).href;

      const currentManimFp = await this.getWheelFingerprint(manimglUrl, manifest.manimgl);
      const currentWgpuFp = await this.getWheelFingerprint(wgpuUrl, manifest.wgpu);

      const cachedManimFp = cachedMeta?.wheels?.manimglFingerprint || cachedMeta?.wheels?.manimgl;
      const cachedWgpuFp = cachedMeta?.wheels?.wgpuFingerprint || cachedMeta?.wheels?.wgpu;

      const manimNeedsUpdate = !basePackagesValid ||
        !cachedManimFp ||
        cachedManimFp !== currentManimFp ||
        !this.checkPathExists(`${sitePackages}/manimlib`);

      const wgpuNeedsUpdate = !basePackagesValid ||
        !cachedWgpuFp ||
        cachedWgpuFp !== currentWgpuFp ||
        !this.checkPathExists(`${sitePackages}/wgpu`);

      let cacheDirty = !basePackagesValid;

      if (manimNeedsUpdate || wgpuNeedsUpdate) {
        this.setStatus("Actualizando ruedas compiladas (ManimGL / WGPU)...");

        // Si ManimGL cambió o se actualizó, eliminar la versión previa para evitar archivos huérfanos
        if (manimNeedsUpdate) {
          this.rmrf(`${sitePackages}/manimlib`);
          this.removeMatchingDistInfo(sitePackages, "manimgl");
        }

        // Si WGPU cambió, eliminar la versión previa
        if (wgpuNeedsUpdate) {
          this.rmrf(`${sitePackages}/wgpu`);
          this.removeMatchingDistInfo(sitePackages, "wgpu");
        }

        const installStatements = ["import micropip"];
        if (wgpuNeedsUpdate) {
          installStatements.push(`await micropip.install(${JSON.stringify(wgpuUrl)})`);
        }
        if (manimNeedsUpdate) {
          installStatements.push(`await micropip.install(${JSON.stringify(manimglUrl)})`);
        }

        await this.pyodide.runPythonAsync(installStatements.join("\n"));
        cacheDirty = true;
      } else {
        this.setStatus("Ruedas ManimGL y WGPU verificadas en caché IDBFS.");
      }

      // Si hubo instalación inicial o actualización de ruedas, guardar metadatos y persistir en IDBFS
      if (cacheDirty && idbfsReady) {
        const newMeta = {
          pyodideVersion: pyodideUrl,
          basePackages: basePackages,
          wheels: {
            manimgl: manifest.manimgl,
            wgpu: manifest.wgpu,
            manimglFingerprint: currentManimFp,
            wgpuFingerprint: currentWgpuFp,
          },
          timestamp: Date.now(),
        };
        this.pyodide.FS.writeFile(cacheMetaFile, JSON.stringify(newMeta));
        this.setStatus("Guardando paquetes instalados en almacenamiento persistente (IDBFS)...");
        await this.syncFS(false);
      }

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
try:
    import manimlib.window
    _wmod = sys.modules.get("manimlib.window")
    if _wmod:
        exec(${JSON.stringify(windowCode)}, _wmod.__dict__)
except Exception:
    pass
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
    window.__miaSessionActive = true;
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
    if (!this.running && !window.__miaSessionActive) return;
    this.running = false;
    window.__miaSessionActive = false;
    this.setStatus("Cerrando sesión interactiva y liberando dispositivo WebGPU...");

    if (this.pyodide) {
      try {
        await this.pyodide.runPythonAsync(`
import sys
import asyncio
from manimlib.config import manim_config
from manimlib.constants import BLACK
from manimlib.event_handler import EVENT_DISPATCHER

_s = globals().get("_mia_scene")
_w = globals().get("_mia_window")

# Extraer el dispositivo WebGPU (GPUDevice) antes del desmontaje
_device = getattr(sys, "_manim_shared_device", None)
if _device is None and _w is not None:
    _device = getattr(_w, "device", None) or getattr(getattr(_w, "gpu", None), "device", None)
if _device is None and _s is not None:
    _cam = getattr(_s, "camera", None)
    if _cam is not None:
        _gpu = getattr(_cam, "gpu", None)
        if _gpu is not None:
            _device = getattr(_gpu, "device", None)

if _s is not None:
    try:
        _s.tear_down()
    except Exception:
        pass
    globals()["_mia_scene"] = None

if _w is not None:
    try:
        _w.destroy()
    except Exception:
        pass
    globals()["_mia_window"] = None

# Destrucción explícita a nivel macro del GPUDevice:
# En WebGPU, device.destroy() invalida el dispositivo y libera instantáneamente
# de la VRAM todos los buffers, texturas, pipelines y bind groups hijos.
if _device is not None:
    try:
        _device.destroy()
    except Exception:
        pass

# Limpiar referencias para que la siguiente sesión solicite un GPUDevice nuevo y limpio
sys._manim_shared_device = None
sys._manim_shared_adapter = None

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

  /**
   * Sincroniza el sistema de archivos IDBFS con IndexedDB.
   * @param {boolean} populate true para leer de IndexedDB a memoria; false para escribir memoria a IndexedDB.
   */
  async syncFS(populate) {
    if (!this.pyodide || !this.pyodide.FS) return;
    return new Promise((resolve, reject) => {
      this.pyodide.FS.syncfs(populate, (err) => {
        if (err) {
          console.warn(`[MIA Cache] Advertencia en syncfs (populate=${populate}):`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Elimina un archivo o directorio recursivamente dentro de pyodide.FS.
   * @param {string} targetPath Ruta a eliminar.
   */
  rmrf(targetPath) {
    if (!this.pyodide || !this.pyodide.FS) return;
    try {
      const info = this.pyodide.FS.analyzePath(targetPath);
      if (!info.exists) return;
      const stat = this.pyodide.FS.stat(targetPath);
      if (this.pyodide.FS.isDir(stat.mode)) {
        const entries = this.pyodide.FS.readdir(targetPath);
        for (const entry of entries) {
          if (entry === "." || entry === "..") continue;
          this.rmrf(`${targetPath}/${entry}`);
        }
        this.pyodide.FS.rmdir(targetPath);
      } else {
        this.pyodide.FS.unlink(targetPath);
      }
    } catch (err) {
      console.warn(`[MIA Cache] Error eliminando ${targetPath}:`, err);
    }
  }

  /**
   * Elimina directorios .dist-info que coincidan con un prefijo de paquete.
   * @param {string} sitePackages Ruta a site-packages.
   * @param {string} prefix Prefijo del paquete (ej. "manimgl", "wgpu").
   */
  removeMatchingDistInfo(sitePackages, prefix) {
    if (!this.pyodide || !this.pyodide.FS) return;
    try {
      const entries = this.pyodide.FS.readdir(sitePackages);
      for (const entry of entries) {
        if (entry.toLowerCase().startsWith(prefix.toLowerCase()) && entry.endsWith(".dist-info")) {
          this.rmrf(`${sitePackages}/${entry}`);
        }
      }
    } catch (err) {
      console.warn(`[MIA Cache] Error eliminando dist-info de ${prefix}:`, err);
    }
  }

  /**
   * Verifica la existencia de una ruta en pyodide.FS.
   * @param {string} targetPath Ruta a consultar.
   */
  checkPathExists(targetPath) {
    if (!this.pyodide || !this.pyodide.FS) return false;
    try {
      return this.pyodide.FS.analyzePath(targetPath).exists;
    } catch {
      return false;
    }
  }

  /**
   * Genera una huella digital para una rueda a partir de sus encabezados HTTP (HEAD).
   * Si cambia el tamaño, ETag o Last-Modified, la huella cambiará.
   * @param {string} wheelUrl URL absoluta de la rueda.
   * @param {string} fallbackName Nombre base de respaldo.
   */
  async getWheelFingerprint(wheelUrl, fallbackName) {
    try {
      const res = await fetch(wheelUrl, { method: "HEAD", cache: "no-store" });
      if (res.ok) {
        const etag = res.headers.get("etag") || "";
        const lastModified = res.headers.get("last-modified") || "";
        const contentLength = res.headers.get("content-length") || "";
        return `${fallbackName}:${contentLength}:${lastModified}:${etag}`;
      }
    } catch (e) {
      // Fallback silencioso si HEAD no está soportado o falla
    }
    return fallbackName;
  }

  /**
   * Limpia toda la caché de paquetes de Python en IDBFS.
   */
  async clearPackageCache() {
    if (!this.pyodide || !this.pyodide.FS) return false;
    try {
      const sitePackages = this.pyodide.runPython("import site; site.getsitepackages()[0]");
      const entries = this.pyodide.FS.readdir(sitePackages);
      for (const entry of entries) {
        if (entry === "." || entry === "..") continue;
        this.rmrf(`${sitePackages}/${entry}`);
      }
      await this.syncFS(false);
      console.info("[MIA Cache] Caché de paquetes IDBFS limpiada con éxito.");
      return true;
    } catch (e) {
      console.error("[MIA Cache] Error limpiando caché IDBFS:", e);
      return false;
    }
  }
}
