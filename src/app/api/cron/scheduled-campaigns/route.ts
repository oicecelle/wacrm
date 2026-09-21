import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/env'
import { runScheduledCampaigns } from '@/lib/automations/scheduled-campaigns'

// GET /api/cron/scheduled-campaigns
// Protected by AUTOMATION_CRON_SECRET header, same as the other cron
// routes. Kept as its own endpoint for isolated testing/monitoring,
// but in practice the automations cron (src/app/api/automations/cron)
// already calls runScheduledCampaigns() on every tick too — a single
// existing cron-job.org entry covers both jobs, no second one needed.
export async function GET(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  const expected = getEnv('AUTOMATION_CRON_SECRET', '')
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = await runScheduledCampaigns()
  return NextResponse.json(results)
}
