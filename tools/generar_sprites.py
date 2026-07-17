#!/usr/bin/env python3
"""
generar_sprites.py — genera los sprites de PATRULLAS con Nano Banana
(Gemini image), reutilizando el flujo de katana_fight (misma clave).

Por personaje genera UNA hoja horizontal de 4 poses sobre magenta puro:
  parado | caminando | atacando | herido
y la parte en 4 celdas con transparencia (chroma-key) →
  assets/sprites/<id>_parado.png · _camina.png · _ataca.png · _herido.png
El retrato de los diálogos usa la pose "parado" ampliada.

  python3 tools/generar_sprites.py            # todos los que falten
  python3 tools/generar_sprites.py lider sapo # solo esos (regenera)
"""
import io
import os
import sys
import time

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(HERE, '..', 'assets', 'sprites')
CRUDOS = os.path.join(HERE, 'ai_raw')
ENVS = [
    '/home/igor/workspace/proyectos/juegos/sueños-juegos/katana_fight/.env',
    '/home/igor/workspace/proyectos/juegos/sueños-juegos/generate_sprites/.env',
]
MODELOS = [
    'gemini-3.1-flash-lite-image',   # Nano Banana 2 Lite (mismo primario que katana_fight)
    'gemini-2.5-flash-image',        # respaldo estable
]

POSES = ['parado', 'camina', 'ataca', 'herido']

# Estilo común: debe leerse bien a ~40 px de alto en el isométrico oscuro del juego
ESTILO = (
    'Clean 2D videogame character sprite, chibi proportions (big head, short body), '
    'FULL BODY standing on invisible ground, SIDE VIEW facing RIGHT, flat cel-shaded '
    'colors with bold dark outlines, slightly gritty urban Latin American neighborhood '
    'style, muted palette with one accent color, no text, no watermark, no ground shadow.'
)

PLANTILLA = (
    '{estilo}\n\n'
    'A sprite sheet of EXACTLY 4 poses of THE SAME character, arranged in ONE '
    'HORIZONTAL ROW, evenly spaced, same scale, all facing RIGHT:\n'
    '1) standing idle relaxed\n'
    '2) mid-step walking\n'
    '3) attacking with their weapon (weapon forward)\n'
    '4) hurt, flinching backwards\n'
    'CHARACTER: {desc}\n'
    'BACKGROUND: the ENTIRE background is flat solid pure magenta #FF00FF, no shadows, no floor.'
)

# Apariencias (coherentes con los colores vectoriales de js/render.js)
PERSONAJES = {
    'lider':     'Doña Ruth, a tough 58-year-old Chilean neighborhood matriarch, grey hair in a bun, magenta cardigan over dark dress, holding a wooden stick, cyan armband',
    'tecnico':   'Maicol, a skinny 19-year-old Chilean tech kid, teal hoodie, cyan cap, jeans, holding a taser and a smartphone, cyan armband',
    'flaco':     'El Flaco Andrés, a lean weathered Chilean fisherman in his 30s, pale beanie, mustard-yellow worn jacket, dark pants, holding a sling with stones, cyan armband',
    'vecino':    'a random Chilean neighbor volunteer, green jacket, cap, jeans, holding a wooden stick, cyan armband',
    'dron':      'a small grey quadcopter delivery drone with two visible spinning rotors, a glowing cyan camera eye and a cyan stripe, hovering (this one FLIES, no legs)',
    'soldado':   'a narco gang foot soldier, red bandana over face, dark red jacket, black pants, holding a machete',
    'pistolero': 'a narco gang gunman, purple hoodie with hood up, holding a small pistol sideways',
    'sapo':      'a shifty nervous neighborhood informant, olive drab jacket, flat cap, hands in pockets, looking sideways',
    'vendedor':  'a narco boss street dealer, black tracksuit, gold chain, gold-trimmed cap, arrogant pose, holding a pistol',
    'scooter':   'a young gang member standing ON an electric kick scooter, brown jacket, dark cap, holding a knife',
    'policia':   'a Chilean carabinero police officer, dark green uniform and peaked cap, holding a pistol',
    'yonki':     'a haggard pasta base street junkie zombie-like figure, torn grey hoodie, hunched posture, wild hair, holding a rock in each hand',
}


def cargar_clave():
    clave = os.environ.get('GOOGLE_API_KEY')
    if clave:
        return clave.strip()
    for ruta in ENVS:
        try:
            with open(ruta) as f:
                for linea in f:
                    if linea.startswith('GOOGLE_API_KEY='):
                        return linea.split('=', 1)[1].strip()
        except FileNotFoundError:
            continue
    raise RuntimeError('GOOGLE_API_KEY no encontrada')


def generar_imagen(cliente, prompt):
    from google.genai import types
    ultimo = None
    for modelo in MODELOS:
        for intento in range(2):
            try:
                r = cliente.models.generate_content(
                    model=modelo, contents=[prompt],
                    config=types.GenerateContentConfig(response_modalities=['Image']),
                )
                partes = r.parts or (r.candidates and r.candidates[0].content.parts) or []
                for parte in partes:
                    if parte.inline_data is not None:
                        img = Image.open(io.BytesIO(parte.inline_data.data))
                        print(f'    ✔ {modelo}: {img.size[0]}x{img.size[1]}')
                        return img
                print(f'    … {modelo}: sin imagen (intento {intento + 1})')
            except Exception as e:
                ultimo = e
                print(f'    ⚠ {modelo}: {str(e)[:90]}')
                time.sleep(2)
    raise RuntimeError(f'todos los modelos fallaron: {ultimo}')


def quitar_magenta(im, umbral=120):
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((r - 255) ** 2 + g ** 2 + (b - 255) ** 2) ** 0.5
            if d < umbral or (r > 160 and b > 160 and g < 120 and abs(r - b) < 80):
                px[x, y] = (0, 0, 0, 0)
    return im


def partir_hoja(hoja):
    """Corta la fila de 4 poses en celdas iguales y recorta cada una a su bbox."""
    w, h = hoja.size
    celdas = []
    for i in range(4):
        celda = hoja.crop((w * i // 4, 0, w * (i + 1) // 4, h))
        bb = celda.getbbox()
        celdas.append(celda.crop(bb) if bb else celda)
    return celdas


def generar(cid, cliente):
    print(f'\n🎨 {cid.upper()}')
    prompt = PLANTILLA.format(estilo=ESTILO, desc=PERSONAJES[cid])
    cruda = generar_imagen(cliente, prompt)
    os.makedirs(CRUDOS, exist_ok=True)
    cruda.convert('RGB').save(os.path.join(CRUDOS, f'{cid}_raw.png'))
    hoja = quitar_magenta(cruda)
    os.makedirs(SALIDA, exist_ok=True)
    for pose, celda in zip(POSES, partir_hoja(hoja)):
        # normalizar a 96 px de alto (el juego escala al dibujar)
        if celda.height > 10:
            nw = max(1, round(celda.width * 96 / celda.height))
            celda = celda.resize((nw, 96), Image.LANCZOS)
        celda.save(os.path.join(SALIDA, f'{cid}_{pose}.png'))
    print(f'    → assets/sprites/{cid}_(parado|camina|ataca|herido).png')


def main():
    pedidos = [a for a in sys.argv[1:] if a in PERSONAJES]
    if sys.argv[1:] and not pedidos:
        print('ids válidos:', ', '.join(PERSONAJES))
        return
    from google import genai
    cliente = genai.Client(api_key=cargar_clave())
    fallas = []
    for cid in (pedidos or PERSONAJES):
        # sin argumentos: solo genera los que faltan (no gasta de más)
        if not pedidos and os.path.exists(os.path.join(SALIDA, f'{cid}_parado.png')):
            print(f'· {cid}: ya existe, lo salto')
            continue
        try:
            generar(cid, cliente)
        except Exception as e:
            fallas.append(cid)
            print(f'    ✖ {cid}: {str(e)[:120]}')
    print('\nLISTO' + (f' (fallaron: {", ".join(fallas)})' if fallas else ' (todo ok)'))


if __name__ == '__main__':
    main()
