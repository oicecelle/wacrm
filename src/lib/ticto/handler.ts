import { SupabaseClient } from '@supabase/supabase-js';

export async function handleTictoEvent(db: SupabaseClient, payload: any, clinicId: string) {
  try {
    const ddi = payload.customer?.phone?.ddi || '55';
    const ddd = payload.customer?.phone?.ddd || '';
    const number = payload.customer?.phone?.number || '';
    const phoneRaw = `${ddi}${ddd}${number}`.replace(/\D/g, '');
    const email = payload.customer?.email?.toLowerCase().trim() || null;
    const cpf = payload.customer?.cpf?.replace(/\D/g, '') || null;
    const name = payload.customer?.name || 'Cliente Ticto';

    console.log(`[Ticto Handler] Processing payment status: ${payload.status} for clinic: ${clinicId}`);

    // 1. Find or create Contact
    let contact: any = null;

    if (phoneRaw) {
      const suffix = phoneRaw.length >= 8 ? phoneRaw.slice(-8) : phoneRaw;
      const { data: contactsByPhone } = await db
        .from('contacts')
        .select('*')
        .eq('account_id', clinicId)
        .like('phone', `%${suffix}`);
      if (contactsByPhone && contactsByPhone.length > 0) {
        contact = contactsByPhone.find((c: any) => {
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
      if (data && data.length > 0) {
        contact = data[0];
      }
    }

    if (!contact && cpf) {
      const { data } = await db
        .from('contacts')
        .select('*')
        .eq('account_id', clinicId)
        .eq('cpf', cpf)
        .limit(1);
      if (data && data.length > 0) {
        contact = data[0];
      }
    }

    if (!contact) {
      console.log(`[Ticto Handler] Creating new contact: ${name}`);
      // Find an active user in the clinic to assign as the user_id (not-null constraint)
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
      if (error) {
        console.error('[Ticto Handler] Error creating contact:', error);
        throw error;
      }
      contact = data;
    }

    // Ensure patient exists in patients table to satisfy foreign key constraints
    const { data: existingPatient } = await db
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', contact.id)
      .maybeSingle();

    if (!existingPatient) {
      console.log(`[Ticto Handler] Creating new patient record for contact: ${contact.id}`);
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
      if (patErr) {
        console.error('[Ticto Handler] Error creating patient record:', patErr);
        throw patErr;
      }
    }

    // 2. Insert or update financial transactions
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
      console.log(`[Ticto Handler] Updating existing transaction status to: ${statusMapped}`);
      await db
        .from('financial_transactions')
        .update({
          status: statusMapped,
          value: value,
          method: methodMapped,
          date: txDate
        })
        .eq('id', existingTx.id);
    } else {
      console.log(`[Ticto Handler] Creating new transaction with status: ${statusMapped}`);
      await db
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
    }

    // 3. Register timeline event
    await db.from('contact_timeline').insert({
      account_id: clinicId,
      contact_id: contact.id,
      event_type: 'payment',
      title: `Evento Ticto: ${payload.status}`,
      description: `Status do pedido #${payload.order?.id || ''} alterado para ${payload.status}. Valor: R$ ${value.toFixed(2)}.`,
      metadata: { by: 'Ticto', order_hash: payload.order?.hash }
    });

    // 4. Move Deal CRM Stage if mapped
    const { data: actionMapping } = await db
      .from('ticto_status_actions')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('ticto_status', payload.status)
      .eq('is_active', true)
      .maybeSingle();

    if (actionMapping && actionMapping.action === 'move_stage' && actionMapping.config?.stage_id) {
      const { data: deal } = await db
        .from('deals')
        .select('id')
        .eq('contact_id', contact.id)
        .maybeSingle();

      if (deal) {
        console.log(`[Ticto Handler] Moving deal to CRM stage: ${actionMapping.config.stage_id}`);
        await db
          .from('deals')
          .update({
            stage_id: actionMapping.config.stage_id,
            status: payload.status === 'authorized' ? 'won' : 'open'
          })
          .eq('id', deal.id);

        await db.from('contact_timeline').insert({
          account_id: clinicId,
          contact_id: contact.id,
          event_type: 'deal_stage_change',
          title: 'Etapa do CRM alterada automaticamente via Ticto',
          description: `Negócio movido para a etapa configurada devido ao status de pagamento ${payload.status}.`,
          metadata: { by: 'Ticto', order_hash: payload.order?.hash }
        });
      }
    }

    // 5. Activate Patient Package if product matches
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
          console.log(`[Ticto Handler] Product matched package: ${pkg.name}. Registering active package...`);
          const { data: items } = await db
            .from('package_items')
            .select('sessions')
            .eq('package_id', pkg.id);

          const sessionsTotal = items ? items.reduce((acc: number, cur: any) => acc + (cur.sessions || 0), 0) : 0;
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
  } catch (err) {
    console.error('[Ticto Handler] Error processing event:', err);
    throw err;
  }
}
