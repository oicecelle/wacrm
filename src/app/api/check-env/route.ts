import { NextResponse } from 'next/server';

export async function GET() {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return NextResponse.json({
    supabaseUrl: url,
    supabaseUrlFallback: 'https://scrhexfcbtdyubehbzml.supabase.co',
    supabaseUrlMatch: url === 'https://scrhexfcbtdyubehbzml.supabase.co',
    anonKeyLength: anon.length,
    anonKeyStart: anon.slice(0, 10),
    anonKeyEnd: anon.slice(-10),
    serviceRoleKeyLength: serviceRole.length,
    serviceRoleKeyStart: serviceRole.slice(0, 10),
    serviceRoleKeyEnd: serviceRole.slice(-10),
    encryptionKeyLength: process.env.ENCRYPTION_KEY?.length || 0,
  });
}
