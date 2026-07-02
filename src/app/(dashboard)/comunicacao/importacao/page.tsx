'use client';

import { useState, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Users,
  User,
  ArrowRight,
  ArrowLeft,
  Layers,
  Database,
  HelpCircle,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

// Helper to normalize phone numbers (keep digits, add country code fallback if needed)
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  // If it's a Brazilian mobile number without country code (e.g. 11999999999 or 1199999999)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

// Helper to parse dates in DD/MM/YYYY or YYYY-MM-DD format
function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const cleaned = dateStr.trim();
  
  // Format DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [day, month, year] = cleaned.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Format YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
    const [year, month, day] = cleaned.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Fallback to JS parsing if possible
  try {
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  } catch {}
  
  return null;
}

// Helper to parse CSV fields containing quotes
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

// Auto-map detection helpers
function autoDetectField(headers: string[], field: string): string {
  const lowerHeaders = headers.map(h => h.toLowerCase());
  const searchMap: Record<string, string[]> = {
    phone: ['telefone', 'tel', 'phone', 'celular', 'fone', 'whatsapp', 'numero'],
    name: ['nome', 'name', 'cliente', 'paciente', 'usuario', 'nome completo'],
    email: ['email', 'mail', 'e-mail', 'correio'],
    document: ['cpf', 'cnpj', 'documento', 'document', 'rg'],
    birthday: ['aniversario', 'nascimento', 'data de nascimento', 'birthday', 'birth', 'nasc'],
    company: ['empresa', 'company', 'trabalho', 'corporacao'],
    tags: ['tags', 'etiquetas', 'grupos', 'tags_visual'],
  };

  const targets = searchMap[field] || [];
  for (const target of targets) {
    const index = lowerHeaders.indexOf(target);
    if (index >= 0) return headers[index];
  }
  return '';
}

export default function MigrationPage() {
  const { accountId, user } = useAuth();
  const supabase = createClient();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [importType, setImportType] = useState<'patients' | 'contacts' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  
  // Importing states
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{
    success: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Field requirements based on target table
  const fieldsConfig = useMemo(() => {
    if (importType === 'patients') {
      return [
        { key: 'name', label: 'Nome', required: true, desc: 'Nome do paciente' },
        { key: 'phone', label: 'Telefone / Celular', required: true, desc: 'Número com DDD (ex: 11999999999)' },
        { key: 'email', label: 'E-mail', required: false, desc: 'Endereço de correio eletrônico' },
        { key: 'document', label: 'CPF / Documento', required: false, desc: 'Documento nacional de identificação' },
        { key: 'birthday', label: 'Data de Nascimento', required: false, desc: 'Utilizado para felicitações e aniversários' },
        { key: 'tags', label: 'Etiquetas / Tags', required: false, desc: 'Separe as etiquetas por vírgula no arquivo' },
      ];
    } else {
      return [
        { key: 'phone', label: 'Telefone / Celular', required: true, desc: 'Número com DDD (ex: 11999999999)' },
        { key: 'name', label: 'Nome', required: false, desc: 'Nome de contato/lead' },
        { key: 'email', label: 'E-mail', required: false, desc: 'Endereço de e-mail' },
        { key: 'company', label: 'Empresa', required: false, desc: 'Organização ou empresa vinculada' },
        { key: 'tags', label: 'Etiquetas / Tags', required: false, desc: 'Tags para automações ou segmentações' },
      ];
    }
  }, [importType]);

  const handleReset = () => {
    setFile(null);
    setHeaders([]);
    setCsvRows([]);
    setMappings({});
    setResults(null);
    setProgress(0);
    setCurrentStep(1);
    setImportType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    try {
      const text = await selected.text();
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) {
        toast.error('O arquivo CSV deve conter um cabeçalho e pelo menos uma linha de dados.');
        return;
      }

      setFile(selected);
      setResults(null);

      // Parse headers
      const csvHeaders = lines[0].split(',').map(h => h.trim().replace(/["']/g, ''));
      setHeaders(csvHeaders);

      // Parse rows
      const parsedRows: string[][] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          parsedRows.push(parseCsvLine(line));
        }
      }
      setCsvRows(parsedRows);

      // Initial auto-detection mappings
      const initialMappings: Record<string, string> = {};
      const fieldsToMap = importType === 'patients' 
        ? ['name', 'phone', 'email', 'document', 'birthday', 'tags']
        : ['phone', 'name', 'email', 'company', 'tags'];

      fieldsToMap.forEach(field => {
        const match = autoDetectField(csvHeaders, field);
        if (match) {
          initialMappings[field] = match;
        }
      });
      setMappings(initialMappings);
      
      // Advance to mapping step automatically
      setCurrentStep(3);
      toast.success('Planilha processada! Configure o mapeamento das colunas.');
    } catch (err) {
      console.error('Error reading CSV file:', err);
      toast.error('Falha ao processar o arquivo de planilha');
    }
  };

  const handleMappingChange = (field: string, csvHeader: string) => {
    setMappings(prev => ({
      ...prev,
      [field]: csvHeader,
    }));
  };

  // Preview generated based on mappings
  const mappedPreview = useMemo(() => {
    if (csvRows.length === 0 || headers.length === 0) return [];
    
    // Preview first 5 rows
    return csvRows.slice(0, 5).map(row => {
      const mapped: Record<string, string> = {};
      Object.entries(mappings).forEach(([field, header]) => {
        const idx = headers.indexOf(header);
        if (idx >= 0) {
          mapped[field] = row[idx] || '';
        }
      });
      return mapped;
    });
  }, [csvRows, headers, mappings]);

  const canStartImport = useMemo(() => {
    if (!importType) return false;
    const requiredFields = fieldsConfig.filter(f => f.required).map(f => f.key);
    return requiredFields.every(field => !!mappings[field]);
  }, [fieldsConfig, mappings, importType]);

  const runImport = async () => {
    if (!accountId || !user || !importType) {
      toast.error('Não autenticado ou tipo de importação inválido');
      return;
    }
    if (!canStartImport) {
      toast.error('Mapeie os campos obrigatórios primeiro.');
      return;
    }

    setImporting(true);
    setProgress(0);
    setResults(null);

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const chunkSize = 50;
    const totalRows = csvRows.length;

    try {
      // 1) Fetch existing entries to prevent duplicates in batch checks
      let existingPhones = new Set<string>();
      if (importType === 'contacts') {
        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('phone_normalized')
          .eq('account_id', accountId);

        existingPhones = new Set(
          (existingContacts || [])
            .map(c => c.phone_normalized)
            .filter((p): p is string => !!p)
        );
      } else {
        const { data: existingPatients } = await supabase
          .from('patients')
          .select('phone')
          .eq('clinic_id', accountId);

        existingPhones = new Set(
          (existingPatients || [])
            .map(p => normalizePhone(p.phone))
            .filter(p => !!p)
        );
      }

      // Process in chunks of 50
      for (let i = 0; i < totalRows; i += chunkSize) {
        const chunk = csvRows.slice(i, i + chunkSize);
        const rowsToInsert: any[] = [];

        chunk.forEach(row => {
          const rowData: Record<string, any> = {};
          
          Object.entries(mappings).forEach(([field, headerName]) => {
            const headerIdx = headers.indexOf(headerName);
            if (headerIdx >= 0) {
              rowData[field] = row[headerIdx] || null;
            }
          });

          const phone = rowData.phone ? rowData.phone.trim() : '';
          const normalized = normalizePhone(phone);

          if (!normalized) {
            failedCount++;
            return;
          }

          if (existingPhones.has(normalized)) {
            skippedCount++;
            return;
          }

          if (importType === 'patients') {
            const name = rowData.name ? rowData.name.trim() : 'Paciente Importado';
            const birthday = parseDate(rowData.birthday);
            let tagsArray: string[] = [];
            if (rowData.tags) {
              tagsArray = rowData.tags.split(/[,;]/).map((t: string) => t.trim()).filter((t: string) => !!t);
            }

            rowsToInsert.push({
              clinic_id: accountId,
              name,
              phone: rowData.phone || normalized,
              email: rowData.email ? rowData.email.trim() : null,
              document: rowData.document ? rowData.document.trim() : null,
              birthday,
              tags: tagsArray,
            });
          } else {
            const name = rowData.name ? rowData.name.trim() : null;
            let tagsArray: string[] = [];
            if (rowData.tags) {
              tagsArray = rowData.tags.split(/[,;]/).map((t: string) => t.trim()).filter((t: string) => !!t);
            }

            rowsToInsert.push({
              user_id: user.id,
              account_id: accountId,
              phone: rowData.phone || normalized,
              name,
              email: rowData.email ? rowData.email.trim() : null,
              company: rowData.company ? rowData.company.trim() : null,
              tags_visual: tagsArray,
            });
          }

          existingPhones.add(normalized);
        });

        // Batch Insert
        if (rowsToInsert.length > 0) {
          const { error } = await supabase
            .from(importType)
            .insert(rowsToInsert);

          if (error) {
            // Fallback individual inserts
            for (const item of rowsToInsert) {
              const { error: singleError } = await supabase
                .from(importType)
                .insert(item);

              if (singleError) {
                if (singleError.code === '23505') {
                  skippedCount++;
                } else {
                  failedCount++;
                }
              } else {
                successCount++;
              }
            }
          } else {
            successCount += rowsToInsert.length;
          }
        }

        const processedCount = Math.min(i + chunkSize, totalRows);
        setProgress(Math.round((processedCount / totalRows) * 100));
      }

      setResults({
        success: successCount,
        skipped: skippedCount,
        failed: failedCount,
      });

      // Go to final status/report step
      setCurrentStep(4);
    } catch (err) {
      console.error('Error during migration run:', err);
      toast.error('Ocorreu um erro crítico durante a importação.');
    } finally {
      setImporting(false);
    }
  };

  const stepsList = [
    { num: 1, label: 'Destino dos Dados' },
    { num: 2, label: 'Enviar Planilha' },
    { num: 3, label: 'Mapear Colunas' },
    { num: 4, label: 'Resultado' },
  ];

  return (
    <div className="space-y-6 text-left max-w-4xl mx-auto pb-12">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900">Assistente de Migração</h1>
          <p className="text-sm text-neutral-500">
            Siga os passos para migrar seus contatos ou pacientes a partir de planilhas CSV.
          </p>
        </div>
        {file && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={importing}
            className="border-neutral-200 text-xs font-bold text-red-600 hover:bg-red-50 hover:border-red-200 rounded-xl shrink-0"
          >
            Reiniciar Assistente
          </Button>
        )}
      </div>

      {/* Progress Tracker (Stepper) */}
      <div className="grid grid-cols-4 gap-2 bg-neutral-50 p-2.5 rounded-2xl border border-neutral-100/50">
        {stepsList.map(step => {
          const isCurrent = currentStep === step.num;
          const isCompleted = currentStep > step.num;
          
          return (
            <div
              key={step.num}
              className={`flex items-center gap-2 p-2 rounded-xl transition-all ${
                isCurrent 
                  ? 'bg-white shadow-xs border border-neutral-200/60 font-black text-blue-600'
                  : isCompleted
                  ? 'text-emerald-600 font-bold'
                  : 'text-neutral-400 font-medium'
              }`}
            >
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${
                isCurrent 
                  ? 'bg-blue-600 text-white' 
                  : isCompleted 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-neutral-200 text-neutral-600'
              }`}>
                {isCompleted ? '✓' : step.num}
              </span>
              <span className="text-[11px] hidden sm:inline truncate">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* WIZARD CONTAINER */}
      <div className="bg-white rounded-3xl border border-neutral-100 shadow-xs overflow-hidden">
        
        {/* STEP 1: CHOOSE TARGET TABLE */}
        {currentStep === 1 && (
          <div className="p-6 space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-black text-neutral-800">Para onde deseja migrar seus dados?</h2>
              <p className="text-xs text-neutral-500">
                Selecione se os contatos da planilha serão inseridos no fluxo de pacientes ou na lista de contatos do CRM.
              </p>
            </div>

            {/* Visual Cards */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <button
                type="button"
                onClick={() => setImportType('patients')}
                className={`flex flex-col items-left text-left p-5 rounded-2xl border-2 transition-all hover:scale-[1.01] ${
                  importType === 'patients'
                    ? 'border-blue-500 bg-blue-50/10 ring-2 ring-blue-500/10'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-4 ${
                  importType === 'patients' ? 'bg-blue-100 text-blue-600' : 'bg-neutral-100 text-neutral-500'
                }`}>
                  <Users className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-black text-neutral-800">Pacientes</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Ideais para disparos automáticos baseados na agenda clínica (lembretes de consultas, aniversários, retornos).
                </p>
                <ul className="text-[10px] text-neutral-400 space-y-1 mt-3 list-disc list-inside">
                  <li>Agenda médica integrada</li>
                  <li>Disparos automáticos de lembretes</li>
                  <li>Importa Nome, Telefone, CPF, Nascimento e Tags</li>
                </ul>
              </button>

              <button
                type="button"
                onClick={() => setImportType('contacts')}
                className={`flex flex-col items-left text-left p-5 rounded-2xl border-2 transition-all hover:scale-[1.01] ${
                  importType === 'contacts'
                    ? 'border-blue-500 bg-blue-50/10 ring-2 ring-blue-500/10'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-4 ${
                  importType === 'contacts' ? 'bg-blue-100 text-blue-600' : 'bg-neutral-100 text-neutral-500'
                }`}>
                  <User className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-black text-neutral-800">Contatos (Chat / CRM)</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Contatos gerais para marketing, campanhas de disparos em massa, funis de vendas e inbox.
                </p>
                <ul className="text-[10px] text-neutral-400 space-y-1 mt-3 list-disc list-inside">
                  <li>Caixa de Entrada compartilhada</li>
                  <li>Funis de Vendas e CRM</li>
                  <li>Importa Nome, Telefone, E-mail, Empresa e Tags</li>
                </ul>
              </button>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end pt-4 border-t">
              <Button
                onClick={() => setCurrentStep(2)}
                disabled={!importType}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                Próximo Passo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: FILE UPLOAD & INSTRUCTIONS */}
        {currentStep === 2 && (
          <div className="p-6 space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-black text-neutral-800">Envie a sua planilha CSV</h2>
              <p className="text-xs text-neutral-500">
                Selecione o arquivo de dados exportado do seu sistema antigo.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-5">
              {/* Instructions / Help */}
              <div className="md:col-span-2 space-y-4 bg-neutral-50 p-4 rounded-2xl border border-neutral-100 text-xs">
                <h3 className="font-bold text-neutral-700 flex items-center gap-1">
                  <HelpCircle className="h-4 w-4 text-neutral-400" />
                  Instruções do Arquivo
                </h3>
                <ul className="space-y-2 text-neutral-500 leading-relaxed list-decimal list-inside">
                  <li>O arquivo deve estar no formato **CSV (.csv)**.</li>
                  <li>A primeira linha do arquivo deve ser a linha de **cabeçalhos** (nomes das colunas).</li>
                  <li>As linhas seguintes devem conter os dados separados por vírgulas.</li>
                  <li>A coluna de **Telefone** é obrigatória e deve conter números com DDD.</li>
                </ul>
                <div className="p-2.5 bg-blue-500/5 rounded-xl border border-blue-200/30 text-[10px] text-blue-800 font-semibold leading-relaxed">
                  Dica: Nós iremos formatar e normalizar os telefones de forma automática, removendo caracteres especiais.
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div className="md:col-span-3 flex flex-col justify-between">
                <div
                  role="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex-1 border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all hover:bg-neutral-50/50 flex flex-col justify-center items-center ${
                    file ? 'border-blue-300 bg-blue-50/10' : 'border-neutral-200'
                  }`}
                >
                  <Upload className={`h-12 w-12 mb-3 ${file ? 'text-blue-500 animate-pulse' : 'text-neutral-300'}`} />
                  {file ? (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-neutral-800 truncate max-w-xs">{file.name}</p>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                        <FileText className="h-3.5 w-3.5" />
                        {csvRows.length} linhas de dados
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-neutral-700">Selecione ou arraste o arquivo CSV</p>
                      <p className="text-xs text-neutral-400">Clique para abrir o explorador</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-between items-center pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="border-neutral-200 text-xs font-bold text-neutral-600 rounded-xl flex items-center gap-1.5 hover:bg-neutral-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              {file && (
                <Button
                  onClick={() => setCurrentStep(3)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-xl text-xs flex items-center gap-1.5"
                >
                  Mapear Colunas
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: MAPPING & PREVIEW */}
        {currentStep === 3 && (
          <div className="p-6 space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-black text-neutral-800">Associe as colunas de dados</h2>
              <p className="text-xs text-neutral-500">
                Mapeie as propriedades do sistema com as colunas reais presentes no seu CSV.
              </p>
            </div>

            {/* Mappings Form */}
            <div className="grid gap-4 sm:grid-cols-2">
              {fieldsConfig.map(field => {
                const isMapped = !!mappings[field.key];
                return (
                  <div key={field.key} className="space-y-1.5 p-3.5 rounded-2xl bg-neutral-50 border border-neutral-100">
                    <div className="flex justify-between items-center">
                      <div>
                        <label className="text-xs font-black text-neutral-700">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        <p className="text-[10px] text-neutral-400 mt-0.5">{field.desc}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        isMapped ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {isMapped ? 'Vinculado' : 'Ignorado'}
                      </span>
                    </div>
                    <select
                      value={mappings[field.key] || ''}
                      onChange={(e) => handleMappingChange(field.key, e.target.value)}
                      disabled={importing}
                      className="w-full bg-white border border-neutral-200 text-xs text-neutral-700 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">-- Ignorar este campo --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Preview Section */}
            {canStartImport && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Visualização Prévia (Primeiras 5 linhas)
                </h3>
                <div className="overflow-x-auto border border-neutral-100 rounded-2xl bg-neutral-50/20">
                  <Table>
                    <TableHeader className="bg-neutral-50/80">
                      <TableRow>
                        {fieldsConfig.filter(f => !!mappings[f.key]).map(f => (
                          <TableHead key={f.key} className="text-xs font-black text-neutral-500 py-2">
                            {f.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mappedPreview.map((row, idx) => (
                        <TableRow key={idx}>
                          {fieldsConfig.filter(f => !!mappings[f.key]).map(f => (
                            <TableCell key={f.key} className="text-xs text-neutral-600 py-2">
                              {f.key === 'phone' ? normalizePhone(row[f.key]) : row[f.key] || '—'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Progress status if importing */}
            {importing && (
              <div className="space-y-2 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                <div className="flex justify-between items-center text-xs font-bold text-blue-700">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    Processando migração em lotes...
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-between items-center pt-4 border-t">
              <Button
                variant="outline"
                disabled={importing}
                onClick={() => setCurrentStep(2)}
                className="border-neutral-200 text-xs font-bold text-neutral-600 rounded-xl flex items-center gap-1.5 hover:bg-neutral-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar Planilha
              </Button>
              {canStartImport && !importing && (
                <Button
                  onClick={runImport}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
                >
                  Importar {csvRows.length} registros
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: FINAL RESULTS / COMPLETE STATE */}
        {currentStep === 4 && results && (
          <div className="p-6 space-y-6 text-center max-w-lg mx-auto">
            <div className="h-14 w-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-black text-neutral-800">Migração Concluída!</h2>
              <p className="text-xs text-neutral-400">
                A importação da planilha foi processada com sucesso no banco de dados da sua clínica.
              </p>
            </div>

            {/* Counters cards */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-1">
                <span className="block text-xl font-black text-emerald-700">{results.success}</span>
                <span className="block text-[10px] font-bold text-emerald-600">Importados</span>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-1">
                <span className="block text-xl font-black text-amber-700">{results.skipped}</span>
                <span className="block text-[10px] font-bold text-amber-600">Duplicados</span>
              </div>
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl space-y-1">
                <span className="block text-xl font-black text-red-700">{results.failed}</span>
                <span className="block text-[10px] font-bold text-red-600">Falhas</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-400 leading-relaxed bg-neutral-50 p-3 rounded-xl border">
              *Contatos e pacientes duplicados foram ignorados para evitar redundâncias na agenda ou no CRM, mantendo seus dados sempre limpos.
            </p>

            <div className="pt-4 border-t flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                className="border-neutral-200 text-xs font-bold text-neutral-700 rounded-xl hover:bg-neutral-50 px-4 py-2"
              >
                Migrar Nova Planilha
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
