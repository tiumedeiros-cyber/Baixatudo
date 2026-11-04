/** Nichos sugeridos no Caçador. O usuário também pode digitar qualquer outro. */
export const NICHE_PRESETS = [
  "Estética",
  "Clínica de estética",
  "Clínica odontológica",
  "Dentista",
  "Barbearia",
  "Salão de beleza",
  "Nutricionista",
  "Psicólogo",
  "Fisioterapia",
  "Pet shop",
  "Academia",
  "Personal trainer",
  "Advocacia",
  "Contabilidade",
  "Arquitetura",
  "Imobiliária",
] as const;

/**
 * Termos (sem acento, minúsculos) que marcam nicho de ticket alto.
 * Valem como "contém", então "odontolog" casa com "Clínica Odontológica".
 */
export const DEFAULT_HIGH_TICKET_TERMS: string[] = [
  "estetica",
  "clinica",
  "odontolog",
  "dentista",
  "harmoniza",
  "dermato",
  "nutricion",
  "psicolog",
  "fisioterap",
  "cirurg",
  "advoca",
  "imobiliaria",
  "corretor",
  "arquitet",
  "engenharia",
  "contabil",
];

export const UFS = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
] as const;

export function ufName(uf: string | null | undefined): string | null {
  if (!uf) return null;
  return UFS.find((u) => u.uf === uf.toUpperCase())?.name ?? null;
}
