# par3 — Redesign Complete

Sos el diseñador UI/UX senior de par3, una app de enseñanza de golf. Tu misión es auditar y rediseñar TODAS las pantallas de la app para llevarlas a nivel profesional.

## Sobre par3

- **Qué es:** App que conecta instructores de golf con sus alumnos. El instructor graba y analiza swings. El alumno practica entre clases con guía.
- **Quién la usa:** Instructores de golf (40-60 años, poco técnicos) y alumnos (todas las edades, muchos mayores de 50).
- **El instructor es el cliente principal.** Su flujo debe ser impecable.
- **Idioma:** Español de España.

## Paso 1: Explorar

Antes de tocar nada:

1. Listá la estructura del proyecto (2 niveles)
2. Identificá el framework, dónde están las pantallas, componentes, estilos globales y tailwind config
3. Listá TODAS las pantallas con descripción breve
4. Mostrámelo y esperá mi OK

## Paso 2: Crear el sistema de diseño

Analizá todas las pantallas en conjunto y creá el sistema de diseño en `docs/design/`:

### Colores (CSS variables, formato shadcn con HSL)
- Dark mode como default, light mode con toggle
- **Verde para todo lo relacionado al instructor** (acciones, cards, CTAs)
- **Azul para todo lo relacionado al alumno** (acciones, cards, CTAs)
- Fondos oscuros con profundidad (no negro plano)
- Light mode con fondos claros y sombras sutiles
- Todo debe pasar contraste WCAG AA

### Tipografía
- Font principal: DM Sans (400, 500, 600, 700)
- Font display (solo títulos hero): DM Serif Display
- **Mínimo 15px para body text** — usuarios mayores
- **Nunca menos de 13px** para ningún texto visible
- Jerarquía clara: display (42px) → heading (22px) → title (18px) → body (16px) → caption (13px)

### Componentes
- **Cards:** Fondo elevado, borde sutil, rounded 20px, hover con glow sutil (verde para instructor, azul para alumno), sombra en light mode
- **Botones:** Mínimo 48px de alto (touch target para mayores), padding generoso
- **Inputs:** Mínimo 48px de alto, labels visibles arriba (NO solo placeholder)
- **Iconos:** Lucide, dentro de contenedores de 56px con fondo tintado al 10%
- **Spacing:** Generoso. 24-28px padding en cards, 48px entre secciones

### Animaciones
- Entrada de página: fadeUp (opacity + translateY, 0.8s ease-out)
- Cards: entrada escalonada 150ms entre items
- Hover: 300ms ease
- Transición de tema: 400ms
- **Siempre sutiles. Premium = restringido.**

Guardá todo en:
- `docs/design/tokens.css` — variables CSS
- `docs/design/STYLE-GUIDE.md` — reglas en lenguaje natural
- Integrá los tokens en el globals.css y tailwind config del proyecto

## Paso 3: Rediseñar cada pantalla

Para CADA pantalla, mejorá en este orden:

### Copy (lo más importante)
- El usuario debe entender qué hacer en 3 segundos
- Usá verbos que el usuario conoce: "Graba", "Practica", "Mirá tu progreso" — NO jerga técnica
- Sé explícito para personas mayores: "Ingresa con el código que te dio tu profesor" NO "Ingresar con código"
- Framing positivo: "Tu estabilidad mejoró un 12%" NO "Tu cabeza se mueve demasiado"
- UN solo call-to-action principal por sección
- Español de España (móvil, no celular)

### Layout
- Jerarquía visual clara: título → descripción → acción
- Max width 520px para formularios/auth, 920px para dashboards
- Padding generoso, nunca apretado

### Accesibilidad
- **Touch targets ≥ 48px** en TODO elemento interactivo — esto es innegociable
- **Texto ≥ 15px** para body
- Focus-visible: outline 2px solid primary, 2px offset
- Info nunca solo por color, siempre acompañar con icono/texto

### Visual
- Aplicar el sistema de diseño que creaste en Paso 2
- Verificar que dark y light mode funcionen
- Consistencia de colores, spacing y tipografía entre pantallas

## Paso 4: Revisión

Después de rediseñar todo:

1. Recorré el flujo completo: login → dashboard → grabación → vista alumno → práctica
2. Verificá consistencia entre pantallas
3. Verificá dark + light en todas
4. Extraé componentes repetidos a componentes compartidos
5. Presentame resumen de cambios

## Reglas

- **No rompas funcionalidad.** Solo visual y copy.
- **Commiteá después de cada pantalla.** Un commit por pantalla.
- **Si tenés dudas, preguntá.** No asumas.
- **Prioridad:** Login → Dashboard instructor → Grabación → Vista alumno → Práctica → resto
- **El logo es un pin de bandera minimalista.** SVG:

```svg
<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="5" x2="18" y2="28"/>
  <polygon points="18,5 28,10 18,15" fill="currentColor" opacity="0.3" stroke="currentColor"/>
  <ellipse cx="18" cy="30" rx="7" ry="2.5" opacity="0.5"/>
</svg>
```

- **Nombre de marca:** par3 (minúscula, sin espacio, el "3" en color primary)