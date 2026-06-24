import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'not set',
    supabaseUrlFallback: 'https://scrhexfcbtdyubehbzml.supabase.co',
    supabaseUrlMatch: process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://scrhexfcbtdyubehbzml.supabase.co',
    anonKeyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0,
    serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    encryptionKeyLength: process.env.ENCRYPTION_KEY?.length || 0,
  });
}
