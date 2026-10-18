from manimlib import *
import numpy as np


class OsciladorArmonicoScene(Scene):
    """
    Artefacto Educativo IMC: Oscilador Armónico y Espacio de Fases
    Autor: Benjamín Ubilla
    Objetivo: Estudiar la conservación de energía mecánica y las trayectorias elípticas
        en el espacio de fases bidimensional (x, \\dot{x}) usando TexText y Tex.

    Instructivo de interacción:
      - Ratón / Puntero:
          * Tecla 'd' + mover ratón: Rotar la cámara en el espacio de fases.
          * Tecla 'f' + mover ratón: Desplazar (pan) el encuadre de la escena.
          * Clic y arrastrar: Trasladar el encuadre del plano de fases (drag to pan).
          * Rueda del ratón: Ajustar la escala de visualización de los ejes coordenados (zoom).
      - Teclado:
          * Tecla 'd': Mantener pulsada mientras se mueve el ratón para rotación de perspectiva.
          * Tecla 'f': Mantener pulsada mientras se mueve el ratón para desplazamiento (pan).
          * Tecla 'r': Restablecer la posición y escala de la cámara a los valores por defecto.
    """

    def construct(self):
        # 1. Configuración de fondo
        self.camera.background_rgba = color_to_rgba("#0b0e14", 1.0)

        # 2. Título conciso, destacado y de gran tamaño
        title = TexText(r"Oscilador Armónico", font_size=48, color=BLUE_B)
        eq = Tex(r"\ddot{x} + \omega^2 x = 0", font_size=32, color=GREY_A)
        header = VGroup(title, eq).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        header.fix_in_frame()
        header.to_corner(UL, buff=0.55)
        self.add(header)

        # 3. Ejes de coordenadas del espacio de fases (x, \dot{x})
        axes = Axes(
            x_range=(-3, 3, 1),
            y_range=(-3, 3, 1),
            width=7,
            height=7,
        )
        axes.set_stroke(GREY_D, width=1.5, opacity=0.7)
        self.add(axes)

        label_x = Tex(r"x \text{ (Posición)}", font_size=22, color=GREY_A)
        label_x.next_to(axes.c2p(3, 0), RIGHT, buff=0.2)
        label_v = Tex(r"\dot{x} \text{ (Velocidad)}", font_size=22, color=GREY_A)
        label_v.next_to(axes.c2p(0, 3), UP, buff=0.2)
        self.add(label_x, label_v)

        # 4. Curvas de nivel de energía constante (órbitas en el espacio de fases)
        orbits = VGroup()
        for r, col in [(0.8, BLUE_D), (1.5, TEAL_C), (2.2, GREEN_C)]:
            orbit = ParametricCurve(
                lambda t: axes.c2p(r * np.cos(t), r * np.sin(t), 0),
                t_range=(0, TAU, 0.05),
                color=col,
                stroke_width=2.5,
            )
            orbits.add(orbit)

        # 5. Punto de fase
        phase_dot = Dot(axes.c2p(2.2, 0, 0), radius=0.12, color=YELLOW)
        orbit_label = Tex(r"E_3 > E_2 > E_1", font_size=22, color=YELLOW_B)
        orbit_label.next_to(axes.c2p(2.2, 2.2), UR, buff=0.2)

        self.play(FadeIn(axes), FadeIn(label_x), FadeIn(label_v), run_time=1.0)
        self.play(ShowCreation(orbits, lag_ratio=0.3), run_time=1.5)
        self.play(FadeIn(phase_dot), FadeIn(orbit_label), run_time=0.8)
        self.wait(0.5)
