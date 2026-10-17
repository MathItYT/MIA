#!/usr/bin/env python3
"""
Pruebas de Aceptación Automatizadas (PA1 - PA8) para MIA (Manim IMC Artifacts)
Ejecuta las pruebas mediante Playwright con Chromium y captura evidencias fotográficas Full HD.
"""

import os
import sys
import time
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

MIA_DIR = Path(__file__).resolve().parent.parent
EVIDENCIAS_DIR = MIA_DIR / "evidencias"
EVIDENCIAS_DIR.mkdir(parents=True, exist_ok=True)

PORT = 8088
URL = f"http://127.0.0.1:{PORT}/index.html"


def run_tests():
    # 1. Iniciar servidor MIA en segundo plano
    server_process = subprocess.Popen(
        [sys.executable, str(MIA_DIR / "serve.py"), "--port", str(PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(1.5)

    try:
        launch_env = os.environ.copy()
        # Coincidencia de dispositivo Vulkan con el adaptador WebGPU de Dawn en Linux
        launch_env["MESA_VK_DEVICE_SELECT"] = "10de:1f9d"

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                env=launch_env,
                args=[
                    "--enable-unsafe-webgpu",
                    "--use-angle=vulkan",
                    "--disable-gpu-blocklist",
                    "--enable-features=Vulkan,UseSkiaRenderer",
                ],
            )
            context = browser.new_context(viewport={"width": 1920, "height": 1080})
            page = context.new_page()

            # Capturar logs de consola del navegador
            page.on("console", lambda msg: print(f"[Browser Console] {msg.type}: {msg.text}"))

            print("==================================================")
            print("EJECUTANDO PRUEBAS DE ACEPTACIÓN — HITO 1 (MIA)")
            print("==================================================")

            # ----------------------------------------------------
            # PA1: Visualización de la biblioteca
            # ----------------------------------------------------
            print("\n[PA1] Visualización de la biblioteca...")
            page.goto(URL)
            page.wait_for_selector("#artifacts-grid .artifact-card")
            time.sleep(1.0)

            cards = page.query_selector_all("#artifacts-grid .artifact-card")
            upload_btn = page.query_selector("#btn-open-upload")
            assert len(cards) >= 2, f"Se esperaban al menos 2 artefactos, encontrados: {len(cards)}"
            assert upload_btn is not None and upload_btn.is_visible(), "El botón de carga debe ser visible"

            pa1_shot = EVIDENCIAS_DIR / "pa1_biblioteca.png"
            page.screenshot(path=str(pa1_shot))
            print(f" -> PA1 APROBADA. Evidencia guardada en: {pa1_shot.name}")

            # ----------------------------------------------------
            # PA2: Navegación hacia un artefacto
            # ----------------------------------------------------
            print("\n[PA2] Navegación hacia un artefacto...")
            first_card = cards[0]
            first_card.click()
            page.wait_for_selector("#view-detail.active")
            time.sleep(0.8)

            detail_title = page.locator("#detail-title").text_content()
            detail_author = page.locator("#detail-author").text_content()
            detail_obj = page.locator("#detail-objective").text_content()
            detail_desc = page.locator("#detail-description").text_content()
            btn_start = page.locator("#btn-start-session")
            btn_back = page.locator("#btn-back-to-library")

            assert len(detail_title.strip()) > 0, "El título debe estar presente"
            assert "Benjamín Ubilla" in detail_author, f"Autor incorrecto: {detail_author}"
            assert len(detail_obj.strip()) > 0, "El objetivo de aprendizaje debe estar presente"
            assert len(detail_desc.strip()) > 0, "La descripción debe estar presente"
            assert btn_start.is_visible(), "El botón de iniciar sesión debe ser visible"
            assert btn_back.is_visible(), "El botón de volver debe ser visible"

            pa2_shot = EVIDENCIAS_DIR / "pa2_navegacion_artefacto.png"
            page.screenshot(path=str(pa2_shot))
            print(f" -> PA2 APROBADA. Evidencia guardada en: {pa2_shot.name}")

            # ----------------------------------------------------
            # PA3: Regreso a la biblioteca
            # ----------------------------------------------------
            print("\n[PA3] Regreso a la biblioteca...")
            btn_back.click()
            page.wait_for_selector("#view-library.active")
            time.sleep(0.5)

            cards_after_back = page.query_selector_all("#artifacts-grid .artifact-card")
            assert len(cards_after_back) >= 2, "La lista de artefactos debe mostrarse nuevamente"

            pa3_shot = EVIDENCIAS_DIR / "pa3_regreso_biblioteca.png"
            page.screenshot(path=str(pa3_shot))
            print(f" -> PA3 APROBADA. Evidencia guardada en: {pa3_shot.name}")

            # ----------------------------------------------------
            # PA4: Inicio y funcionamiento de una sesión interactiva
            # ----------------------------------------------------
            print("\n[PA4] Inicio y funcionamiento de sesión interactiva...")
            # Volver a ingresar al artefacto
            cards_after_back[0].click()
            page.wait_for_selector("#view-detail.active")
            time.sleep(0.5)

            # Iniciar sesión
            page.locator("#btn-start-session").click()
            page.wait_for_selector("#view-session.active")
            page.wait_for_selector("#manim-canvas")

            # Esperar a que WebGPU y Pyodide compilen e inicien la escena interactiva
            page.wait_for_function(
                "document.getElementById('session-status-text') && document.getElementById('session-status-text').textContent.includes('en ejecución')",
                timeout=45000,
            )
            time.sleep(1.5)

            # Realizar interacción con el canvas (arrastre con ratón para rotar cámara 3D)
            canvas = page.locator("#manim-canvas")
            box = canvas.bounding_box()
            assert box is not None, "El canvas debe tener dimensiones válidas"

            start_x = box["x"] + box["width"] / 2
            start_y = box["y"] + box["height"] / 2
            page.mouse.move(start_x, start_y)
            page.mouse.down()
            for offset in range(15, 120, 20):
                page.mouse.move(start_x + offset, start_y - offset // 2)
                time.sleep(0.05)
            page.mouse.up()
            time.sleep(1.0)

            session_close_btn = page.locator("#btn-close-session")
            assert session_close_btn.is_visible(), "El control para cerrar la sesión debe ser visible"

            pa4_shot = EVIDENCIAS_DIR / "pa4_sesion_interactiva.png"
            page.screenshot(path=str(pa4_shot))
            print(f" -> PA4 APROBADA. Evidencia guardada en: {pa4_shot.name}")

            # ----------------------------------------------------
            # PA5: Cierre de la sesión
            # ----------------------------------------------------
            print("\n[PA5] Cierre de la sesión...")
            session_close_btn.click()
            page.wait_for_selector("#view-detail.active")
            time.sleep(0.8)

            assert page.locator("#view-detail").is_visible(), "Debe regresar a la página del mismo artefacto"
            assert page.locator("#detail-title").text_content() == detail_title, "El artefacto activo debe ser el mismo"

            pa5_shot = EVIDENCIAS_DIR / "pa5_cierre_sesion.png"
            page.screenshot(path=str(pa5_shot))
            print(f" -> PA5 APROBADA. Evidencia guardada en: {pa5_shot.name}")

            # Regresar a la biblioteca para las siguientes pruebas
            page.locator("#btn-back-to-library").click()
            page.wait_for_selector("#view-library.active")

            # ----------------------------------------------------
            # PA8: Validación de datos de carga
            # ----------------------------------------------------
            print("\n[PA8] Validación de datos de carga...")
            page.locator("#btn-open-upload").click()
            page.wait_for_selector("#modal-upload.open")
            time.sleep(0.5)

            # Intentar enviar formulario vacío sin adjuntar archivo
            page.locator("#upload-title").fill("")
            page.locator("#upload-objective").fill("")
            page.locator("#upload-desc").fill("")
            page.locator("#btn-submit-upload").click()
            time.sleep(0.5)

            # Verificar que se muestra la alerta de campos faltantes
            error_banner = page.locator("#upload-error-banner")
            assert error_banner.is_visible(), "La plataforma debe informar qué información falta"

            missing_items = page.locator("#upload-error-list li").all_text_contents()
            assert len(missing_items) >= 4, f"Se esperaban mensajes de campos obligatorios faltantes, encontrados: {missing_items}"

            pa8_shot = EVIDENCIAS_DIR / "pa8_validacion_carga.png"
            page.screenshot(path=str(pa8_shot))
            print(f" -> PA8 APROBADA. Evidencia guardada en: {pa8_shot.name}")

            # ----------------------------------------------------
            # PA6: Carga válida de un artefacto
            # ----------------------------------------------------
            print("\n[PA6] Carga válida de un artefacto...")
            test_py_file = MIA_DIR / "artifacts" / "oscilador_armonico.py"
            assert test_py_file.exists(), f"Archivo no encontrado: {test_py_file}"

            page.set_input_files("#upload-file-input", str(test_py_file))
            page.locator("#upload-title").fill("Oscilador Armónico en $\\mathbb{R}^2$")
            page.locator("#upload-author").fill("Benjamín Ubilla")
            page.locator("#upload-objective").fill("Estudiar la conservación de energía mecánica y las trayectorias elípticas en el espacio de fases bidimensional $(x, \\dot{x})$.")
            page.locator("#upload-desc").fill("Simulación interactiva de un oscilador armónico simple en el plano de fases con órbitas cerradas de energía constante.")

            page.locator("#btn-submit-upload").click()
            time.sleep(1.0)

            # Confirmar que el modal se cerró y aparece en la biblioteca
            page.wait_for_selector("#view-library.active")
            library_cards = page.query_selector_all("#artifacts-grid .artifact-card")
            assert len(library_cards) >= 3, f"Se esperaba que el nuevo artefacto aumentara el catálogo a 3, encontrados: {len(library_cards)}"

            pa6_shot = EVIDENCIAS_DIR / "pa6_carga_valida.png"
            page.screenshot(path=str(pa6_shot))
            print(f" -> PA6 APROBADA. Evidencia guardada en: {pa6_shot.name}")

            # ----------------------------------------------------
            # PA7: Consulta y ejecución del artefacto cargado
            # ----------------------------------------------------
            print("\n[PA7] Consulta y ejecución del artefacto cargado...")
            # El nuevo artefacto es el último de la lista
            library_cards[-1].click()
            page.wait_for_selector("#view-detail.active")
            time.sleep(0.8)

            uploaded_title = page.locator("#detail-title").text_content()
            uploaded_author = page.locator("#detail-author").text_content()
            assert "Oscilador Armónico" in uploaded_title, f"Título inesperado: {uploaded_title}"
            assert "Benjamín Ubilla" in uploaded_author, f"Autor inesperado: {uploaded_author}"

            # Iniciar su sesión interactiva
            page.locator("#btn-start-session").click()
            page.wait_for_selector("#view-session.active")
            page.wait_for_selector("#manim-canvas")

            # Esperar a que la escena cargada (Oscilador Armónico) se compile y ejecute en WebGPU
            page.wait_for_function(
                "document.getElementById('session-status-text') && document.getElementById('session-status-text').textContent.includes('en ejecución')",
                timeout=45000,
            )
            time.sleep(2.0)

            assert page.locator("#manim-canvas").is_visible(), "El canvas debe ejecutarse para el artefacto cargado"

            pa7_shot = EVIDENCIAS_DIR / "pa7_ejecucion_artefacto_cargado.png"
            page.screenshot(path=str(pa7_shot))
            print(f" -> PA7 APROBADA. Evidencia guardada en: {pa7_shot.name}")

            # Cerrar sesión final
            page.locator("#btn-close-session").click()
            time.sleep(0.5)

            browser.close()

            print("\n==================================================")
            print("¡TODAS LAS PRUEBAS DE ACEPTACIÓN (PA1-PA8) FUERON APROBADAS SATISFACTORIAMENTE!")
            print("==================================================")

    finally:
        server_process.terminate()
        server_process.wait()


if __name__ == "__main__":
    run_tests()
