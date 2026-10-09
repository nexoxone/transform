# Partículas controladas con las manos

Esfera de partículas con anillos de colores que respondes a tus manos a través de la webcam.
Usa three.js para el 3D y MediaPipe Hand Landmarker para detectar las manos.

## Cómo abrirlo en VS Code

1. Abre esta carpeta en VS Code (Archivo → Abrir carpeta).
2. Instala la extensión **Live Server** (VS Code te la sugiere al abrir la carpeta).
3. Clic derecho sobre `index.html` → **Open with Live Server**.
4. Acepta el permiso de la cámara en el navegador.

Hay que abrirlo con Live Server (o cualquier servidor local) porque la cámara no funciona
al abrir el archivo directo con doble clic. Necesitas internet, ya que three.js y MediaPipe se cargan desde un CDN.

## Controles

| Gesto | Efecto |
|---|---|
| Dos manos, separarlas o juntarlas | Agranda o encoge la esfera |
| Inclinar la línea entre las dos manos | Inclina la esfera |
| Una mano | La esfera sigue la palma |
| Pellizcar (pulgar + índice) con una mano | Zoom |
| Mano abierta | Las partículas se dispersan y los anillos se abren |
| Puño | Se recogen |

Teclas: **H** esqueletos, **V** vista de la cámara, **C** cambia los colores, **F** pantalla completa.
Sin cámara puedes arrastrar con el mouse y usar la rueda.

## Ajustes rápidos (en `main.js`)

- Cantidad de partículas: `SURF` y `CORE` en `buildSphere`, `RINGS` y `PER` en `buildRings`. Si va lento, bájalas.
- Sensibilidad del zoom: los números de `remap(...)` dentro de `applyHands`.
- Colores: el `setHSL` de la esfera y de los anillos.
