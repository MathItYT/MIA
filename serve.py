#!/usr/bin/env python3
"""
Servidor HTTP estático para la plataforma Manim IMC Artifacts (MIA)
Configura los encabezados necesarios para WebGPU, WebAssembly y Pyodide (COOP/COEP/CORP).
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import sys
from pathlib import Path


class MIAHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Manejador HTTP con encabezados para WebAssembly / WebGPU multi-hilo."""

    def end_headers(self) -> None:
        # Evitar caché en desarrollo
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # Encabezados de aislamiento para Pyodide / SharedArrayBuffer / WebGPU
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Servir la plataforma MIA (Manim IMC Artifacts).")
    parser.add_argument("--host", default="127.0.0.1", help="Host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Puerto (default: 8000)")
    parser.add_argument(
        "--directory",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Directorio a servir (default: carpeta mia/).",
    )
    args = parser.parse_args()

    directory = args.directory.resolve()
    if not directory.is_dir():
        parser.error(f"El directorio no existe: {directory}")

    handler = functools.partial(MIAHTTPRequestHandler, directory=os.fspath(directory))
    server = http.server.ThreadingHTTPServer((args.host, args.port), handler)

    print(f"=== Manim IMC Artifacts (MIA) ===")
    print(f"Sirviendo directorio: {directory}")
    print(f"Acceso en el navegador: http://{args.host}:{args.port}/index.html")
    print(f"Encabezados de aislamiento WebGPU activos (COOP / COEP / CORP)")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo servidor MIA...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
