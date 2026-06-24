export function getEnv(key: string, fallback: string): string {
  const raw = process.env[key];
  if (typeof raw !== 'string') return fallback;
  
  let val = raw.trim();
  // Remove wrapping quotes if present (e.g. '"value"')
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1).trim();
  } else if (val.startsWith("'") && val.endsWith("'")) {
    val = val.slice(1, -1).trim();
  }

  if (
    !val ||
    val === '""' ||
    val === "''" ||
    val === 'undefined' ||
    val === 'null' ||
    val.toLowerCase() === 'default' ||
    (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && !val.startsWith('eyJ'))
  ) {
    return fallback;
  }
  
  return val;
}

export function getEnvOptional(key: string): string | undefined {
  const raw = process.env[key];
  if (typeof raw !== 'string') return undefined;
  
  let val = raw.trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1).trim();
  } else if (val.startsWith("'") && val.endsWith("'")) {
    val = val.slice(1, -1).trim();
  }

  if (
    !val ||
    val === '""' ||
    val === "''" ||
    val === 'undefined' ||
    val === 'null' ||
    (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && !val.startsWith('eyJ'))
  ) {
    return undefined;
  }
  
  return val;
}
