const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const ACCOUNT_ID = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';
const USER_ID = '71523537-0541-4ab6-845e-7c576819f881'; // Marcelle Profissional auth.users.id

async function run() {
  await client.connect();

  console.log("Cleaning old messages/conversations for Marcelle account...");
  await client.query(`
    DELETE FROM messages 
    WHERE conversation_id IN (SELECT id FROM conversations WHERE account_id = $1)
  `, [ACCOUNT_ID]);
  await client.query(`DELETE FROM conversations WHERE account_id = $1`, [ACCOUNT_ID]);

  console.log("Seeding conversations and messages...");

  const contactsRes = await client.query("SELECT id, name FROM contacts WHERE account_id = $1;", [ACCOUNT_ID]);
  const contacts = contactsRes.rows;

  const data = [
    {
      name: "Juliana Costa",
      status: "open",
      unread_count: 0,
      messages: [
        { sender: "agent", text: "Olá Juliana! Tudo bem? Passando para confirmar seu procedimento de Botox amanhã às 14h. Está de pé? 😊", timeOffset: -60 },
        { sender: "customer", text: "Oi Marcelle, tudo ótimo! Sim, está confirmado sim. Até amanhã!", timeOffset: -30 },
        { sender: "agent", text: "Perfeito! Até amanhã. Qualquer dúvida estou à disposição.", timeOffset: -10 }
      ]
    },
    {
      name: "Mariana Neves",
      status: "open",
      unread_count: 2,
      messages: [
        { sender: "customer", text: "Oi, gostaria de saber os valores do pacote de Drenagem Linfática.", timeOffset: -120 },
        { sender: "agent", text: "Olá Mariana! Tudo bem? Nosso pacote com 5 sessões está saindo por R$ 450,00, e com 10 sessões R$ 800,00. Podemos agendar?", timeOffset: -90 },
        { sender: "customer", text: "Gostei! Quero o de 5 sessões.", timeOffset: -15 },
        { sender: "customer", text: "Tem horário para sexta-feira à tarde?", timeOffset: -10 }
      ]
    },
    {
      name: "Ellen Barros",
      status: "pending",
      unread_count: 0,
      messages: [
        { sender: "customer", text: "Oi Dra, o preenchimento ficou lindo! Mas sinto um pouquinho inchado ainda, é normal?", timeOffset: -300 },
        { sender: "agent", text: "Oi Ellen! Que ótimo que gostou! O inchaço é super normal nos primeiros 3 a 5 dias. Continue com as compressas frias e me avise se sentir dor, tá bom?", timeOffset: -240 },
        { sender: "customer", text: "Ah, que bom! Fico mais tranquila. Obrigada!", timeOffset: -180 }
      ]
    },
    {
      name: "Aline Targino",
      status: "closed",
      unread_count: 0,
      messages: [
        { sender: "agent", text: "Olá Aline! Como está a cicatrização após o microagulhamento?", timeOffset: -600 },
        { sender: "customer", text: "Oi Marcelle, está super tranquila. A pele já descamou e está bem macia.", timeOffset: -540 },
        { sender: "agent", text: "Excelente! Não esqueça do protetor solar de 3 em 3 horas.", timeOffset: -480 }
      ]
    },
    {
      name: "Fernanda Soares",
      status: "open",
      unread_count: 1,
      messages: [
        { sender: "customer", text: "Oi! Tem vaga para limpeza de pele hoje às 17h?", timeOffset: -80 },
        { sender: "agent", text: "Olá Fernanda! Para hoje infelizmente já estamos sem horários, mas tenho amanhã às 10h ou 15h. Algum desses atende você?", timeOffset: -70 },
        { sender: "customer", text: "Amanhã às 10h seria perfeito!", timeOffset: -5 }
      ]
    }
  ];

  for (const item of data) {
    const contact = contacts.find(c => c.name === item.name);
    if (!contact) {
      console.log(`Contact not found: ${item.name}`);
      continue;
    }

    const lastMsg = item.messages[item.messages.length - 1];
    const lastMsgTime = `NOW() + interval '${lastMsg.timeOffset} minutes'`;

    // 1. Insert Conversation
    const convRes = await client.query(`
      INSERT INTO conversations (id, user_id, contact_id, status, last_message_text, last_message_at, unread_count, account_id, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        ${lastMsgTime},
        $5,
        $6,
        NOW() - interval '2 days',
        NOW()
      )
      RETURNING id;
    `, [USER_ID, contact.id, item.status, lastMsg.text, item.unread_count, ACCOUNT_ID]);

    const convId = convRes.rows[0].id;
    console.log(`Created conversation for ${item.name} with ID: ${convId}`);

    // 2. Insert Messages
    for (const msg of item.messages) {
      const msgId = 'msg_' + Math.random().toString(36).substr(2, 9);
      await client.query(`
        INSERT INTO messages (id, conversation_id, sender_type, content_type, content_text, status, created_at, message_id)
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          'text',
          $3,
          'read',
          NOW() + interval '${msg.timeOffset} minutes',
          $4
        );
      `, [convId, msg.sender, msg.text, msgId]);
    }
    console.log(`  Seeded ${item.messages.length} messages.`);
  }

  // Set whatsapp_config status to 'connected' for Marcelle account if not set
  console.log("Ensuring whatsapp_config status is connected...");
  const waConfig = await client.query("SELECT * FROM whatsapp_config WHERE account_id = $1;", [ACCOUNT_ID]);
  if (waConfig.rows.length === 0) {
    await client.query(`
      INSERT INTO whatsapp_config (id, user_id, status, connected_at, created_at, updated_at, account_id, provider_type, uazapi_instance_name)
      VALUES (
        gen_random_uuid(),
        $1,
        'connected',
        NOW(),
        NOW(),
        NOW(),
        $2,
        'uazapi',
        'Marcelle Profissional'
      )
    `, [USER_ID, ACCOUNT_ID]);
  } else {
    await client.query("UPDATE whatsapp_config SET status = 'connected' WHERE account_id = $1;", [ACCOUNT_ID]);
  }
  console.log("WhatsApp config ensured connected!");

  await client.end();
}

run().catch(console.error);
