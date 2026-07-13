const url = 'https://scrhexfcbtdyubehbzml.supabase.co/rest/v1/documents?public_token=eq.doc_demo_botox_token&select=*';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODU0NTcsImV4cCI6MjA4OTQ2MTQ1N30.i-3m5p8w1NCNMtgP3TgoqbioauYWcQsY9imiNxD709o';

async function testFetch() {
  console.log("=== TESTING ANONYMOUS FETCH ===");
  const res = await fetch(url, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    }
  });

  console.log(`Status: ${res.status} ${res.statusText}`);
  const json = await res.json();
  console.log("Response:", JSON.stringify(json, null, 2));
}

testFetch().catch(console.error);
