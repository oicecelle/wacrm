const fs = require('fs');

const destPath = 'c:/Users/SenetUser/Downloads/MARCELLE-20260617T162810Z-3-001/MARCELLE/wacrm/src/components/ui/appointment-modal.tsx';

let content = fs.readFileSync(destPath, 'utf8');

// 1. profile.clinic_id -> clinicId
content = content.replace(/profile\.clinic_id/g, 'clinicId');

// 2. profile.user_id -> user?.id
content = content.replace(/profile\?\.user_id/g, 'user?.id');
content = content.replace(/profile\.user_id/g, 'user?.id');

// 3. profileName -> (profile?.full_name || "Sistema")
content = content.replace(/profileName/g, '(profile?.full_name || "Sistema")');

// 4. variant="error" -> variant="destructive"
content = content.replace(/variant="error"/g, 'variant="destructive"');

fs.writeFileSync(destPath, content, 'utf8');
console.log("Fixed appointment-modal compilation issues successfully!");
