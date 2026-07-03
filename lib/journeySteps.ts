import { supabase } from '@/lib/supabase'

// When a clip is recorded ad-hoc (no step chosen), it still belongs to a step:
// we append a new step to the student's LAST-assigned plan, creating a plan
// first if they have none. Returns the journey_item id to link on the clip, or
// null on any failure — a save must never break over this.
export async function ensureAdHocStep(
  studentId: string,
  instructorId: string,
  stepTitle: string,
  defaultPlanName: string,
): Promise<string | null> {
  try {
    // The last-assigned plan (most recent), or create one if the student has none.
    const { data: js } = await supabase
      .from('journeys')
      .select('id')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
    let journeyId: string | undefined = (js?.[0] as { id: string } | undefined)?.id

    if (!journeyId) {
      const { data: nj, error } = await supabase
        .from('journeys')
        .insert({ student_id: studentId, instructor_id: instructorId, name: defaultPlanName, position: 0 })
        .select('id')
        .single()
      if (error || !nj) return null
      journeyId = (nj as { id: string }).id
    }

    const { count } = await supabase
      .from('journey_items')
      .select('id', { count: 'exact', head: true })
      .eq('journey_id', journeyId)

    const { data: item, error: ie } = await supabase
      .from('journey_items')
      .insert({
        student_id: studentId,
        instructor_id: instructorId,
        journey_id: journeyId,
        title: stepTitle,
        position: count ?? 0,
        status: 'todo',
      })
      .select('id')
      .single()
    if (ie || !item) return null
    return (item as { id: string }).id
  } catch {
    return null
  }
}
