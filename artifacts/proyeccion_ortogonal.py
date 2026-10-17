from manimlib import *
import numpy as np


class ProyeccionOrtogonalScene(ThreeDScene):
    """
    Artefacto Educativo IMC: Proyección Ortogonal en R^3
    Autor: Benjamín Ubilla
    Objetivo: Visualizar geométrica e interactivamente la descomposición de un vector
    en su proyección sobre un subespacio 2D (plano) y su complemento ortogonal usando TexText y Tex.
    """
    always_depth_test = True

    def construct(self):
        # 1. Configuración de fondo y cámara 3D
        self.camera.background_rgba = color_to_rgba("#0b0e14", 1.0)
        self.frame.set_euler_angles(
            theta=-35 * DEG,
            phi=70 * DEG,
        )

        # 2. Título conciso, destacado y de gran tamaño fijado en pantalla
        title = TexText(r"Proyección Ortogonal", font_size=48, color=BLUE_B)
        formula = Tex(r"\vec{v} = \mathrm{proj}_W(\vec{v}) + \vec{v}^\perp", font_size=34, color=GREY_A)
        header = VGroup(title, formula).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        header.fix_in_frame()
        header.to_corner(UL, buff=0.55)
        self.add(header)

        # 3. Ejes tridimensionales con depth testing
        axes = ThreeDAxes(
            x_range=(-4, 4, 1),
            y_range=(-4, 4, 1),
            z_range=(-3, 3, 1),
            width=8,
            height=8,
            depth=6,
        )
        axes.set_stroke(GREY_D, width=1.5, opacity=0.7)
        axes.apply_depth_test()
        self.add(axes)

        # 4. Plano del subespacio W (z = 0, plano xy) con depth testing
        plane_mesh = Square(side_length=6.0)
        plane_mesh.set_fill(BLUE_E, opacity=0.25)
        plane_mesh.set_stroke(BLUE_C, width=1.5, opacity=0.6)
        
        # Cuadrícula interna del plano W
        grid_lines = VGroup()
        for c in np.linspace(-3, 3, 7):
            grid_lines.add(Line(np.array([c, -3, 0]), np.array([c, 3, 0]), stroke_color=BLUE_D, stroke_width=0.8, stroke_opacity=0.4))
            grid_lines.add(Line(np.array([-3, c, 0]), np.array([3, c, 0]), stroke_color=BLUE_D, stroke_width=0.8, stroke_opacity=0.4))
        plane_group = VGroup(plane_mesh, grid_lines)
        plane_group.apply_depth_test()
        self.add(plane_group)

        # Etiqueta LaTeX del subespacio W
        label_w = Tex(r"W = \mathrm{span}\{\vec{e}_1, \vec{e}_2\}", font_size=32, color=BLUE_B)
        label_w.rotate(90 * DEG, RIGHT)
        label_w.move_to(np.array([2.3, -2.4, 0.05]))
        label_w.apply_depth_test()
        self.add(label_w)

        # 5. Vectores: v, proj_W(v) y v_perp con depth testing
        v_coords = np.array([2.5, 2.0, 2.4])
        proj_coords = np.array([2.5, 2.0, 0.0])
        perp_coords = v_coords - proj_coords

        # Vector v (Vector original en amarillo) con Tex
        vec_v = Arrow(ORIGIN, v_coords, color=YELLOW, buff=0, stroke_width=4.5)
        vec_v.apply_depth_test()
        label_v = Tex(r"\vec{v}", font_size=36, color=YELLOW)
        label_v.next_to(v_coords, UR, buff=0.15)
        label_v.rotate(90 * DEG, RIGHT)
        label_v.apply_depth_test()

        # Vector proj_W(v) (Proyección en cian) con Tex
        vec_proj = Arrow(ORIGIN, proj_coords, color=TEAL, buff=0, stroke_width=4.5)
        vec_proj.apply_depth_test()
        label_proj = Tex(r"\mathrm{proj}_W(\vec{v})", font_size=32, color=TEAL)
        label_proj.next_to(proj_coords, DR, buff=0.15)
        label_proj.rotate(90 * DEG, RIGHT)
        label_proj.apply_depth_test()

        # Línea perpendicular de proyección (v_perp) con Tex
        line_perp = DashedLine(proj_coords, v_coords, color=RED_B, stroke_width=2.5, dash_length=0.12)
        line_perp.apply_depth_test()
        label_perp = Tex(r"\vec{v}^\perp", font_size=34, color=RED_B)
        label_perp.next_to((proj_coords + v_coords) / 2, RIGHT, buff=0.15)
        label_perp.rotate(90 * DEG, RIGHT)
        label_perp.apply_depth_test()

        # Indicador de ángulo recto
        s = 0.35
        right_angle = VGroup(
            Line(proj_coords + np.array([-s, 0, 0]), proj_coords + np.array([-s, 0, s]), color=WHITE, stroke_width=1.5),
            Line(proj_coords + np.array([-s, 0, s]), proj_coords + np.array([0, 0, s]), color=WHITE, stroke_width=1.5),
        )
        right_angle.apply_depth_test()

        # 6. Animación de construcción
        self.play(FadeIn(plane_group), FadeIn(axes), run_time=1.0)
        self.play(GrowArrow(vec_v), FadeIn(label_v), run_time=1.2)
        self.play(
            ShowCreation(line_perp),
            FadeIn(label_perp),
            GrowArrow(vec_proj),
            FadeIn(label_proj),
            FadeIn(right_angle),
            run_time=1.5,
        )
        self.wait(0.5)
