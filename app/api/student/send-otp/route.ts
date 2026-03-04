import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    const clean = email.trim().toLowerCase()

    // Lookup student by email — always respond { sent: true } to avoid revealing if email exists
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, name')
      .eq('email', clean)
      .single()

    if (studentError) {
      console.log('[send-otp] Student lookup failed:', studentError.message, '| email:', clean)
    }

    if (!student) {
      console.log('[send-otp] No student found for email:', clean)
      return NextResponse.json({ sent: true })
    }

    console.log('[send-otp] Found student:', student.name, '| id:', student.id)

    // Generate 6-digit OTP
    const code = crypto.randomInt(100000, 999999).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Store OTP
    const { error: otpError } = await supabase.from('student_otps').insert({
      student_id: student.id,
      code,
      expires_at: expiresAt,
    })

    if (otpError) {
      console.error('[send-otp] OTP insert failed:', otpError.message)
      return NextResponse.json({ sent: true })
    }

    // Send email
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Sweep <onboarding@resend.dev>'
    console.log('[send-otp] Sending email from:', fromEmail, '| to:', clean)

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: clean,
      subject: 'Tu código de acceso a Sweep',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 0 auto; padding: 32px 24px;">
          <p style="color: #666; font-size: 14px; margin: 0 0 24px;">Hola ${student.name.split(' ')[0]},</p>
          <p style="color: #333; font-size: 14px; margin: 0 0 24px;">Tu código de verificación para entrar a Sweep es:</p>
          <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 0.3em; color: #111;">${code}</span>
          </div>
          <p style="color: #999; font-size: 12px; margin: 0;">Este código expira en 10 minutos. Si no solicitaste este código, ignora este mensaje.</p>
        </div>
      `,
    })

    if (emailError) {
      console.error('[send-otp] Resend error:', emailError)
    } else {
      console.log('[send-otp] Email sent OK:', emailResult)
    }

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[send-otp] Unexpected error:', err)
    return NextResponse.json({ sent: true })
  }
}
