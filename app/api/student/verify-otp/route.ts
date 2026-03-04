import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json()
    if (!email || !code) {
      return NextResponse.json({ error: 'Email y código requeridos' }, { status: 400 })
    }

    const clean = email.trim().toLowerCase()
    const cleanCode = code.trim()

    // Find student by email
    const { data: student } = await supabase
      .from('students')
      .select('*')
      .eq('email', clean)
      .single()

    if (!student) {
      return NextResponse.json({ error: 'Código incorrecto o expirado.' }, { status: 401 })
    }

    // Find valid OTP
    const { data: otp } = await supabase
      .from('student_otps')
      .select('id')
      .eq('student_id', student.id)
      .eq('code', cleanCode)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!otp) {
      return NextResponse.json({ error: 'Código incorrecto o expirado.' }, { status: 401 })
    }

    // Mark OTP as used
    await supabase.from('student_otps').update({ used: true }).eq('id', otp.id)

    return NextResponse.json({ student })
  } catch {
    return NextResponse.json({ error: 'Error al verificar el código.' }, { status: 500 })
  }
}
