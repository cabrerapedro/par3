# forat.golf — Módulos de Escuela (versión simple)

> Mayo 2026. Reemplaza los borradores anteriores de "School Panel" y "School OS Blueprint",
> que eran demasiado complejos. Acá queda solo lo simple, útil desde el día 1, y rápido de construir.
> Sin capa de consistencia entre instructores, sin comisión en el producto, sin captación automatizada.

## Principio de estos módulos

Simple para desarrollar rápido. Útil desde el día 1. AI para automatizar trabajo administrativo o generar una buena experiencia del alumno — nunca avanzado ni complejo. Lo genérico se integra, no se reconstruye. Steve es un profesor mayor, poco techy: si no es obvio, no sirve.

Foco: España. Objetivo: hacer crecer la escuela de Steve.

---

## Módulo 1 — Contactos

**Qué es:** la libreta de alumnos de Steve dentro de la app, en vez de repartida en WhatsApp.

**Versión día 1:**
- Carga rápida de cada alumno: nombre, teléfono/WhatsApp, email, nivel, notas libres.
- Import en lote (que Steve pueda meter todos sus alumnos de una, no de a uno).
- Estado simple por alumno: activo / dormido (se puede setear a mano al principio; más adelante lo infiere la app desde la práctica y las clases).

**Dónde entra AI:** nada complejo todavía. Como mucho, ordenar/limpiar los contactos importados.

**Qué NO hacer ahora:** hándicap, documentos, perfiles ricos, segmentaciones avanzadas. Solo lo necesario para poder contactarlos y reactivarlos.

---

## Módulo 2 — Campañas y reactivación

**Qué es:** escribirle **automáticamente** a grupos de alumnos (sobre todo a los que dejaron de venir) de forma personal, desde la app.

**Versión día 1:**
- Filtros simples: todos, activos, dormidos.
- Mensaje hiperpersonalizado por AI usando lo que la app sabe del alumno (último tema trabajado, tiempo sin venir).
- **Envío automático vía WhatsApp (Kapso)** + email (Resend). La app manda; Steve no copia ni pega. Kapso aporta la Broadcasts API (envío masivo con variables por alumno + tracking) y los webhooks de estado/respuesta.

**Cómo funciona la personalización con envío automático (importante):** el primer mensaje iniciado por el negocio tiene que usar una **plantilla aprobada por Meta** con variables (Kapso gestiona el envío y la aprobación). La AI no escribe libre en ese primer toque — llena las variables de la plantilla (nombre, último tema, días sin venir). Cuando el alumno responde, se abre una ventana de 24h donde sí se puede mandar texto libre generado por AI, y gratis. O sea: plantilla personalizada para abrir, conversación libre una vez que contesta.

**Requisitos (no son código — hay que montarlos antes):**
- Cuenta y proyecto en **Kapso**.
- Un **número dedicado para la escuela** — no el WhatsApp personal de Steve: al conectarlo a la API deja de funcionar como app normal (Kapso ofrece *instant setup* o bring-your-own-Twilio).
- API key del proyecto + phone number ID + webhook configurado.
- Plantillas aprobadas (es/en) y **opt-in de los alumnos** (obligatorio por Meta y por RGPD — se captura en Contactos, lo marca Steve a mano).

**Costo:** por mensaje entregado. En España el marketing es de los más caros de Europa y subió el 1/7/2026; los mensajes "utility" (recordatorios) son mucho más baratos y pueden ser gratis dentro de la ventana de 24h. Para una escuela chica el costo absoluto es bajo, pero conviene clasificar bien las plantillas.

**Qué NO hacer ahora:** newsletters masivos, catálogos, flujos complejos de automatización. Solo reactivación y campañas simples.

---

## Módulo 3 — Agenda / operación

**Qué es:** mejorar el lío actual de WhatsApp + Google Calendar, sin reemplazarle el calendario que ya usa.

**Versión día 1:**
- Integrar Google Calendar (leer su agenda) y ponerle contexto encima: cada hueco sabe quién es el alumno, su nivel y qué tocaba trabajar.
- Grupos implícitos por día + horario: los alumnos que comparten slot son un grupo, sin que Steve cree nada.
- Recordatorios y confirmaciones **automáticos vía WhatsApp (Kapso)** (plantillas "utility" — más baratas o gratis dentro de la ventana de 24h) y/o email.
- Resumen semanal: quién vino, quién faltó, a quién conviene escribir.

**Dónde entra AI:** redacción de recordatorios/confirmaciones; resumen semanal en lenguaje natural; idealmente, agendar desde lenguaje natural ("el jueves a las 5 con Marc").

**Qué NO hacer ahora:** motor de reservas propio, pagos, precios dinámicos, listas de espera. Eso lo tienen Golfmanager/ProAgenda y no es nuestro foco. Integrar, no competir.

---

## Módulo 4 — Experiencia del alumno (journey + registro de clase)

**Qué es:** que el alumno tenga una app que se sienta nueva y cuidada — su journey y el registro de cada clase — para que la escuela se sienta moderna y el alumno progrese con guía.

**Versión día 1:**
- **Journey templates:** Pedro y Steve arman juntos unas pocas plantillas (base: la progresión del principiante de `04-GOLF-DOMAIN-KNOWLEDGE`). Una plantilla es una lista ordenada de focos/clips.
- Steve asigna una plantilla a un alumno y la ajusta con el dedo: saca, reordena, cambia. Lista arrastrable, botones grandes. **Nada de "builder" complejo.**
- **Registro de clase:** cada clase queda guardada con qué se trabajó y los clips/anotaciones de ese día.
- El alumno abre su app y ve: su journey, qué practicar, y la historia de sus clases.

**Dónde entra AI:** generar el resumen de cada clase en lenguaje simple; armar el "practicá esto hoy"; redactar el progreso semanal del alumno. La AI hace lo estándar y repetible; Steve pone el criterio humano de qué trabajar y cuándo avanzar.

**Qué NO hacer ahora:** gamificación, comparación entre alumnos, journey totalmente generado por AI. La plantilla la define el humano; la AI la presenta y acompaña.

---

## Orden sugerido (a confirmar observando a Steve)

1. **Contactos** — es la base de todo y el hook más fácil: Steve mete a todos sus alumnos y ya tiene valor (su libreta ordenada). Habilita el módulo 2.
2. **Campañas y reactivación** — convierte esos contactos en alumnos que vuelven. Impacto directo en hacer crecer la escuela.
3. **Agenda / operación** — quita el dolor diario de WhatsApp + calendario.
4. **Experiencia del alumno** — el journey + registro, que ya se apoya en el core de práctica existente.

El orden real entre 3 y 4 lo decide qué le duele más a Steve — verlo en una sesión de observación con su WhatsApp y su calendario abiertos.

## Próximo paso

Observar a Steve manejando una semana real (WhatsApp + calendario) para confirmar el orden, y arrancar por Contactos.
