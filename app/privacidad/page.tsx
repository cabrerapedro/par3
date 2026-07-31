import type { Metadata } from 'next'
import Link from 'next/link'
import { Wordmark } from '@/components/Wordmark'

// Privacy notice. Deliberately a plain server-rendered page in Spanish, like
// the landing (see app/layout.tsx: marketing surface is es-only for now).
// The footer links on the landing pointed at "#" — this is the real page.
//
// This is an honest description of what the app does today, written for a
// pilot. It is NOT a substitute for legal review before charging customers.

export const metadata: Metadata = {
  title: 'Privacidad — forat.golf',
  description: 'Qué datos trata forat.golf, con qué finalidad y cómo ejercer tus derechos.',
}

const UPDATED = '31 de julio de 2026'

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b border-rule">
        <div className="max-w-2xl mx-auto px-5 py-5 flex items-center justify-between">
          <Link href="/" className="inline-block">
            <Wordmark size="sm" />
          </Link>
          <Link href="/" className="text-sm text-ink-soft hover:text-ink transition-colors">
            Volver
          </Link>
        </div>
      </header>

      <article className="max-w-2xl mx-auto px-5 py-10 flex flex-col gap-7">
        <div>
          <h1 className="font-display font-semibold text-3xl leading-tight">Privacidad</h1>
          <p className="text-ink-mute text-sm mt-2">Actualizado: {UPDATED}</p>
        </div>

        <p className="text-ink-soft leading-relaxed">
          forat.golf es una herramienta para instructores de golf y sus alumnos. El
          instructor graba vídeos cortos del alumno durante la clase, los anota, y el
          alumno los usa para practicar entre clases. Esta página explica qué datos se
          tratan y cómo ejercer tus derechos.
        </p>

        <Section title="Quién trata tus datos">
          <p>
            El responsable del tratamiento es el instructor o la academia que te ha dado
            de alta y te ha facilitado tu código de acceso. forat.golf actúa como
            proveedor del servicio (encargado del tratamiento) por cuenta de ese
            instructor. Si quieres ejercer cualquier derecho, dirígete en primer lugar a
            tu instructor.
          </p>
        </Section>

        <Section title="Qué datos se tratan">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>Datos de contacto que facilita el instructor: nombre y, si lo aporta, correo o teléfono.</li>
            <li>Vídeos grabados por el instructor durante la clase, y vídeos que el alumno graba al practicar.</li>
            <li>Audio y anotaciones del instructor sobre esos vídeos, y su transcripción.</li>
            <li>
              Datos de postura derivados del vídeo (posiciones de articulaciones y
              medidas calculadas), que se usan para comparar la práctica con la
              referencia del instructor.
            </li>
            <li>Datos de uso: cuándo se practica y resultados de cada intento.</li>
          </ul>
        </Section>

        <Section title="Para qué se usan">
          <p>
            Únicamente para prestar el servicio: que el instructor pueda enseñar y
            hacer seguimiento, y que el alumno pueda practicar con la referencia de su
            instructor. No se venden datos ni se usan para publicidad.
          </p>
          <p>
            El análisis de postura se ejecuta <strong>en el propio dispositivo</strong>: el
            vídeo no se envía a ningún servicio de terceros para analizarlo. Las
            transcripciones de audio y los textos de apoyo se generan con proveedores de
            IA (Anthropic, OpenAI), que los procesan para devolver el resultado y no los
            usan para entrenar sus modelos.
          </p>
        </Section>

        <Section title="Menores de edad">
          <p>
            Si el alumno es menor de 14 años, el instructor debe contar con el
            consentimiento de quien ejerza su patria potestad o tutela antes de darle de
            alta y grabarle. Al crear una ficha de alumno, el instructor confirma que
            dispone de ese permiso.
          </p>
        </Section>

        <Section title="Dónde se guardan y durante cuánto tiempo">
          <p>
            Los datos se alojan en Supabase (infraestructura en la Unión Europea) y el
            servicio se sirve desde Vercel. Se conservan mientras el alumno esté activo
            con su instructor. Cuando el instructor elimina una ficha de alumno o un
            clip, se eliminan sus datos asociados.
          </p>
          <p className="text-ink-mute text-sm">
            Nota honesta sobre el estado actual: durante esta fase de pruebas, el
            borrado de los ficheros de vídeo y audio del almacenamiento aún se realiza de
            forma manual a petición, y no automáticamente al borrar la ficha. Si pides el
            borrado, se hará; estamos automatizándolo.
          </p>
        </Section>

        <Section title="Tus derechos">
          <p>
            Puedes solicitar acceso, rectificación, supresión, limitación, portabilidad y
            oposición respecto a tus datos, así como retirar tu consentimiento en
            cualquier momento. Escribe a tu instructor o a{' '}
            <a href="mailto:hola@forat.golf" className="text-primary hover:underline underline-offset-2">
              hola@forat.golf
            </a>
            . También puedes reclamar ante la Agencia Española de Protección de Datos
            (aepd.es).
          </p>
        </Section>

        <Section title="Cambios">
          <p>
            Si esta política cambia de forma relevante, se avisará dentro de la
            aplicación antes de que el cambio afecte a datos ya recogidos.
          </p>
        </Section>
      </article>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-display font-semibold text-lg">{title}</h2>
      <div className="text-ink-soft leading-relaxed flex flex-col gap-2.5">{children}</div>
    </section>
  )
}
