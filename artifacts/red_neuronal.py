from manimlib import *
import numpy as np


class RedNeuronalScene(Scene):
    """
    Artefacto Educativo IMC: Red Neuronal Artificial (Perceptrón Multicapa)
    Autor: Benjamín Ubilla
    Objetivo: Visualizar la arquitectura multicapa de una red neuronal profunda,
    sus conexiones sinápticas ponderadas y la formulación de activación por capas usando TexText y Tex.
    """

    def construct(self):
        # 1. Configuración de fondo
        self.camera.background_rgba = color_to_rgba("#080b12", 1.0)

        # 2. Título conciso, destacado y de gran tamaño
        title = TexText(r"Red Neuronal", font_size=48, color=BLUE_B)
        formula = Tex(r"a^{(l)} = \sigma\left(W^{(l)} a^{(l-1)} + b^{(l)}\right)", font_size=32, color=GREY_A)
        header = VGroup(title, formula).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        header.fix_in_frame()
        header.to_corner(UL, buff=0.55)
        self.add(header)

        # 3. Definición de capas: [Capa de entrada, Oculta 1, Oculta 2, Capa de salida]
        layer_sizes = [4, 6, 5, 3]
        layer_tex = [r"a^{(0)} \in \mathbb{R}^4", r"a^{(1)} \in \mathbb{R}^6", r"a^{(2)} \in \mathbb{R}^5", r"a^{(3)} \in \mathbb{R}^3"]
        layer_colors = [BLUE_C, TEAL_C, GREEN_C, ORANGE]
        
        x_positions = np.linspace(-4.5, 4.5, len(layer_sizes))
        layers_nodes = []
        labels_group = VGroup()

        for l_idx, (size, x_pos, tex_label, col) in enumerate(zip(layer_sizes, x_positions, layer_tex, layer_colors)):
            y_positions = np.linspace(-2.6, 1.2, size)
            nodes = []
            
            # Etiqueta LaTeX de la capa arriba de cada columna de nodos
            lbl = Tex(tex_label, font_size=24, color=GREY_A)
            lbl.move_to(np.array([x_pos, 1.85, 0]))
            labels_group.add(lbl)

            for y_pos in y_positions:
                center = np.array([x_pos, y_pos, 0])
                
                # Círculo base con relleno opaco para tapar aristas detrás
                base = Circle(radius=0.28)
                base.set_fill("#080b12", opacity=1.0)
                base.set_stroke(col, width=3.0)
                base.move_to(center)

                # Núcleo interior luminoso
                core = Dot(point=center, radius=0.18, color=col)
                core.set_opacity(0.85)

                node = VGroup(base, core)
                nodes.append(node)

            layers_nodes.append(nodes)

        # 4. Conexiones sinápticas (aristas) — trazadas antes para quedar detrás
        connections = VGroup()
        for l in range(len(layers_nodes) - 1):
            curr_layer = layers_nodes[l]
            next_layer = layers_nodes[l + 1]
            for n1 in curr_layer:
                for n2 in next_layer:
                    dist = np.linalg.norm(n1.get_center() - n2.get_center())
                    op = np.clip(0.18 + 0.15 * np.cos(dist * 1.8), 0.10, 0.45)
                    line = Line(
                        n1.get_center(),
                        n2.get_center(),
                        color=GREY_C,
                        stroke_width=1.2,
                        stroke_opacity=op,
                    )
                    connections.add(line)

        # 5. Agrupación y animación
        all_nodes = VGroup(*[node for layer in layers_nodes for node in layer])

        # Se añaden primero las conexiones y luego los nodos encima
        self.play(ShowCreation(connections, lag_ratio=0.01), run_time=1.2)
        self.play(FadeIn(all_nodes, lag_ratio=0.05), FadeIn(labels_group), run_time=1.0)
        self.wait(0.5)
