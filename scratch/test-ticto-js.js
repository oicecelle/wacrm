const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  'https://scrhexfcbtdyubehbzml.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk'
);

const payload = {
  version: "2.0",
  status: "authorized",
  status_date: new Date().toISOString().replace('T', ' ').slice(0, 19),
  token: "ybQmIZCZZOKrgsUGnVWDnhjanKYl0p0Zb6Pe1Keh8mF0xZBmIWLWCrgkd3vorvbemq9vyDPtJdu04l5O8IZTad8DGgUrVbnD7xQJ",
  payment_method: "credit_card",
  order: {
    id: 9999999,
    hash: "TEST_ORDER_HASH_" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    transaction_hash: "TEST_TX_HASH_XYZ",
    paid_amount: 19900,
    installments: 1,
    order_date: new Date().toISOString().replace('T', ' ').slice(0, 19)
  },
  item: {
    product_name: "Pacote Botox de Teste",
    product_id: 12345,
    offer_name: "Oferta de Teste",
    offer_id: 6789,
    amount: 19900
  },
  customer: {
    cpf: "12345678909",
    name: "Marcelle Teste Ticto",
    email: "marcelle_test_ticto@example.com",
    phone: { ddi: "55", ddd: "11", number: "999998888" }
  }
};

async function handleTictoEventJS(db, payload, clinicId) {
  const ddi = payload.customer?.phone?.ddi || '55';
  const ddd = payload.customer?.phone?.ddd || '';
  const number = payload.customer?.phone?.number || '';
  const phoneRaw = `${ddi}${ddd}${number}`.replace(/\D/g, '');
  const email = payload.customer?.email?.toLowerCase().trim() || null;
  const cpf = payload.customer?.cpf?.replace(/\D/g, '') || null;
  const name = payload.customer?.name || 'Cliente Ticto';

  console.log(`[Ticto Handler JS] Processing status: ${payload.status}`);

  // Find or create Contact
  let contact = null;
  if (phoneRaw) {
    const suffix = phoneRaw.length >= 8 ? phoneRaw.slice(-8) : phoneRaw;
    const { data: contactsByPhone } = await db
      .from('contacts')
      .select('*')
      .eq('account_id', clinicId)
      .like('phone', `%${suffix}`);
    if (contactsByPhone && contactsByPhone.length > 0) {
      contact = contactsByPhone.find((c) => {
        const cNorm = c.phone.replace(/\D/g, '');
        return cNorm.endsWith(suffix);
      });
    }
  }

  if (!contact && email) {
    const { data } = await db
      .from('contacts')
      .select('*')
      .eq('account_id', clinicId)
      .eq('email', email)
      .limit(1);
    if (data && data.length > 0) contact = data[0];
  }

  if (!contact) {
    console.log(`Creating contact: ${name}`);
    const { data: cu } = await db
      .from('clinic_users')
      .select('user_id')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .limit(1);
    const defaultUserId = cu && cu.length > 0 ? cu[0].user_id : null;

    const { data, error } = await db
      .from('contacts')
      .insert({
        account_id: clinicId,
        user_id: defaultUserId,
        name: name,
        phone: phoneRaw ? `+${phoneRaw}` : '',
        email: email,
        cpf: cpf
      })
      .select('*')
      .single();
    if (error) throw error;
    contact = data;
  }

  // Ensure patient exists in patients table
  const { data: existingPatient } = await db
    .from('patients')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('id', contact.id)
    .maybeSingle();

  if (!existingPatient) {
    console.log(`Creating new patient record for contact: ${contact.id}`);
    const { error: patErr } = await db
      .from('patients')
      .insert({
        id: contact.id,
        clinic_id: clinicId,
        name: contact.name,
        phone: contact.phone || (phoneRaw ? `+${phoneRaw}` : ''),
        email: contact.email,
        cpf: contact.cpf,
        lead_score: 50,
        tags: ['lead-ticto'],
        stage: 'novo'
      });
    if (patErr) throw patErr;
  }

  // Insert or update transaction
  const value = (payload.item?.amount || payload.order?.paid_amount || 0) / 100;
  const txDate = payload.status_date ? payload.status_date.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const description = `Pedido Ticto #${payload.order?.id || ''} - ${payload.item?.product_name || 'Produto'}`;

  let methodMapped = 'pix';
  if (payload.payment_method === 'credit_card') methodMapped = 'credito';
  else if (payload.payment_method === 'pix') methodMapped = 'pix';
  else if (payload.payment_method === 'bank_slip') methodMapped = 'transferencia';

  let statusMapped = 'pending';
  if (payload.status === 'authorized') statusMapped = 'paid';
  else if (payload.status === 'refused' || payload.status === 'bank_slip_delayed' || payload.status === 'subscription_delayed') statusMapped = 'overdue';

  const { data: existingTx } = await db
    .from('financial_transactions')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('patient_id', contact.id)
    .like('description', `%Pedido Ticto #${payload.order?.id || ''}%`)
    .maybeSingle();

  if (existingTx) {
    const { error } = await db
      .from('financial_transactions')
      .update({
        status: statusMapped,
        value: value,
        method: methodMapped,
        date: txDate
      })
      .eq('id', existingTx.id);
    if (error) console.error("Error updating transaction:", error);
  } else {
    const { error } = await db
      .from('financial_transactions')
      .insert({
        clinic_id: clinicId,
        patient_id: contact.id,
        date: txDate,
        description: description,
        category: 'Integração Ticto',
        method: methodMapped,
        type: 'receita',
        value: value,
        status: statusMapped,
        installments_total: payload.order?.installments || 1,
        installments_paid: payload.status === 'authorized' ? (payload.order?.installments || 1) : 0
      });
    if (error) console.error("Error inserting transaction:", error);
  }

  // Timeline
  await db.from('contact_timeline').insert({
    account_id: clinicId,
    contact_id: contact.id,
    event_type: 'payment',
    title: `Evento Ticto: ${payload.status}`,
    description: `Status do pedido #${payload.order?.id || ''} alterado para ${payload.status}. Valor: R$ ${value.toFixed(2)}.`,
    metadata: { by: 'Ticto', order_hash: payload.order?.hash }
  });

  // Package activation
  if (payload.status === 'authorized') {
    const productName = payload.item?.product_name;
    if (productName) {
      const { data: pkg } = await db
        .from('packages')
        .select('*')
        .eq('account_id', clinicId)
        .ilike('name', `%${productName}%`)
        .maybeSingle();

      if (pkg) {
        const { data: items } = await db
          .from('package_items')
          .select('sessions')
          .eq('package_id', pkg.id);

        const sessionsTotal = items ? items.reduce((acc, cur) => acc + (cur.sessions || 0), 0) : 0;
        const validityDays = pkg.validity_days || 365;
        const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        await db
          .from('patient_packages')
          .insert({
            account_id: clinicId,
            contact_id: contact.id,
            package_id: pkg.id,
            package_name: pkg.name,
            sessions_total: sessionsTotal,
            sessions_used: 0,
            value_paid: value,
            status: 'active',
            expires_at: expiresAt,
            purchased_at: new Date().toISOString()
          });

        await db.from('contact_timeline').insert({
          account_id: clinicId,
          contact_id: contact.id,
          event_type: 'package_activated',
          title: `Pacote Ativado: ${pkg.name}`,
          description: `Pacote de ${sessionsTotal} sessões ativado para o cliente com validade até ${new Date(expiresAt).toLocaleDateString('pt-BR')}.`,
          metadata: { by: 'Ticto', order_hash: payload.order?.hash }
        });
      }
    }
  }

  return contact;
}

async function test() {
  console.log("=== TESTING TICTO WEBHOOK HANDLER JS ===");
  const { data: cl } = await db.from('clinics').select('id').limit(1);
  const clinicId = cl[0].id;

  // Ensure test package exists
  const { data: existingPkg } = await db
    .from('packages')
    .select('id')
    .ilike('name', '%Botox de Teste%')
    .limit(1);

  let pkgId;
  if (existingPkg && existingPkg.length > 0) {
    pkgId = existingPkg[0].id;
  } else {
    const { data: newPkg } = await db
      .from('packages')
      .insert({
        account_id: clinicId,
        name: "Pacote Botox de Teste",
        price: 199,
        validity_days: 90,
        is_active: true
      })
      .select('id')
      .single();
    pkgId = newPkg.id;
  }

  const contact = await handleTictoEventJS(db, payload, clinicId);
  console.log("Successfully processed event!");

  // Verify
  const { data: tx } = await db
    .from('financial_transactions')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', contact.id)
    .like('description', `%${payload.order.id}%`)
    .maybeSingle();

  console.log("Verified Transaction in DB:", tx ? `Yes (Value: R$ ${tx.value}, Status: ${tx.status})` : "No");

  const { data: patPkg } = await db
    .from('patient_packages')
    .select('*')
    .eq('account_id', clinicId)
    .eq('contact_id', contact.id)
    .eq('package_id', pkgId)
    .maybeSingle();

  console.log("Verified Patient Package in DB:", patPkg ? `Yes (${patPkg.package_name})` : "No");

  // Cleanup
  console.log("Cleaning up test records...");
  if (patPkg) await db.from('patient_packages').delete().eq('id', patPkg.id);
  if (tx) await db.from('financial_transactions').delete().eq('id', tx.id);
  if (contact) {
    await db.from('contact_timeline').delete().eq('contact_id', contact.id);
    await db.from('patients').delete().eq('id', contact.id);
    await db.from('contacts').delete().eq('id', contact.id);
  }
  console.log("Cleanup done.");
}

test().catch(console.error);
