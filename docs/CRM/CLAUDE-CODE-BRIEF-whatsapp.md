# Brief para Claude Code — Envío automático por WhatsApp (vía Kapso)

> Contexto: forat.golf agrega envío automático por WhatsApp (campañas de reactivación + recordatorios de clase) desde la app, **usando Kapso como proveedor** (WhatsApp Business Platform gestionada).
> Referencias: módulos 2 y 3 en `08-MODULOS-ESCUELA.md`, Decisión 22 en `05-DECISION-LOG.md`, stack en `02-TECHNICAL-ARCHITECTURE.md`.
> Docs de Kapso: https://docs.kapso.ai — SDK, Broadcasts API, Webhooks.

## Por qué Kapso (y qué NO resuelve)

Kapso es una plataforma sobre la WhatsApp Business Platform. **Resuelve** la plomería: onboarding del número, envío de plantillas y texto, **Broadcasts API** (envío masivo con variables por destinatario + tracking), **webhooks** de entrada/estado con verificación de firma, e inbox con handoff a humano. Baja mucho el código que teníamos que escribir.

Lo que Kapso **NO elimina** (siguen siendo reglas de Meta):
- Hace falta un **número dedicado** para la escuela (no el WhatsApp personal de Steve).
- El primer mensaje iniciado por el negocio = **plantilla aprobada por Meta** con variables. Meta aprueba las plantillas (Kapso las gestiona/envía a aprobación).
- **Ventana de servicio de 24h**: solo dentro de ella se puede mandar texto libre.
- **Opt-in** del alumno obligatorio (Meta + RGPD).
- **Costo por mensaje**: marketing (reactivación) más caro que utility (recordatorios).

## ANTES de codear — prerequisitos que NO son código (los hace Pedro/Steve)

Claude Code no puede hacer estos pasos (son de cuenta Kapso/Meta). Necesita las credenciales resultantes:

1. Crear cuenta en **Kapso** y un proyecto.
2. Conectar/provisionar un **número dedicado para la escuela** (Kapso ofrece *instant setup* o *bring-your-own-Twilio*) — no el WhatsApp personal de Steve.
3. Obtener la **API key del proyecto** (`KAPSO_API_KEY`) y el **phone number ID**.
4. Crear y mandar a **aprobación las plantillas** iniciales: reactivación = categoría *marketing*; recordatorio = categoría *utility*. Con variables (placeholders) para personalizar. En **es y en** (Meta aprueba plantillas por idioma).
5. Configurar un **webhook** en Kapso apuntando a `/api/whatsapp/webhook` y guardar el secreto de verificación de firma.

## Opt-in (Decisión de producto)

El opt-in de los alumnos actuales lo marca **Steve a mano** en Contactos (confirma en persona/por su WhatsApp actual y lo registra con fecha + fuente). No se puede mandar un WhatsApp para pedir el opt-in (haría falta opt-in para ese mismo mensaje). El envío se **bloquea si falta opt-in**.

## Qué construir

1. **Capa de integración Kapso** (`lib/kapso.ts`, server-side): funciones finas sobre el SDK `@kapso/whatsapp-cloud-api` (modo proxy) y/o la Platform API:
   - enviar plantilla aprobada con variables,
   - enviar texto libre dentro de la ventana de 24h,
   - crear/enviar un **Broadcast** para campañas (recipients con `components`/body params por alumno).
2. **Opt-in en Contactos:** campos `whatsapp_opt_in_at` + `whatsapp_opt_in_source` por alumno. Bloquear el envío si falta opt-in.
3. **Sender de campañas (Broadcasts API):** dado un segmento (activos/dormidos), por cada alumno llenar las variables de la plantilla con la Claude API (nombre, último tema trabajado, días sin venir), crear broadcast, agregar recipients, enviar y loguear.
4. **Webhook `/api/whatsapp/webhook`:** verificar firma; procesar `whatsapp.message.received` (respuestas → abrir ventana 24h), `whatsapp.message.{sent,delivered,read,failed}` (estados → actualizar `message_log`) y `whatsapp.conversation.*` (señal de ventana).
5. **Ventana de 24h:** cuando un alumno responde, marcar ventana abierta (`window_expires_at`) y permitir respuestas de texto libre generadas por AI (Claude API) mientras esté abierta.
6. **Recordatorios de clase (módulo 3):** disparados desde la agenda; plantilla *utility*.
7. **Log de mensajes (`message_log`):** enviados/recibidos con estado, categoría (marketing/utility), idioma y `kapso_message_id`.

## Constraints (respetar sí o sí)

- El primer mensaje iniciado por el negocio = **siempre plantilla aprobada con variables**. Nunca texto libre como primer toque.
- Texto libre de AI **solo dentro de la ventana de 24h**.
- **No enviar sin opt-in.**
- Clasificar bien: recordatorios = utility, reactivación = marketing.
- **i18n:** plantillas y variables en el idioma del alumno (es/en). Se envía la plantilla aprobada del idioma correcto.
- **Verificar la firma** de los webhooks de Kapso.
- Secrets solo server-side, nunca en el cliente.

## Variables de entorno (placeholders)

```
KAPSO_API_KEY=                    # API key del proyecto Kapso (X-API-Key)
KAPSO_PHONE_NUMBER_ID=            # número dedicado de la escuela
KAPSO_WEBHOOK_SECRET=             # verificación de firma de webhooks
KAPSO_TEMPLATE_REACTIVATION_ES=   # nombre de la plantilla marketing (es)
KAPSO_TEMPLATE_REACTIVATION_EN=   # nombre de la plantilla marketing (en)
KAPSO_TEMPLATE_REMINDER_ES=       # nombre de la plantilla utility (es)
KAPSO_TEMPLATE_REMINDER_EN=       # nombre de la plantilla utility (en)
```

Referencia técnica:
- Auth Platform API: header `X-API-Key`, base `https://api.kapso.ai/platform/v1`.
- SDK proxy: `new WhatsAppClient({ baseUrl: 'https://app.kapso.ai/api/meta/', kapsoApiKey: process.env.KAPSO_API_KEY })`.
- Broadcasts: `POST /whatsapp/broadcasts` → `POST /broadcasts/{id}/recipients` → `POST /broadcasts/{id}/send` → `GET /broadcasts/{id}` (métricas `sent/delivered/read/responded_count`).

## Fuera de scope ahora

Newsletters masivos, catálogos, botones de compra, flujos de automatización complejos. Solo reactivación + recordatorios simples.
