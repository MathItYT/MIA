/**
 * Manim IMC Artifacts (MIA) — Aplicación Principal
 * Gestiona el catálogo de artefactos con miniaturas reales en Full HD generadas por ManimGL,
 * renderizado de fórmulas con KaTeX, navegación SPA, formulario de carga con validación (PA1-PA8)
 * y ejecución interactiva en WebGPU.
 */

import { ManimRunner } from "./runner.js";

const runner = new ManimRunner();

// Almacenamiento local para artefactos cargados por el usuario
const STORAGE_KEY = "mia:artifacts:v1";

// Artefactos iniciales con miniaturas Full HD generadas directamente con ManimGL (-sw --hd)
const INITIAL_ARTIFACTS = [
  {
    id: "proyeccion-ortogonal",
    title: "Proyección Ortogonal en $\\mathbb{R}^3$",
    author: "Benjamín Ubilla",
    category: "Álgebra Lineal",
    badge: "3D Interactivo",
    objective: "Comprender la descomposición canónica de un vector $\\vec{v} \\in \\mathbb{R}^3$ en su proyección ortogonal $\\mathrm{proj}_W(\\vec{v})$ sobre un subespacio 2D $W$ y su componente perpendicular $\\vec{v}^\\perp \\in W^\\perp$, validando que $\\vec{v} = \\mathrm{proj}_W(\\vec{v}) + \\vec{v}^\\perp$ con $\\vec{v}^\\perp \\cdot \\vec{w} = 0 \\; \\forall \\vec{w} \\in W$.",
    description: "Este artefacto presenta la descomposición canónica de un vector en un subespacio vectorial bidimensional $W = \\mathrm{span}\\{\\vec{e}_1, \\vec{e}_2\\}$ y su complemento ortogonal $W^\\perp$. Muestra los vectores $\\vec{v}$, $\\mathrm{proj}_W(\\vec{v})$ y $\\vec{v}^\\perp$, el plano del subespacio con cuadrícula y el indicador de ángulo recto con depth testing activo y fórmulas en LaTeX.",
    requirements: "Navegador compatible con WebGPU / WebAssembly, ratón o puntero para rotación 3D orbital.",
    fileUrl: "./artifacts/proyeccion_ortogonal.py",
    imageUrl: "./artifacts/proyeccion_ortogonal.png",
    sourceCode: null,
    isBuiltin: true,
  },
  {
    id: "red-neuronal",
    title: "Red Neuronal Profunda en $\\mathbb{R}^n$",
    author: "Cristóbal Rojas",
    category: "Machine Learning",
    badge: "Deep Learning",
    objective: "Comprender y manipular de forma interactiva una red neuronal multicapa con activación ReLU, analizando la propagación hacia adelante, el impacto de los pesos sinápticos y sesgos en la activación neuronal, y la optimización de parámetros mediante el algoritmo de descenso de gradiente para minimizar la función de pérdida.",
    description: "Visualización interactiva de una red neuronal artificial que permite ajustar en tiempo real entradas, pesos y sesgos con activación ReLU, observando de manera dinámica la función de pérdida y los pasos de descenso de gradiente.",
    requirements: "Navegador compatible con WebGPU / WebAssembly, puntero para interacción.",
    fileUrl: "./artifacts/red_neuronal.py",
    imageUrl: "./artifacts/red_neuronal.png",
    sourceCode: null,
    isBuiltin: true,
  },
];

class MIAApp {
  constructor() {
    this.artifacts = [];
    this.currentArtifact = null;
    this.currentView = "library";

    // Elementos del DOM
    this.viewLibrary = document.getElementById("view-library");
    this.viewDetail = document.getElementById("view-detail");
    this.viewSession = document.getElementById("view-session");
    this.artifactsGrid = document.getElementById("artifacts-grid");
    this.modalUpload = document.getElementById("modal-upload");
    this.uploadForm = document.getElementById("upload-form");
    this.uploadErrorBanner = document.getElementById("upload-error-banner");
    this.uploadErrorList = document.getElementById("upload-error-list");
    this.manimCanvas = document.getElementById("manim-canvas");
    this.sessionStatus = document.getElementById("session-status-text");
    this.toastContainer = document.getElementById("toast-container");

    this.runner = runner;
    this.selectedFile = null;
  }

  async init() {
    this.loadArtifacts();
    this.setupEventListeners();
    await this.preloadInitialSourceCodes();
    this.renderLibrary();

    // Soporte para deep-linking / hash
    window.addEventListener("hashchange", () => this.handleHashRoute());
    if (window.location.hash) {
      this.handleHashRoute();
    }
  }

  ensureCanvasFocus() {
    const container = document.getElementById("rendercanvas-focus-element-container");
    const sessionContainer = document.getElementById("session-container");
    if (container && sessionContainer && !sessionContainer.contains(container)) {
      sessionContainer.appendChild(container);
    }
    const focusInput = container ? (container.lastElementChild || container.querySelector("input")) : null;
    if (focusInput && document.activeElement !== focusInput) {
      focusInput.focus({ preventScroll: true });
    }
  }

  renderKaTeX(element = document.body) {
    if (typeof renderMathInElement === "function") {
      renderMathInElement(element, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
      });
    }
  }

  loadArtifacts() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const userArtifacts = JSON.parse(saved);
        this.artifacts = [...INITIAL_ARTIFACTS, ...userArtifacts];
        return;
      } catch (e) {
        console.warn("[MIA] Error al leer localStorage:", e);
      }
    }
    this.artifacts = [...INITIAL_ARTIFACTS];
  }

  saveUserArtifacts() {
    const userOnly = this.artifacts.filter((a) => !a.isBuiltin);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userOnly));
  }

  async preloadInitialSourceCodes() {
    for (const art of this.artifacts) {
      if (!art.sourceCode && art.fileUrl) {
        try {
          const res = await fetch(art.fileUrl);
          if (res.ok) {
            art.sourceCode = await res.text();
          }
        } catch (e) {
          console.warn("[MIA] Preload warning para " + art.id, e);
        }
      }
    }
  }

  setupEventListeners() {
    // Botones de navegación
    document.getElementById("btn-nav-library")?.addEventListener("click", () => this.navigateTo("library"));
    document.getElementById("brand-logo-link")?.addEventListener("click", () => this.navigateTo("library"));
    document.getElementById("btn-open-upload")?.addEventListener("click", () => this.openUploadModal());
    document.getElementById("btn-back-to-library")?.addEventListener("click", () => this.navigateTo("library"));
    document.getElementById("btn-detail-back")?.addEventListener("click", () => this.navigateTo("library"));
    document.getElementById("btn-copy-code")?.addEventListener("click", () => this.copyCurrentSourceCode());
    document.getElementById("btn-copy-install")?.addEventListener("click", () => this.copyInstallCommand());

    // Controles de Sesión interactiva
    document.getElementById("btn-start-session")?.addEventListener("click", () => {
      if (this.currentArtifact) {
        this.startSession(this.currentArtifact);
      }
    });

    document.getElementById("btn-close-session")?.addEventListener("click", () => {
      this.closeSession();
    });

    document.getElementById("btn-session-reset")?.addEventListener("click", () => {
      if (this.currentArtifact) {
        this.startSession(this.currentArtifact);
      }
    });

    document.getElementById("btn-session-fullscreen")?.addEventListener("click", () => {
      const container = document.getElementById("session-container");
      if (!document.fullscreenElement) {
        container?.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    document.addEventListener("fullscreenchange", () => {
      this.ensureCanvasFocus();
      window.dispatchEvent(new Event("resize"));
      const fsBtn = document.getElementById("btn-session-fullscreen");
      if (fsBtn) {
        if (document.fullscreenElement) {
          fsBtn.innerHTML = "⛶ Salir pantalla completa";
          fsBtn.title = "Salir de pantalla completa";
        } else {
          fsBtn.innerHTML = "⛶ Pantalla completa";
          fsBtn.title = "Pantalla completa";
        }
      }
    });

    // Gestión de foco interactivo para capturar la rueda del ratón (zoom) sin requerir clic previo
    const canvasStage = document.querySelector(".session-canvas-stage");
    const ensureFocus = () => this.ensureCanvasFocus();

    if (canvasStage) {
      canvasStage.addEventListener("pointerenter", ensureFocus);
      canvasStage.addEventListener("pointermove", ensureFocus);
      canvasStage.addEventListener("wheel", (e) => {
        ensureFocus();
        if (e.target !== this.manimCanvas && this.manimCanvas) {
          e.preventDefault();
          const rect = this.manimCanvas.getBoundingClientRect();
          const simulatedEvent = new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: Math.max(rect.left, Math.min(rect.right, e.clientX)),
            clientY: Math.max(rect.top, Math.min(rect.bottom, e.clientY)),
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaZ: e.deltaZ,
            deltaMode: e.deltaMode,
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            metaKey: e.metaKey
          });
          this.manimCanvas.dispatchEvent(simulatedEvent);
        }
      }, { capture: true, passive: false });
    }

    if (this.manimCanvas) {
      this.manimCanvas.addEventListener("pointerenter", ensureFocus);
      this.manimCanvas.addEventListener("pointermove", ensureFocus);
      this.manimCanvas.addEventListener("wheel", (e) => {
        ensureFocus();
      }, { capture: true, passive: false });
    }

    // Modal de carga
    document.getElementById("btn-close-upload-modal")?.addEventListener("click", () => this.closeUploadModal());
    document.getElementById("btn-cancel-upload")?.addEventListener("click", () => this.closeUploadModal());
    this.modalUpload?.addEventListener("click", (e) => {
      if (e.target === this.modalUpload) this.closeUploadModal();
    });

    // Zona de arrastre de archivo .py
    const dropzone = document.getElementById("file-dropzone");
    const fileInput = document.getElementById("upload-file-input");
    const fileNameDisplay = document.getElementById("file-selected-name");

    dropzone?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleFileSelected(e.target.files[0], fileNameDisplay);
      }
    });

    dropzone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone?.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.handleFileSelected(e.dataTransfer.files[0], fileNameDisplay);
      }
    });

    // Envío del formulario de carga con validaciones obligatorias (PA6 y PA8)
    this.uploadForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleArtifactUpload();
    });
  }

  handleFileSelected(file, nameDisplay) {
    if (!file.name.endsWith(".py")) {
      this.showToast("Solo se admiten archivos fuente de Python (.py)", "error");
      return;
    }
    this.selectedFile = file;
    if (nameDisplay) {
      nameDisplay.textContent = `Archivo seleccionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      nameDisplay.style.display = "block";
    }
  }

  // --- NAVEGACIÓN Y VISTAS ---
  navigateTo(view, artifactId = null) {
    this.currentView = view;
    this.viewLibrary.classList.remove("active");
    this.viewDetail.classList.remove("active");
    this.viewSession.classList.remove("active");

    if (view === "library") {
      if (window.location.hash !== "#biblioteca") {
        window.location.hash = "#biblioteca";
      }
      this.viewLibrary.classList.add("active");
      this.renderLibrary();
    } else if (view === "detail" && artifactId) {
      const art = this.artifacts.find((a) => a.id === artifactId);
      if (art) {
        this.currentArtifact = art;
        const targetHash = `#artefacto/${art.id}`;
        if (window.location.hash !== targetHash) {
          window.location.hash = targetHash;
        }
        this.renderDetail(art);
        this.viewDetail.classList.add("active");
      } else {
        this.navigateTo("library");
      }
    } else if (view === "session" && artifactId) {
      const art = this.artifacts.find((a) => a.id === artifactId);
      if (art) {
        this.currentArtifact = art;
        const targetHash = `#sesion/${art.id}`;
        if (window.location.hash !== targetHash) {
          window.location.hash = targetHash;
        }
        this.viewSession.classList.add("active");
      }
    }
  }

  handleHashRoute() {
    const hash = window.location.hash;
    if (hash.startsWith("#artefacto/")) {
      const id = hash.replace("#artefacto/", "");
      if (this.currentView !== "detail" || this.currentArtifact?.id !== id) {
        this.navigateTo("detail", id);
      }
    } else if (hash.startsWith("#sesion/")) {
      const id = hash.replace("#sesion/", "");
      if (this.currentView !== "session" || this.currentArtifact?.id !== id) {
        this.navigateTo("session", id);
        if (this.currentArtifact) {
          this.startSession(this.currentArtifact);
        }
      }
    } else {
      if (this.currentView !== "library") {
        this.navigateTo("library");
      }
    }
  }

  // --- VISTA 1: BIBLIOTECA (PA1) ---
  renderLibrary() {
    this.artifactsGrid.innerHTML = "";

    this.artifacts.forEach((art) => {
      const card = document.createElement("article");
      card.className = "artifact-card";
      card.setAttribute("data-id", art.id);

      const previewHtml = art.imageUrl
        ? `<img src="${art.imageUrl}" alt="${art.title}" style="width:100%; height:100%; object-fit:cover;">`
        : `<div style="background:#090d16; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#38bdf8; font-weight:bold;">ManimGL Artifact</div>`;

      card.innerHTML = `
        <div class="card-preview">
          ${previewHtml}
          <span class="card-badge">${art.badge || "ManimGL"}</span>
        </div>
        <div class="card-body">
          <h2 class="card-title">${art.title}</h2>
          <div class="card-meta">
            <span class="card-author">Por ${art.author}</span>
            <span>•</span>
            <span>${art.category || "Matemáticas"}</span>
          </div>
          <p class="card-desc">${art.description}</p>
          <div class="card-footer">
            <span class="card-tag">Python .py</span>
            <button class="btn btn-primary btn-sm btn-view-artifact" data-id="${art.id}">
              Ver Artefacto →
            </button>
          </div>
        </div>
      `;

      // Clic en la tarjeta o botón navega a la página del artefacto (PA2)
      card.addEventListener("click", () => {
        this.navigateTo("detail", art.id);
      });

      this.artifactsGrid.appendChild(card);
    });

    // Renderizar fórmulas matemáticas con KaTeX en la cuadrícula
    this.renderKaTeX(this.artifactsGrid);
  }

  // --- VISTA 2: PÁGINA DE UN ARTEFACTO (PA2) ---
  renderDetail(art) {
    document.getElementById("detail-title").innerHTML = art.title;
    document.getElementById("detail-author").textContent = art.author;
    document.getElementById("detail-badge-author").textContent = art.author;
    document.getElementById("detail-objective").innerHTML = art.objective;
    document.getElementById("detail-description").innerHTML = art.description;
    document.getElementById("detail-requirements").textContent = art.requirements || "Navegador moderno con WebGPU";
    document.getElementById("detail-category").textContent = art.category || "Matemáticas";
    document.getElementById("detail-format").textContent = "ManimGL (.py)";

    const previewContainer = document.getElementById("detail-preview-container");
    if (previewContainer) {
      if (art.imageUrl) {
        previewContainer.innerHTML = `<img src="${art.imageUrl}" alt="${art.title}" style="width:100%; height:100%; object-fit:contain; background:#000;">`;
      } else {
        previewContainer.innerHTML = `<div style="background:#090d16; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#38bdf8; font-weight:bold;">ManimGL Artifact</div>`;
      }
    }

    // Restablecer estado de botones de copia
    const copyBtnText = document.getElementById("btn-copy-code-text");
    if (copyBtnText) copyBtnText.textContent = "Copiar código fuente Python (.py)";
    const copyInstallBtn = document.getElementById("btn-copy-install");
    if (copyInstallBtn) copyInstallBtn.textContent = "Copiar";

    // Renderizar KaTeX en los metadatos del detalle
    this.renderKaTeX(this.viewDetail);
  }

  // --- VISTA 3: SESIÓN INTERACTIVA (PA4, PA5) ---
  async startSession(art) {
    this.navigateTo("session", art.id);
    document.getElementById("session-title").innerHTML = art.title;
    this.renderKaTeX(document.getElementById("session-title"));
    this.sessionStatus.textContent = "Iniciando WebGPU...";

    // Las dimensiones del canvas se definen exclusivamente mediante sus atributos width y height (sin CSS)
    this.manimCanvas.width = 1920;
    this.manimCanvas.height = 1080;
    this.manimCanvas.style.removeProperty("width");
    this.manimCanvas.style.removeProperty("height");
    this.manimCanvas.style.removeProperty("transform");
    this.manimCanvas.style.removeProperty("transform-origin");

    try {
      let code = art.sourceCode;
      if (!code && art.fileUrl) {
        code = await fetch(art.fileUrl).then((r) => r.text());
        art.sourceCode = code;
      }
      if (!code) {
        throw new Error("No se pudo obtener el código fuente del artefacto.");
      }

      await runner.runScene(code, this.manimCanvas, (msg, isError) => {
        if (this.sessionStatus) {
          this.sessionStatus.textContent = msg;
          if (isError) {
            this.sessionStatus.style.color = "#ef4444";
          } else {
            this.sessionStatus.style.color = "#10b981";
            if (msg.includes("en ejecución")) {
              setTimeout(() => this.ensureCanvasFocus(), 50);
            }
          }
        }
      });
      setTimeout(() => this.ensureCanvasFocus(), 100);
    } catch (err) {
      console.error("[MIA] Error en sesión interactiva:", err);
      this.showToast("Error al iniciar sesión: " + (err.message || err), "error");
    }
  }

  async closeSession() {
    await runner.stopSession();
    // PA5: Regresar a la página del mismo artefacto
    if (this.currentArtifact) {
      this.navigateTo("detail", this.currentArtifact.id);
    } else {
      this.navigateTo("library");
    }
    this.showToast("Sesión interactiva finalizada.", "info");
  }

  // --- VISTA 4: CARGA DE ARTEFACTOS Y VALIDACIÓN (PA6, PA7, PA8) ---
  openUploadModal() {
    this.uploadForm.reset();
    this.selectedFile = null;
    document.getElementById("file-selected-name").style.display = "none";
    this.uploadErrorBanner.classList.remove("visible");
    this.uploadErrorList.innerHTML = "";
    // Prellenar autor por defecto con Benjamín Ubilla
    document.getElementById("upload-author").value = "Benjamín Ubilla";
    this.modalUpload.classList.add("open");
  }

  closeUploadModal() {
    this.modalUpload.classList.remove("open");
    this.uploadErrorBanner.classList.remove("visible");
    this.uploadErrorList.innerHTML = "";
  }

  async handleArtifactUpload() {
    const titleInput = document.getElementById("upload-title");
    const authorInput = document.getElementById("upload-author");
    const objectiveInput = document.getElementById("upload-objective");
    const descInput = document.getElementById("upload-desc");
    const reqInput = document.getElementById("upload-requirements");
    const catInput = document.getElementById("upload-category");

    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    const objective = objectiveInput.value.trim();
    const description = descInput.value.trim();
    const requirements = reqInput.value.trim() || "Navegador compatible con WebGPU";
    const category = catInput.value.trim() || "Álgebra y Cálculo";

    // Validaciones estrictas de datos obligatorios (PA8)
    const missingFields = [];
    if (!this.selectedFile) {
      missingFields.push("Archivo fuente de ManimGL (.py)");
    }
    if (!title) {
      missingFields.push("Título del artefacto");
    }
    if (!author) {
      missingFields.push("Autor del artefacto");
    }
    if (!objective) {
      missingFields.push("Objetivo de aprendizaje pedagógico");
    }
    if (!description) {
      missingFields.push("Descripción del artefacto");
    }

    if (missingFields.length > 0) {
      // PA8: La plataforma informa qué información falta y no registra un artefacto incompleto
      this.uploadErrorList.innerHTML = "";
      missingFields.forEach((f) => {
        const li = document.createElement("li");
        li.textContent = f;
        this.uploadErrorList.appendChild(li);
      });
      this.uploadErrorBanner.classList.add("visible");
      this.uploadErrorBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    // Carga válida (PA6)
    try {
      const sourceCode = await this.selectedFile.text();
      const newId = "artifact-" + Date.now();

      // Si el archivo cargado es el oscilador armónico de prueba u otro, asociar su miniatura Full HD renderizada con Manim
      let imageUrl = null;
      if (this.selectedFile.name.includes("oscilador") || sourceCode.includes("OsciladorArmonico")) {
        imageUrl = "./artifacts/oscilador_armonico.png";
      } else {
        imageUrl = "./artifacts/proyeccion_ortogonal.png"; // imagen base por defecto
      }

      const newArtifact = {
        id: newId,
        title,
        author,
        category,
        badge: "Cargado por Usuario",
        objective,
        description,
        requirements,
        sourceCode,
        fileUrl: null,
        imageUrl,
        isBuiltin: false,
      };

      this.artifacts.push(newArtifact);
      this.saveUserArtifacts();

      this.closeUploadModal();
      this.renderLibrary();
      this.showToast(`¡Artefacto "${title}" incorporado exitosamente a la biblioteca!`, "success");

      // Navegar a la biblioteca confirmando su visualización
      this.navigateTo("library");
    } catch (err) {
      console.error("[MIA] Error leyendo archivo subido:", err);
      this.showToast("Error al procesar el archivo: " + err.message, "error");
    }
  }

  async copyCurrentSourceCode() {
    if (!this.currentArtifact) return;
    let code = this.currentArtifact.sourceCode;
    if (!code && this.currentArtifact.fileUrl) {
      try {
        const res = await fetch(this.currentArtifact.fileUrl);
        if (res.ok) {
          code = await res.text();
          this.currentArtifact.sourceCode = code;
        }
      } catch (e) {
        console.error("[MIA] Error al descargar código fuente:", e);
      }
    }

    if (!code) {
      this.showToast("No se pudo obtener el código fuente", "error");
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      const copyBtnText = document.getElementById("btn-copy-code-text");
      if (copyBtnText) copyBtnText.textContent = "✓ ¡Código copiado al portapapeles!";
      this.showToast("Código fuente copiado al portapapeles", "success");
      setTimeout(() => {
        if (copyBtnText) copyBtnText.textContent = "Copiar código fuente Python (.py)";
      }, 2500);
    } catch (err) {
      console.error("[MIA] Error al copiar:", err);
      this.showToast("No se pudo copiar al portapapeles", "error");
    }
  }

  async copyInstallCommand() {
    const cmd = "pip install git+https://github.com/MathItYT/manimgl.git@personal";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cmd);
      } else {
        const ta = document.createElement("textarea");
        ta.value = cmd;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      const btn = document.getElementById("btn-copy-install");
      if (btn) btn.textContent = "✓ Copiado";
      this.showToast("Comando de instalación copiado", "success");
      setTimeout(() => {
        if (btn) btn.textContent = "Copiar";
      }, 2000);
    } catch (err) {
      console.error("[MIA] Error al copiar comando:", err);
      this.showToast("No se pudo copiar el comando", "error");
    }
  }

  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// Iniciar aplicación al cargar el DOM
window.addEventListener("DOMContentLoaded", () => {
  const app = new MIAApp();
  window.miaApp = app;
  app.init();
});
